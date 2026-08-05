import * as schema from "@giromesa/db";
import {
  auditLogs,
  branches,
  fiscalDocuments,
  fiscalOperations,
  fiscalSettings,
  operationalEvents,
  outboxEvents,
  tenants,
} from "@giromesa/db";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processFiscalOperations } from "./fiscal-operations";

type Db = NodePgDatabase<typeof schema>;
const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

runIntegration("fiscal operation processor", () => {
  let pool: Pool;
  let db: Db;
  let tenantId = "";

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    if (tenantId) {
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
      await db.delete(operationalEvents).where(eq(operationalEvents.tenantId, tenantId));
      await db.delete(outboxEvents).where(eq(outboxEvents.tenantId, tenantId));
      await db.delete(fiscalOperations).where(eq(fiscalOperations.tenantId, tenantId));
      await db.delete(fiscalDocuments).where(eq(fiscalDocuments.tenantId, tenantId));
      await db.delete(fiscalSettings).where(eq(fiscalSettings.tenantId, tenantId));
      await db.delete(branches).where(eq(branches.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    await pool.end();
  });

  it("authorizes simulator issue and keeps the provider fail-closed boundary", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Fiscal operation test", slug: `fiscal-op-${Date.now()}`, status: "active" })
      .returning();
    if (!tenant) throw new Error("tenant fixture failed");
    tenantId = tenant.id;
    const [branch] = await db.insert(branches).values({ tenantId, name: "Matriz" }).returning();
    if (!branch) throw new Error("branch fixture failed");
    await db.insert(fiscalSettings).values({
      tenantId,
      branchId: branch.id,
      provider: "focus_nfe",
      status: "enabled",
      environment: "homologation",
      providerMetadata: { simulator: true },
    });
    const [document] = await db
      .insert(fiscalDocuments)
      .values({
        tenantId,
        branchId: branch.id,
        provider: "focus_nfe",
        model: "nfce",
        environment: "homologation",
        status: "pending",
        number: 1,
        payload: { simulateFiscalScenario: "authorized" },
      })
      .returning();
    if (!document) throw new Error("document fixture failed");
    await db.insert(fiscalOperations).values({
      tenantId,
      branchId: branch.id,
      fiscalDocumentId: document.id,
      type: "issue",
      environment: "homologation",
      idempotencyKey: `issue:${document.id}`,
      providerReference: document.id.replaceAll("-", ""),
      status: "pending",
    });

    const result = await processFiscalOperations(db, "worker-test", 5);
    const [stored] = await db
      .select()
      .from(fiscalDocuments)
      .where(eq(fiscalDocuments.id, document.id))
      .limit(1);

    expect(result.processed).toBe(1);
    expect(stored?.status).toBe("authorized");
    expect(stored?.accessKey).toMatch(/^27\d{42}$/);

    const [uncertainDocument] = await db
      .insert(fiscalDocuments)
      .values({
        tenantId,
        branchId: branch.id,
        provider: "focus_nfe",
        model: "nfce",
        environment: "homologation",
        status: "pending",
        number: 2,
        payload: { simulateFiscalScenario: "unknown" },
      })
      .returning();
    if (!uncertainDocument) throw new Error("uncertain document fixture failed");
    await db.insert(fiscalOperations).values({
      tenantId,
      branchId: branch.id,
      fiscalDocumentId: uncertainDocument.id,
      type: "issue",
      environment: "homologation",
      idempotencyKey: `issue:${uncertainDocument.id}`,
      providerReference: uncertainDocument.id.replaceAll("-", ""),
      status: "pending",
    });

    const uncertainIssue = await processFiscalOperations(db, "worker-test", 1);
    const [afterUnknown] = await db
      .select()
      .from(fiscalDocuments)
      .where(eq(fiscalDocuments.id, uncertainDocument.id))
      .limit(1);
    expect(uncertainIssue.processed).toBe(1);
    expect(afterUnknown?.status).toBe("pending");
    expect(afterUnknown?.errorMessage).toBe("result_unknown_query_required");

    const queryResult = await processFiscalOperations(db, "worker-test", 1);
    const [afterQuery] = await db
      .select()
      .from(fiscalDocuments)
      .where(eq(fiscalDocuments.id, uncertainDocument.id))
      .limit(1);
    const uncertainOperations = await db
      .select()
      .from(fiscalOperations)
      .where(eq(fiscalOperations.fiscalDocumentId, uncertainDocument.id));
    expect(queryResult.processed).toBe(1);
    expect(afterQuery?.status).toBe("authorized");
    expect(uncertainOperations.filter((operation) => operation.type === "query")).toHaveLength(1);
  });
});
