import * as schema from "@giromesa/db";
import { auditLogs, branches, kdsStations, kdsTickets, orders, tenants, users } from "@giromesa/db";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { KdsService } from "./kds.service";

type Db = NodePgDatabase<typeof schema>;
const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@localhost:55432/giromesa";

runIntegration("KDS concurrency", () => {
  let pool: Pool;
  let db: Db;
  let service: KdsService;
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    service = new KdsService({ db } as DatabaseService);
    fixture = await createFixture(db);
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.tenantId, fixture.tenant.id));
    await db.delete(kdsTickets).where(eq(kdsTickets.tenantId, fixture.tenant.id));
    await db.delete(kdsStations).where(eq(kdsStations.tenantId, fixture.tenant.id));
    await db.delete(orders).where(eq(orders.tenantId, fixture.tenant.id));
    await db.delete(users).where(eq(users.tenantId, fixture.tenant.id));
    await db.delete(branches).where(eq(branches.tenantId, fixture.tenant.id));
    await db.delete(tenants).where(eq(tenants.id, fixture.tenant.id));
    await pool.end();
  });

  it("orders concurrent whole-ticket transitions and replays the final state", async () => {
    const ticket = await createTicket(db, fixture, [
      { id: "item-a", status: "sent" },
      { id: "item-b", status: "sent" },
    ]);
    const blocker = await lockTicket(pool, fixture.tenant.id, ticket.id);
    let firstSettled = false;
    let secondSettled = false;
    try {
      const preparing = service
        .updateTicket(fixture.context, ticket.id, "preparing")
        .finally(() => {
          firstSettled = true;
        });
      await delay(50);
      expect(firstSettled).toBe(false);
      const ready = service.updateTicket(fixture.context, ticket.id, "ready").finally(() => {
        secondSettled = true;
      });
      await delay(50);
      expect(secondSettled).toBe(false);
      await blocker.query("commit");
      expect((await preparing).status).toBe("preparing");
      expect((await ready).status).toBe("ready");
    } finally {
      await blocker.query("rollback").catch(() => undefined);
      blocker.release();
    }

    expect((await service.updateTicket(fixture.context, ticket.id, "ready")).status).toBe("ready");
    expect((await readTicket(db, ticket.id))?.status).toBe("ready");
  });

  it("preserves both item updates made concurrently on one ticket", async () => {
    const ticket = await createTicket(db, fixture, [
      { id: "item-c", status: "sent" },
      { id: "item-d", status: "sent" },
    ]);
    const blocker = await lockTicket(pool, fixture.tenant.id, ticket.id);
    let firstSettled = false;
    let secondSettled = false;
    try {
      const first = service
        .updateTicketItem(fixture.context, ticket.id, "item-c", "preparing")
        .finally(() => {
          firstSettled = true;
        });
      await delay(50);
      expect(firstSettled).toBe(false);
      const second = service
        .updateTicketItem(fixture.context, ticket.id, "item-d", "preparing")
        .finally(() => {
          secondSettled = true;
        });
      await delay(50);
      expect(secondSettled).toBe(false);
      await blocker.query("commit");
      await Promise.all([first, second]);
    } finally {
      await blocker.query("rollback").catch(() => undefined);
      blocker.release();
    }

    await Promise.all([
      service.updateTicketItem(fixture.context, ticket.id, "item-c", "ready"),
      service.updateTicketItem(fixture.context, ticket.id, "item-d", "ready"),
    ]);
    expect(
      (await service.updateTicketItem(fixture.context, ticket.id, "item-c", "ready")).status,
    ).toBe("ready");
    const stored = await readTicket(db, ticket.id);
    const items = Array.isArray(stored?.payload?.items) ? stored.payload.items : [];
    expect(items).toEqual([
      { id: "item-c", status: "ready" },
      { id: "item-d", status: "ready" },
    ]);
    expect(stored?.status).toBe("ready");
  });
});

async function createFixture(db: Db) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "KDS concurrency", slug: `kds-concurrency-${Date.now()}`, status: "active" })
    .returning();
  if (!tenant) throw new Error("Failed to create KDS tenant");
  const [branch] = await db
    .insert(branches)
    .values({ tenantId: tenant.id, name: "Matriz" })
    .returning();
  const [user] = await db
    .insert(users)
    .values({ tenantId: tenant.id, email: `kds-${Date.now()}@test.local`, name: "KDS operator" })
    .returning();
  if (!branch || !user) throw new Error("Failed to create KDS branch or user");
  const [order] = await db
    .insert(orders)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      channel: "table",
      status: "sent_to_kitchen",
      openedAt: new Date(),
    })
    .returning();
  const [station] = await db
    .insert(kdsStations)
    .values({ tenantId: tenant.id, branchId: branch.id, name: "Cozinha", type: "kitchen" })
    .returning();
  if (!order || !station) throw new Error("Failed to create KDS order or station");
  return {
    tenant,
    branch,
    order,
    station,
    context: {
      tenantId: tenant.id,
      branchId: branch.id,
      userId: user.id,
      requestId: "kds-concurrency",
      permissions: ["kds:operate"],
    },
  };
}

async function createTicket(
  db: Db,
  fixture: Awaited<ReturnType<typeof createFixture>>,
  items: Array<{ id: string; status: string }>,
) {
  const [ticket] = await db
    .insert(kdsTickets)
    .values({
      tenantId: fixture.tenant.id,
      branchId: fixture.branch.id,
      stationId: fixture.station.id,
      orderId: fixture.order.id,
      status: "sent",
      payload: { items },
    })
    .returning();
  if (!ticket) throw new Error("Failed to create KDS ticket");
  return ticket;
}

async function lockTicket(pool: Pool, tenantId: string, ticketId: string) {
  const client = await pool.connect();
  await client.query("begin");
  await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
    `${tenantId}:${ticketId}`,
  ]);
  return client;
}

async function readTicket(db: Db, ticketId: string) {
  const [ticket] = await db.select().from(kdsTickets).where(eq(kdsTickets.id, ticketId)).limit(1);
  return ticket;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
