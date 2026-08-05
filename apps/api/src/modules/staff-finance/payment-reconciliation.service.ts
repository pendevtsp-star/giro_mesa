import { createHash } from "node:crypto";
import {
  auditLogs,
  branches,
  operationalOccurrences,
  paymentReconciliationEntries,
  paymentReconciliationImports,
  payments,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

type CanonicalRow = {
  externalKey: string;
  providerReference?: string | undefined;
  nsu?: string | undefined;
  authorizationCode?: string | undefined;
  grossCents: number;
  feeCents: number;
  netCents: number;
  settledAt?: Date | undefined;
  kind: "settlement" | "chargeback";
};

@Injectable()
export class PaymentReconciliationService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async importCanonicalCsv(
    context: TenantContext,
    input: { branchId: string; csv: string; source?: string | undefined },
  ) {
    await this.assertBranch(context, input.branchId);
    if (!context.userId) throw new BadRequestException("Authenticated user is required");
    const userId = context.userId;
    if (Buffer.byteLength(input.csv, "utf8") > 5 * 1024 * 1024)
      throw new BadRequestException("Reconciliation file is too large");
    const normalized = input.csv
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .trim();
    const checksum = createHash("sha256").update(normalized).digest("hex");
    const source = input.source?.trim() || "giromesa_csv";
    const rows = parseCanonicalCsv(normalized);
    if (!rows.length) throw new BadRequestException("Reconciliation file has no entries");
    if (rows.length > 10_000)
      throw new BadRequestException("Reconciliation file exceeds 10000 entries");
    return this.database.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(paymentReconciliationImports)
        .where(
          and(
            eq(paymentReconciliationImports.tenantId, context.tenantId),
            eq(paymentReconciliationImports.branchId, input.branchId),
            eq(paymentReconciliationImports.source, source),
            eq(paymentReconciliationImports.checksum, checksum),
          ),
        )
        .limit(1);
      if (existing) return { ...existing, duplicate: true };
      const candidatePayments = await tx
        .select()
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, context.tenantId),
            eq(payments.branchId, input.branchId),
            eq(payments.paymentType, "charge"),
            eq(payments.status, "confirmed"),
          ),
        );
      const matches = rows.map((row) => {
        const candidates = candidatePayments.filter((payment) => {
          if (payment.amountCents !== row.grossCents) return false;
          const metadata = payment.metadata ?? {};
          const referenceMatch =
            row.providerReference && payment.providerReference === row.providerReference;
          const nsuMatch = row.nsu && metadata.nsu === row.nsu;
          const authMatch =
            row.authorizationCode && metadata.authorizationCode === row.authorizationCode;
          return Boolean(referenceMatch || nsuMatch || authMatch);
        });
        return { row, candidates };
      });
      const [createdImport] = await tx
        .insert(paymentReconciliationImports)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          source,
          checksum,
          status: "processed",
          summary: { rows: rows.length },
          createdByUserId: userId,
        })
        .returning();
      if (!createdImport) throw new Error("Failed to create reconciliation import");
      let matched = 0;
      let divergent = 0;
      let unmatched = 0;
      for (const { row, candidates } of matches) {
        const status =
          row.kind === "chargeback" || candidates.length > 1
            ? "divergent"
            : candidates.length === 1
              ? "matched"
              : "unmatched";
        if (status === "matched") matched += 1;
        else if (status === "divergent") divergent += 1;
        else unmatched += 1;
        const [entry] = await tx
          .insert(paymentReconciliationEntries)
          .values({
            tenantId: context.tenantId,
            branchId: input.branchId,
            importId: createdImport.id,
            paymentId: status === "matched" ? candidates[0]?.id : null,
            externalKey: row.externalKey,
            providerReference: row.providerReference,
            nsu: row.nsu,
            authorizationCode: row.authorizationCode,
            grossCents: row.grossCents,
            feeCents: row.feeCents,
            netCents: row.netCents,
            settledAt: row.settledAt,
            status,
            resolution: { kind: row.kind, candidateCount: candidates.length },
          })
          .returning();
        if (entry && status !== "matched") {
          const idempotencyKey = `reconciliation:${createdImport.id}:${row.externalKey}`;
          const [occurrence] = await tx
            .insert(operationalOccurrences)
            .values({
              tenantId: context.tenantId,
              branchId: input.branchId,
              type: "payment_reconciliation_divergence",
              initialReport:
                row.kind === "chargeback"
                  ? `Chargeback recebido para ${row.externalKey}`
                  : `Conferência sem correspondência única para ${row.externalKey}`,
              idempotencyKey,
              idempotencyPayloadHash: createHash("sha256")
                .update(JSON.stringify({ importId: createdImport.id, row }))
                .digest("hex"),
              createdByUserId: userId,
            })
            .onConflictDoNothing()
            .returning();
          if (occurrence) {
            await tx
              .update(paymentReconciliationEntries)
              .set({ occurrenceId: occurrence.id })
              .where(eq(paymentReconciliationEntries.id, entry.id));
          }
        }
      }
      const summary = { rows: rows.length, matched, divergent, unmatched };
      await tx
        .update(paymentReconciliationImports)
        .set({ summary, updatedAt: new Date() })
        .where(eq(paymentReconciliationImports.id, createdImport.id));
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "payment.reconciliation_imported",
        entityType: "payment_reconciliation_import",
        entityId: createdImport.id,
        metadata: { source, checksum, ...summary },
      });
      return { ...createdImport, summary, duplicate: false };
    });
  }

  async listEntries(
    context: TenantContext,
    input: {
      branchId: string;
      status?: "unmatched" | "matched" | "divergent" | "resolved" | undefined;
    },
  ) {
    await this.assertBranch(context, input.branchId);
    return this.database.db
      .select()
      .from(paymentReconciliationEntries)
      .where(
        and(
          eq(paymentReconciliationEntries.tenantId, context.tenantId),
          eq(paymentReconciliationEntries.branchId, input.branchId),
          ...(input.status ? [eq(paymentReconciliationEntries.status, input.status)] : []),
        ),
      )
      .orderBy(desc(paymentReconciliationEntries.createdAt))
      .limit(500);
  }

  async match(
    context: TenantContext,
    entryId: string,
    input: { paymentId: string; expectedVersion: number; reason: string },
  ) {
    const [entry] = await this.database.db
      .select()
      .from(paymentReconciliationEntries)
      .where(
        and(
          eq(paymentReconciliationEntries.tenantId, context.tenantId),
          eq(paymentReconciliationEntries.id, entryId),
        ),
      )
      .limit(1);
    if (!entry) throw new NotFoundException("Reconciliation entry not found");
    await this.assertBranch(context, entry.branchId);
    const [payment] = await this.database.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, context.tenantId),
          eq(payments.branchId, entry.branchId),
          eq(payments.id, input.paymentId),
          eq(payments.paymentType, "charge"),
          eq(payments.status, "confirmed"),
        ),
      )
      .limit(1);
    if (!payment || payment.amountCents !== entry.grossCents)
      throw new BadRequestException("Payment is not a valid match for this entry");
    return this.resolveEntry(context, entry, {
      status: "matched",
      paymentId: payment.id,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
    });
  }

  async resolve(
    context: TenantContext,
    entryId: string,
    input: {
      expectedVersion: number;
      resolution: "accepted" | "ignored" | "chargeback";
      reason: string;
    },
  ) {
    const [entry] = await this.database.db
      .select()
      .from(paymentReconciliationEntries)
      .where(
        and(
          eq(paymentReconciliationEntries.tenantId, context.tenantId),
          eq(paymentReconciliationEntries.id, entryId),
        ),
      )
      .limit(1);
    if (!entry) throw new NotFoundException("Reconciliation entry not found");
    await this.assertBranch(context, entry.branchId);
    return this.resolveEntry(context, entry, {
      status: "resolved",
      paymentId: entry.paymentId,
      expectedVersion: input.expectedVersion,
      reason: input.reason,
      resolution: input.resolution,
    });
  }

  private async resolveEntry(
    context: TenantContext,
    entry: typeof paymentReconciliationEntries.$inferSelect,
    input: {
      status: "matched" | "resolved";
      paymentId: string | null;
      expectedVersion: number;
      reason: string;
      resolution?: string;
    },
  ) {
    if (!context.userId) throw new BadRequestException("Authenticated user is required");
    const now = new Date();
    const [updated] = await this.database.db
      .update(paymentReconciliationEntries)
      .set({
        status: input.status,
        paymentId: input.paymentId,
        resolution: {
          ...entry.resolution,
          outcome: input.resolution ?? input.status,
          reason: input.reason.trim(),
          previousStatus: entry.status,
        },
        resolvedByUserId: context.userId,
        resolvedAt: now,
        version: input.expectedVersion + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(paymentReconciliationEntries.tenantId, context.tenantId),
          eq(paymentReconciliationEntries.id, entry.id),
          eq(paymentReconciliationEntries.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!updated) throw new ConflictException("Reconciliation entry was updated concurrently");
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: entry.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: `payment.reconciliation_${input.status}`,
      entityType: "payment_reconciliation_entry",
      entityId: entry.id,
      metadata: { before: entry.status, after: input.status, reason: input.reason },
    });
    return updated;
  }

  private async assertBranch(context: TenantContext, branchId: string) {
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)))
      .limit(1);
    if (!branch || (context.branchId && context.branchId !== branchId))
      throw new NotFoundException("Branch not found");
  }
}

