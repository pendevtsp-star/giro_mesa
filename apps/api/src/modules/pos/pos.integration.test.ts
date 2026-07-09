import * as schema from "@giromesa/db";
import {
  auditLogs,
  branches,
  categories,
  diningTables,
  kdsStations,
  kdsTickets,
  orderItems,
  orders,
  outboxEvents,
  payments,
  products,
  tenants,
  users,
} from "@giromesa/db";
import { and, eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import type { FiscalService } from "../fiscal/fiscal.service";
import { PosService } from "./pos.service";

type Db = NodePgDatabase<typeof schema>;

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

async function cleanupTenant(db: Db, tenantId: string) {
  await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
  await db.delete(kdsTickets).where(eq(kdsTickets.tenantId, tenantId));
  await db.delete(kdsStations).where(eq(kdsStations.tenantId, tenantId));
  await db.delete(outboxEvents).where(eq(outboxEvents.tenantId, tenantId));
  await db.delete(payments).where(eq(payments.tenantId, tenantId));
  await db.delete(orderItems).where(eq(orderItems.tenantId, tenantId));
  await db.delete(orders).where(eq(orders.tenantId, tenantId));
  await db.delete(products).where(eq(products.tenantId, tenantId));
  await db.delete(categories).where(eq(categories.tenantId, tenantId));
  await db.delete(diningTables).where(eq(diningTables.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(branches).where(eq(branches.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

async function createPosFixture(db: Db, name: string) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name,
      slug: `pos-${name.toLowerCase().replaceAll(" ", "-")}-${Date.now()}`,
      status: "active",
    })
    .returning();
  if (!tenant) {
    throw new Error("Failed to create POS test tenant");
  }

  const [branch] = await db
    .insert(branches)
    .values({ tenantId: tenant.id, name: "Matriz" })
    .returning();
  if (!branch) {
    throw new Error("Failed to create POS test branch");
  }

  const [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: `admin-${tenant.slug}@example.test`,
      name: "Operador POS",
      isActive: true,
    })
    .returning();
  if (!user) {
    throw new Error("Failed to create POS test user");
  }

  const [table] = await db
    .insert(diningTables)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      code: "M99",
      name: "Mesa 99",
      seats: 4,
      status: "occupied",
    })
    .returning();
  if (!table) {
    throw new Error("Failed to create POS test table");
  }

  const [category] = await db
    .insert(categories)
    .values({ tenantId: tenant.id, branchId: branch.id, name: "Teste POS" })
    .returning();
  if (!category) {
    throw new Error("Failed to create POS test category");
  }

  const [burger] = await db
    .insert(products)
    .values({
      tenantId: tenant.id,
      categoryId: category.id,
      name: "Burger Teste",
      priceCents: 3200,
      costCents: 1200,
      channels: ["pos", "qr"],
    })
    .returning();
  const [brownie] = await db
    .insert(products)
    .values({
      tenantId: tenant.id,
      categoryId: category.id,
      name: "Brownie Teste",
      priceCents: 2200,
      costCents: 800,
      channels: ["pos", "qr"],
    })
    .returning();
  if (!burger || !brownie) {
    throw new Error("Failed to create POS test products");
  }

  const [order] = await db
    .insert(orders)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      tableId: table.id,
      channel: "qr",
      status: "opened",
      subtotalCents: 5400,
      totalCents: 5400,
      openedAt: new Date(),
    })
    .returning();
  if (!order) {
    throw new Error("Failed to create POS test order");
  }

  const [burgerItem] = await db
    .insert(orderItems)
    .values({
      tenantId: tenant.id,
      orderId: order.id,
      productId: burger.id,
      nameSnapshot: burger.name,
      quantity: "1",
      unitPriceCents: 3200,
      totalCents: 3200,
      notes: "manter",
    })
    .returning();
  const [brownieItem] = await db
    .insert(orderItems)
    .values({
      tenantId: tenant.id,
      orderId: order.id,
      productId: brownie.id,
      nameSnapshot: brownie.name,
      quantity: "1",
      unitPriceCents: 2200,
      totalCents: 2200,
      notes: "cancelar",
    })
    .returning();
  if (!burgerItem || !brownieItem) {
    throw new Error("Failed to create POS test items");
  }

  await db.insert(kdsStations).values({
    tenantId: tenant.id,
    branchId: branch.id,
    name: "Cozinha",
    type: "kitchen",
  });

  return { tenant, branch, user, table, order, burgerItem, brownieItem };
}

