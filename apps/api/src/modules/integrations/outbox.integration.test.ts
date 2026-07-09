import * as schema from "@giromesa/db";
import { outboxEvents, tenants } from "@giromesa/db";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { OutboxService } from "./outbox.service";

type Db = NodePgDatabase<typeof schema>;

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

async function cleanupTenant(db: Db, tenantId: string) {
  await db.delete(outboxEvents).where(eq(outboxEvents.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

runIntegration("OutboxService", () => {
  let pool: Pool;
  let db: Db;
  let service: OutboxService;

  beforeAll(() => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    service = new OutboxService({ db } as DatabaseService);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("lists only current tenant events and supports status filtering", async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Outbox Test", slug: `outbox-test-${Date.now()}`, status: "active" })
      .returning();
    const [otherTenant] = await db
      .insert(tenants)
      .values({ name: "Outbox Other", slug: `outbox-other-${Date.now()}`, status: "active" })
      .returning();

    if (!tenant || !otherTenant) {
      throw new Error("Failed to create outbox fixture");
    }

    await db.insert(outboxEvents).values([
      { tenantId: tenant.id, topic: "payment.confirmed", payload: { orderId: "one" } },
      {
        tenantId: tenant.id,
        topic: "order.closed",
        payload: { orderId: "two" },
        status: "processed",
      },
      { tenantId: otherTenant.id, topic: "payment.confirmed", payload: { orderId: "other" } },
    ]);

    const context = {
      tenantId: tenant.id,
      userId: "user-test",
      requestId: "outbox-test",
      permissions: ["tenant:manage"],
    };

    const allRows = await service.listEvents(context);
    expect(allRows).toHaveLength(2);

    const processedRows = await service.listEvents(context, { status: "processed" });
    expect(processedRows).toHaveLength(1);
    expect(processedRows[0]?.topic).toBe("order.closed");

    await cleanupTenant(db, tenant.id);
    await cleanupTenant(db, otherTenant.id);
  });
});