export function parseCanonicalCsv(csv: string): CanonicalRow[] {
  const lines = csv.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0] ?? "").map((header) => header.trim().toLowerCase());
  const required = ["external_key", "gross_cents", "fee_cents", "net_cents"];
  if (required.some((header) => !headers.includes(header)))
    throw new BadRequestException(`CSV must include: ${required.join(", ")}`);
  const seen = new Set<string>();
  return lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const field = (name: string) => values[headers.indexOf(name)]?.trim() ?? "";
    const externalKey = field("external_key");
    if (!externalKey || seen.has(externalKey))
      throw new BadRequestException(`Invalid or duplicate external_key on row ${index + 2}`);
    seen.add(externalKey);
    const grossCents = Number(field("gross_cents"));
    const feeCents = Number(field("fee_cents"));
    const netCents = Number(field("net_cents"));
    if (
      ![grossCents, feeCents, netCents].every(Number.isInteger) ||
      grossCents <= 0 ||
      feeCents < 0 ||
      netCents < 0
    )
      throw new BadRequestException(`Invalid monetary value on row ${index + 2}`);
    const settledRaw = field("settled_at");
    const settledAt = settledRaw ? new Date(settledRaw) : undefined;
    if (settledAt && Number.isNaN(settledAt.getTime()))
      throw new BadRequestException(`Invalid settled_at on row ${index + 2}`);
    return {
      externalKey,
      providerReference: field("provider_reference") || undefined,
      nsu: field("nsu") || undefined,
      authorizationCode: field("authorization_code") || undefined,
      grossCents,
      feeCents,
      netCents,
      settledAt,
      kind: field("kind") === "chargeback" ? "chargeback" : "settlement",
    };
  });
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else current += char;
  }
  if (quoted) throw new BadRequestException("CSV contains an unclosed quote");
  values.push(current);
  return values;
}
