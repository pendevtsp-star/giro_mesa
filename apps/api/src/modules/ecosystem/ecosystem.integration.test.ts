import * as schema from "@giromesa/db";
import { auditLogs, federationHandoffs, tenantEntitlements, tenants, users } from "@giromesa/db";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { EcosystemService } from "./ecosystem.service";

type Db = NodePgDatabase<typeof schema>;
const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

runIntegration("Ecosystem federation", () => {
  let pool: Pool;
  let db: Db;
  let service: EcosystemService;

  beforeAll(() => {
    process.env.FEDERATION_HANDOFF_SECRET = "federation-test-secret-with-at-least-32-characters";
    process.env.DOSECLUB_SSO_EXCHANGE_KEY = "exchange-test-secret-with-at-least-32-characters";
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    service = new EcosystemService({ db } as DatabaseService);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("exchanges a short handoff once without sharing a product session", async () => {
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Federation Test", slug: `federation-${suffix}`, status: "active" })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        tenantId: tenant?.id,
        email: `federation-${suffix}@example.com`,
        name: "Federated Owner",
      })
      .returning();
    if (!tenant || !user) throw new Error("Failed to create federation fixture");
    await db.insert(tenantEntitlements).values({
      tenantId: tenant.id,
      code: "doseclub.subscription",
    });

    try {
      const handoff = await service.createFederationHandoff(
        {
          tenantId: tenant.id,
          userId: user.id,
          requestId: `request-${suffix}`,
          permissions: [],
        },
        { targetProduct: "doseclub", returnTo: "/clubs" },
      );
      expect(handoff.targetUrl).toContain("federation_token=");
      const exchanged = await service.exchangeFederationHandoff(
        handoff.token,
        process.env.DOSECLUB_SSO_EXCHANGE_KEY,
      );
      expect(exchanged.identity).toMatchObject({
        tenant_id: tenant.id,
        sub: user.id,
        return_to: "/clubs",
      });
      await expect(
        service.exchangeFederationHandoff(handoff.token, process.env.DOSECLUB_SSO_EXCHANGE_KEY),
      ).rejects.toThrow("already consumed");
    } finally {
      await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenant.id));
      await db.delete(federationHandoffs).where(eq(federationHandoffs.tenantId, tenant.id));
      await db.delete(tenantEntitlements).where(eq(tenantEntitlements.tenantId, tenant.id));
      await db.delete(users).where(eq(users.tenantId, tenant.id));
      await db.delete(tenants).where(eq(tenants.id, tenant.id));
    }
  });
});
