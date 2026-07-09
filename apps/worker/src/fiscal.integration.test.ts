import * as schema from "@giromesa/db";
import { auditLogs, branches, fiscalDocuments, tenants } from "@giromesa/db";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { processPendingFiscalDocuments } from "./fiscal";

type Db = NodePgDatabase<typeof schema>;

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

runIntegration("fiscal mock worker", () => {
  let pool: Pool;
  let db: Db;
  let tenantId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
  });

  afterAll(async () => {
    if (tenantId) {
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
      await db.delete(fiscalDocuments).where(eq(fiscalDocuments.tenantId, tenantId));
      await db.delete(branches).where(eq(branches.tenantId, tenantId));
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    }
    await pool.end();
  });

  it("authorizes pending mock fiscal documents and records audit", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({
        name: "Fiscal Worker Tenant",
        slug: `fiscal-worker-${Date.now()}`,
        status: "active",
      })
      .returning();

    if (!tenant) {
      throw new Error("Failed to create fiscal worker tenant");
    }
    tenantId = tenant.id;

    const [branch] = await db.insert(branches).values({ tenantId, name: "Matriz" }).returning();
    if (!branch) {
      throw new Error("Failed to create fiscal worker branch");
    }

    const [document] = await db
      .insert(fiscalDocuments)
      .values({
        tenantId,
        branchId: branch.id,
        provider: "mock",
        model: "nfce",
        environment: "homologation",
        series: "1",
        number: 1,
        status: "pending",
        payload: { test: true },
      })
      .returning();

    if (!document) {
      throw new Error("Failed to create pending fiscal document");
    }

    const result = await processPendingFiscalDocuments(db);
    const [storedDocument] = await db
      .select()
      .from(fiscalDocuments)
      .where(eq(fiscalDocuments.id, document.id))
      .limit(1);

    expect(result.scanned).toBeGreaterThanOrEqual(1);
    expect(storedDocument?.status).toBe("authorized");
    expect(storedDocument?.accessKey).toMatch(/^35/);
    expect(storedDocument?.danfeUrl).toContain(document.id);
  });
});
