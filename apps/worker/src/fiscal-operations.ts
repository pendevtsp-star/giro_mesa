import type * as schema from "@giromesa/db";
import {
  auditLogs,
  fiscalDocuments,
  fiscalOperations,
  fiscalSettings,
  outboxEvents,
} from "@giromesa/db";
import { and, eq, inArray, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

type Db = NodePgDatabase<typeof schema>;
const MAX_ATTEMPTS = 8;

export function fiscalRetryAt(attempt: number, now = Date.now(), random = Math.random) {
  const delay = Math.min(1_000 * 2 ** Math.max(0, attempt - 1), 15 * 60_000);
  return new Date(now + Math.min(Math.round(delay * (0.75 + random() * 0.5)), 15 * 60_000));
}

export async function claimFiscalOperation(db: Db, workerId: string) {
  const now = new Date();
  const [candidate] = await db
    .select()
    .from(fiscalOperations)
    .where(
      and(
        or(
          eq(fiscalOperations.status, "pending"),
          eq(fiscalOperations.status, "retryable"),
          eq(fiscalOperations.status, "processing"),
        ),
        lte(fiscalOperations.availableAt, now),
        or(
          sql`${fiscalOperations.leaseExpiresAt} is null`,
          lte(fiscalOperations.leaseExpiresAt, now),
        ),
      ),
    )
    .orderBy(fiscalOperations.createdAt)
    .limit(1);
  if (!candidate) return null;
  const [claimed] = await db
    .update(fiscalOperations)
    .set({
      status: "processing",
      attempts: sql`${fiscalOperations.attempts} + 1`,
      leaseOwner: workerId,
      leaseExpiresAt: new Date(now.getTime() + 60_000),
      updatedAt: now,
    })
    .where(
      and(
        eq(fiscalOperations.id, candidate.id),
        or(
          sql`${fiscalOperations.leaseExpiresAt} is null`,
          lte(fiscalOperations.leaseExpiresAt, now),
        ),
      ),
    )
    .returning();
  return claimed ?? null;
}

export async function failFiscalOperation(
  db: Db,
  operation: NonNullable<Awaited<ReturnType<typeof claimFiscalOperation>>>,
  code: string,
) {
  const deadLetter = operation.attempts >= MAX_ATTEMPTS;
  await db
    .update(fiscalOperations)
    .set({
      status: deadLetter ? "dead_letter" : "retryable",
      availableAt: fiscalRetryAt(operation.attempts),
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: code,
      errorMessage: code,
      updatedAt: new Date(),
    })
    .where(eq(fiscalOperations.id, operation.id));
  if (operation.fiscalDocumentId)
    await db
      .update(fiscalDocuments)
      .set({ status: deadLetter ? "error" : "pending", errorMessage: code, updatedAt: new Date() })
      .where(eq(fiscalDocuments.id, operation.fiscalDocumentId));
}

export async function processFiscalOperations(db: Db, workerId: string, limit = 25) {
  let processed = 0;
  for (let index = 0; index < limit; index += 1) {
    const operation = await claimFiscalOperation(db, workerId);
    if (!operation) break;
    processed += 1;
    try {
      await processClaimedFiscalOperation(db, operation);
    } catch (error) {
      await failFiscalOperation(db, operation, sanitizeFiscalError(error));
    }
  }
  return { processed };
}

export async function reconcilePendingFiscalDocuments(db: Db, limit = 100) {
  const pending = await db
    .select({
      id: fiscalDocuments.id,
      tenantId: fiscalDocuments.tenantId,
      branchId: fiscalDocuments.branchId,
      environment: fiscalDocuments.environment,
      externalId: fiscalDocuments.externalId,
      updatedAt: fiscalDocuments.updatedAt,
    })
    .from(fiscalDocuments)
    .where(inArray(fiscalDocuments.status, ["pending", "error", "contingency"]))
    .limit(limit);
  let queued = 0;
  for (const document of pending) {
    if (!document.branchId) continue;
    // A reconciliation result can remain uncertain and require another query.
    // Tie the operation to the latest document revision so one query is queued
    // per state transition, while repeated scheduler passes stay idempotent.
    const idempotencyKey = `fiscal:reconcile:${document.id}:${document.updatedAt.getTime()}`;
    const [operation] = await db
      .insert(fiscalOperations)
      .values({
        tenantId: document.tenantId,
        branchId: document.branchId,
        fiscalDocumentId: document.id,
        type: "query",
        environment: document.environment,
        idempotencyKey,
        providerReference: document.externalId ?? document.id.replaceAll("-", ""),
        status: "pending",
      })
      .onConflictDoNothing()
      .returning();
    if (operation) queued += 1;
  }
  return { queued };
}

async function processClaimedFiscalOperation(
  db: Db,
  operation: NonNullable<Awaited<ReturnType<typeof claimFiscalOperation>>>,
) {
  if (!operation.fiscalDocumentId) throw new Error("fiscal_document_required");
  const [row] = await db
    .select({ document: fiscalDocuments, settings: fiscalSettings })
    .from(fiscalDocuments)
    .innerJoin(
      fiscalSettings,
      and(
        eq(fiscalSettings.tenantId, fiscalDocuments.tenantId),
        eq(fiscalSettings.branchId, fiscalDocuments.branchId),
      ),
    )
    .where(
      and(
        eq(fiscalDocuments.tenantId, operation.tenantId),
        eq(fiscalDocuments.id, operation.fiscalDocumentId),
      ),
    )
    .limit(1);
  if (!row) throw new Error("fiscal_document_or_settings_not_found");
  const simulator = row.settings.providerMetadata?.simulator === true;
  if (!simulator) {
    await failClosed(db, operation, "focus_real_not_configured");
    return;
  }
  if (process.env.NODE_ENV === "production" || operation.environment === "production") {
    await failClosed(db, operation, "fiscal_simulator_disabled_in_production");
    return;
  }
  const now = new Date();
  const scenario = String(row.document.payload.simulateFiscalScenario ?? "authorized");
  if (operation.type === "issue" && scenario === "unknown") {
    await db.transaction(async (tx) => {
      await tx
        .update(fiscalOperations)
        .set({
          status: "succeeded",
          leaseOwner: null,
          leaseExpiresAt: null,
          errorCode: "result_unknown_query_queued",
          errorMessage: null,
          updatedAt: now,
        })
        .where(eq(fiscalOperations.id, operation.id));
      await tx
        .update(fiscalDocuments)
        .set({ status: "pending", errorMessage: "result_unknown_query_required", updatedAt: now })
        .where(eq(fiscalDocuments.id, row.document.id));
      const queryKey = `fiscal:query-after-unknown:${row.document.id}`;
      await tx
        .insert(fiscalOperations)
        .values({
          tenantId: operation.tenantId,
          branchId: operation.branchId,
          fiscalDocumentId: row.document.id,
          type: "query",
          environment: operation.environment,
          idempotencyKey: queryKey,
          providerReference: operation.providerReference,
          status: "pending",
          metadata: { sourceOperationId: operation.id },
        })
        .onConflictDoNothing();
      await tx
        .insert(outboxEvents)
        .values({
          tenantId: operation.tenantId,
          topic: "fiscal.operation.pending",
          payload: {
            fiscalDocumentId: row.document.id,
            operationType: "query",
            idempotencyKey: queryKey,
          },
          idempotencyKey: `outbox:${queryKey}`,
        })
        .onConflictDoNothing();
    });
    return;
  }
  if (operation.type === "issue" && scenario === "rejected") {
    await completeOperation(db, operation, row.document.id, {
      documentStatus: "rejected",
      errorCode: "simulator_rejected",
    });
    return;
  }
  if (operation.type === "cancel") {
    const reason = operation.metadata.reason;
    if (typeof reason !== "string" || reason.trim().length < 15) {
      await failClosed(db, operation, "fiscal_cancel_reason_invalid");
      return;
    }
    await completeOperation(db, operation, row.document.id, {
      documentStatus: "canceled",
      canceledAt: now,
    });
    return;
  }
  if (operation.type === "void") {
    await failClosed(db, operation, "fiscal_void_requires_external_homologation");
    return;
  }
  const reference = operation.providerReference;
  await completeOperation(db, operation, row.document.id, {
    documentStatus: "authorized",
    externalId: reference,
    accessKey: simulatorAccessKey(row.document.id, row.document.number),
    xmlUrl: `/simulator/fiscal/${reference}.xml`,
    danfeUrl: `/simulator/fiscal/${reference}.pdf`,
    issuedAt: row.document.issuedAt ?? now,
  });
}

async function completeOperation(
  db: Db,
  operation: NonNullable<Awaited<ReturnType<typeof claimFiscalOperation>>>,
  documentId: string,
  result: {
    documentStatus: "authorized" | "rejected" | "canceled";
    errorCode?: string;
    externalId?: string;
    accessKey?: string;
    xmlUrl?: string;
    danfeUrl?: string;
    issuedAt?: Date;
    canceledAt?: Date;
  },
) {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(fiscalDocuments)
      .set({
        status: result.documentStatus,
        externalId: result.externalId,
        accessKey: result.accessKey,
        xmlUrl: result.xmlUrl,
        danfeUrl: result.danfeUrl,
        issuedAt: result.issuedAt,
        canceledAt: result.canceledAt,
        errorMessage: result.errorCode ?? null,
        updatedAt: now,
      })
      .where(
        and(eq(fiscalDocuments.tenantId, operation.tenantId), eq(fiscalDocuments.id, documentId)),
      );
    await tx
      .update(fiscalOperations)
      .set({
        status: "succeeded",
        leaseOwner: null,
        leaseExpiresAt: null,
        errorCode: result.errorCode ?? null,
        errorMessage: null,
        updatedAt: now,
      })
      .where(eq(fiscalOperations.id, operation.id));
    await tx.insert(auditLogs).values({
      tenantId: operation.tenantId,
      branchId: operation.branchId,
      requestId: "worker-fiscal-operations",
      action: `fiscal.document_${result.documentStatus}`,
      entityType: "fiscal_document",
      entityId: documentId,
      metadata: { operationId: operation.id, operationType: operation.type, simulator: true },
    });
  });
}

async function failClosed(
  db: Db,
  operation: NonNullable<Awaited<ReturnType<typeof claimFiscalOperation>>>,
  code: string,
) {
  await db
    .update(fiscalOperations)
    .set({
      status: "failed",
      leaseOwner: null,
      leaseExpiresAt: null,
      errorCode: code,
      errorMessage: code,
      updatedAt: new Date(),
    })
    .where(eq(fiscalOperations.id, operation.id));
  if (operation.fiscalDocumentId) {
    await db
      .update(fiscalDocuments)
      .set({ status: "error", errorMessage: code, updatedAt: new Date() })
      .where(eq(fiscalDocuments.id, operation.fiscalDocumentId));
  }
}

function simulatorAccessKey(documentId: string, number: number | null) {
  const numeric = `${number ?? 1}${documentId.replace(/\D/g, "")}`;
  return `27${numeric}`.padEnd(44, "0").slice(0, 44);
}

function sanitizeFiscalError(error: unknown) {
  const value = error instanceof Error ? error.message : "fiscal_operation_failed";
  return value
    .replace(/(token|secret|password|pfx)\s*[=:]\s*[^\s,;]+/gi, "$1=[redacted]")
    .slice(0, 120);
}