runIntegration("POS QR conference behavior", () => {
  let pool: Pool;
  let db: Db;
  let posService: PosService;
  let fixture: Awaited<ReturnType<typeof createPosFixture>>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    posService = new PosService({ db } as DatabaseService, {} as FiscalService);
    fixture = await createPosFixture(db, "Tenant POS");
  });

  afterAll(async () => {
    if (fixture?.tenant.id) {
      await cleanupTenant(db, fixture.tenant.id);
    }
    await pool.end();
  });

  it("cancels a single QR item, keeps the order pending and sends only active items to KDS", async () => {
    const context = {
      tenantId: fixture.tenant.id,
      branchId: fixture.branch.id,
      userId: fixture.user.id,
      requestId: "pos-integration-test",
      permissions: ["pos:operate"],
    };

    const cancel = await posService.cancelQrOrderItem(
      context,
      fixture.order.id,
      fixture.brownieItem.id,
      { reason: "Produto indisponivel" },
    );

    expect(cancel.audit).toBe("qr_order.item_canceled");
    expect(cancel.order).toBeDefined();
    if (!cancel.order) {
      throw new Error("Expected canceled QR order to be returned");
    }
    expect(cancel.order.status).toBe("opened");
    expect(cancel.order.totalCents).toBe(3200);

    const pending = await posService.listQrPendingOrders(context, fixture.branch.id);
    const pendingOrder = pending.find((order) => order.id === fixture.order.id);
    expect(pendingOrder?.items).toHaveLength(1);
    expect(pendingOrder?.items[0]?.id).toBe(fixture.burgerItem.id);

    const sent = await posService.sendToKitchen(context, fixture.order.id);
    expect(sent.status).toBe("sent_to_kitchen");
    expect(sent.ticketsCreated).toHaveLength(1);

    const payment = await posService.registerPayment(context, fixture.order.id, {
      amountCents: 3200,
      method: "pix_manual",
      idempotencyKey: `pos-payment-${Date.now()}`,
    });
    expect(payment.audit).toBe("payment.confirmed");
    expect(payment.orderStatus).toBe("paid");

    const closed = await posService.closeOrder(context, fixture.order.id);
    expect(closed.audit).toBe("order.closed");

    const rows = await db
      .select({ id: orderItems.id, status: orderItems.status, totalCents: orderItems.totalCents })
      .from(orderItems)
      .where(eq(orderItems.orderId, fixture.order.id));
    const activeItem = rows.find((item) => item.id === fixture.burgerItem.id);
    const canceledItem = rows.find((item) => item.id === fixture.brownieItem.id);

    expect(activeItem?.status).toBe("sent");
    expect(canceledItem?.status).toBe("canceled");
    expect(canceledItem?.totalCents).toBe(0);

    const history = await posService.listTableHistory(context, fixture.table.id);
    expect(history[0]?.action).toBe("order.closed");
    expect(history.some((event) => event.action === "qr_order.item_canceled")).toBe(true);
    expect(history.find((event) => event.action === "qr_order.item_canceled")?.userName).toBe(
      "Operador POS",
    );

    const outboxRows = await db
      .select({ topic: outboxEvents.topic })
      .from(outboxEvents)
      .where(and(eq(outboxEvents.tenantId, fixture.tenant.id), eq(outboxEvents.status, "pending")));
    expect(outboxRows.map((event) => event.topic)).toEqual(
      expect.arrayContaining(["payment.confirmed", "order.closed"]),
    );
  });
});
