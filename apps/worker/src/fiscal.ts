import type * as schema from "@giromesa/db";
import { auditLogs, fiscalDocuments } from "@giromesa/db";
import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createFiscalProvider } from "./fiscal-provider";

type Db = NodePgDatabase<typeof schema>;

export async function processPendingFiscalDocuments(db: Db) {
  const documents = await db
    .select()
    .from(fiscalDocuments)
    .where(eq(fiscalDocuments.status, "pending"))
    .orderBy(fiscalDocuments.createdAt)
    .limit(25);

  for (const document of documents) {
    const [claimed] = await db
      .update(fiscalDocuments)
      .set({
        errorMessage: "processing",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(fiscalDocuments.id, document.id),
          eq(fiscalDocuments.status, "pending"),
          sql`${fiscalDocuments.errorMessage} is distinct from 'processing'`,
        ),
      )
      .returning();

    if (!claimed) {
      continue;
    }

    const shouldReject = claimed.payload.simulateFiscalRejection === true;
    if (shouldReject) {
      await db
        .update(fiscalDocuments)
        .set({
          status: "rejected",
          errorMessage: "mock_rejection",
          updatedAt: new Date(),
        })
        .where(eq(fiscalDocuments.id, claimed.id));
      continue;
    }

    const provider = createFiscalProvider(claimed.provider);
    const providerResult = await provider.issueConsumerInvoice({
      tenantId: claimed.tenantId,
      orderId: claimed.orderId ?? "",
      fiscalDocumentId: claimed.id,
      model: claimed.model as "nfce" | "nfe" | "nfse",
      environment: claimed.environment as "homologation" | "production",
      number: claimed.number,
      payload: claimed.payload,
    });

    if (!providerResult.ok) {
      await db
        .update(fiscalDocuments)
        .set({
          status: providerResult.retryable ? "error" : "rejected",
          errorMessage:
            providerResult.errorMessage ?? providerResult.errorCode ?? "mock_provider_error",
          updatedAt: new Date(),
        })
        .where(eq(fiscalDocuments.id, claimed.id));
      continue;
    }

    const accessKey = providerResult.data?.accessKey;
    await db
      .update(fiscalDocuments)
      .set({
        status: "authorized",
        externalId: providerResult.externalId,
        accessKey,
        xmlUrl: providerResult.data?.xmlUrl,
        danfeUrl: providerResult.data?.danfeUrl,
        errorMessage: null,
        issuedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(fiscalDocuments.id, claimed.id));

    await db.insert(auditLogs).values({
      tenantId: claimed.tenantId,
      branchId: claimed.branchId,
      requestId: "worker-fiscal",
      action: "fiscal.document_authorized",
      entityType: "fiscal_document",
      entityId: claimed.id,
      metadata: {
        provider: claimed.provider,
        model: claimed.model,
        accessKey,
      },
    });
  }

  return { scanned: documents.length };
}
