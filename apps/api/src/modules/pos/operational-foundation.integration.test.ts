import * as schema from "@giromesa/db";
import {
  auditLogs,
  branchBusinessHourExceptions,
  branchBusinessHours,
  branches,
  branchOperationalSettings,
  cashMovements,
  cashSessions,
  diningTables,
  operationalEvents,
  operationalShifts,
  orderItems,
  orders,
  outboxEvents,
  payments,
  reservations,
  reservationTables,
  tableEvents,
  tenants,
  users,
} from "@giromesa/db";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import type { FiscalService } from "../fiscal/fiscal.service";
import { FloorService } from "../floor/floor.service";
import { CashRepository } from "./cash.repository";
import { CashService } from "./cash.service";
import { OperationalService } from "./operational.service";
import { OrderRepository } from "./order.repository";
import { OrdersService } from "./orders.service";
import { PaymentsService } from "./payments.service";
import { PosRepository } from "./pos.repository";
import { ShiftRepository } from "./shift.repository";
import { ShiftService } from "./shift.service";

type Db = NodePgDatabase<typeof schema>;
const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@localhost:55432/giromesa";

runIntegration("operational redesign foundation", () => {
  let pool: Pool;
  let db: Db;
  let floorService: FloorService;
  let operationalService: OperationalService;
  let ordersService: OrdersService;
  let paymentsService: PaymentsService;
  let shiftService: ShiftService;
  let cashService: CashService;
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    const database = { db } as DatabaseService;
    const posRepository = new PosRepository(database);
    const orderRepository = new OrderRepository(database);
    ordersService = new OrdersService(
      database,
      posRepository,
      orderRepository,
      {} as FiscalService,
    );
    paymentsService = new PaymentsService(database, orderRepository);
    const shiftRepository = new ShiftRepository(database);
    shiftService = new ShiftService(shiftRepository, posRepository, database);
    cashService = new CashService(new CashRepository(database), posRepository, database);
    operationalService = new OperationalService(
      database,
      posRepository,
      ordersService,
      cashService,
      shiftService,
    );
    floorService = new FloorService(database);
    fixture = await createFixture(db);
  });

  afterAll(async () => {
    await cleanupTenant(db, fixture.tenantA.id);
    await cleanupTenant(db, fixture.tenantB.id);
    await pool.end();
  });

  it("serializes overlapping multi-table reservations and seats all assigned tables", async () => {
    const scheduledAt = new Date("2026-08-05T22:00:00.000Z");
    const requests = ["Reserva A", "Reserva B"].map((customerName, index) =>
      floorService.createReservation(fixture.contextA, {
        tableIds: [fixture.tableA1.id, fixture.tableA2.id],
        customerName,
        partySize: 6,
        scheduledAt,
        durationMinutes: 120,
        notes: `concurrent-${index}`,
      }),
    );
    const results = await Promise.allSettled(requests);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toBeInstanceOf(
      ConflictException,
    );
    const created = results.find((result) => result.status === "fulfilled");
    if (created?.status !== "fulfilled") throw new Error("Reservation was not created");

    const seated = await floorService.seatReservation(fixture.contextA, created.value.id);
    expect(seated.tableIds).toEqual([fixture.tableA1.id, fixture.tableA2.id].sort());
    const tableRows = await db
      .select({ id: diningTables.id, status: diningTables.status, groupId: diningTables.groupId })
      .from(diningTables)
      .where(eq(diningTables.tenantId, fixture.tenantA.id));
    expect(tableRows.every((table) => table.status === "occupied")).toBe(true);
    expect(new Set(tableRows.map((table) => table.groupId)).size).toBe(1);
  });

  it("keeps active order and split totals tenant-owned", async () => {
    const [order] = await db
      .update(orders)
      .set({ totalCents: 101, subtotalCents: 101 })
      .where(eq(orders.tenantId, fixture.tenantA.id))
      .returning();
    if (!order) throw new Error("Seated order not found");
    const active = await ordersService.getActiveOrder(fixture.contextA, {
      branchId: fixture.branchA.id,
      tableId: order.tableId ?? "",
    });
    expect(active?.id).toBe(order.id);
    await expect(
      ordersService.getActiveOrder(fixture.contextB, {
        branchId: fixture.branchB.id,
        orderId: order.id,
      }),
    ).resolves.toBeNull();
    await expect(paymentsService.splitBill(fixture.contextB, order.id, 2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(paymentsService.splitBill(fixture.contextA, order.id, 2)).resolves.toEqual({
      orderId: order.id,
      totalCents: 101,
      parts: [
        { person: 1, amountCents: 51 },
        { person: 2, amountCents: 50 },
      ],
    });
  });

  it("persists branch settings, cross-midnight hours and versioned audit events", async () => {
    await operationalService.updateSettings(fixture.contextA, fixture.branchA.id, {
      cleaningMode: "manual",
      allowWaiterPayments: true,
      defaultTheme: "system",
      defaultKdsInputMode: "keyboard",
    });
    await operationalService.replaceBusinessHours(fixture.contextA, fixture.branchA.id, {
      weekly: [{ weekday: 5, opensAt: "18:00", closesAt: "03:00", sortOrder: 0 }],
      exceptions: [
        {
          date: "2026-12-25",
          isClosed: true,
          intervals: [],
          reason: "Natal",
        },
      ],
    });
    const settings = await operationalService.getSettings(fixture.contextA, fixture.branchA.id);
    expect(settings).toMatchObject({ allowWaiterPayments: true, defaultKdsInputMode: "keyboard" });
    const hours = await operationalService.getBusinessHours(fixture.contextA, fixture.branchA.id);
    expect(hours.weekly[0]).toMatchObject({ opensAt: "18:00", closesAt: "03:00" });
    const events = await operationalService.listEvents(
      fixture.contextA,
      fixture.branchA.id,
      0,
      100,
    );
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "branch.operational_settings_updated",
        "branch.business_hours_replaced",
      ]),
    );
    const versions = events.map((event) => event.version);
    expect(versions).toEqual([...versions].sort((left, right) => left - right));
    expect(new Set(versions).size).toBe(versions.length);
    expect(
      await operationalService.listEvents(fixture.contextB, fixture.branchB.id, 0, 100),
    ).toEqual([]);
  });

  it("closes a shift atomically and replays the same idempotency key", async () => {
    const opened = await shiftService.openShift(fixture.contextA, { branchId: fixture.branchA.id });
    const first = await shiftService.closeShift(fixture.contextA, {
      branchId: fixture.branchA.id,
      idempotencyKey: "close-shift-phase-1",
    });
    const replay = await shiftService.closeShift(fixture.contextA, {
      branchId: fixture.branchA.id,
      idempotencyKey: "close-shift-phase-1",
    });
    expect(first).toMatchObject({ id: opened.id, status: "closed", replayed: false });
    expect(replay).toMatchObject({ id: opened.id, status: "closed", replayed: true });
  });

  it("serializes cash operations and replays a single close", async () => {
    await db
      .update(orders)
      .set({ status: "paid", closedAt: new Date() })
      .where(eq(orders.tenantId, fixture.tenantA.id));
    const openResults = await Promise.allSettled([
      cashService.openCashSession(fixture.contextA, {
        branchId: fixture.branchA.id,
        openingAmountCents: 1_000,
      }),
      cashService.openCashSession(
        { ...fixture.contextA, requestId: "operational-phase-1-cash-race" },
        { branchId: fixture.branchA.id, openingAmountCents: 1_000 },
      ),
    ]);
    expect(openResults.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const opened = openResults.find((result) => result.status === "fulfilled");
    if (opened?.status !== "fulfilled") throw new Error("Cash session was not opened");

    await Promise.all([
      cashService.registerCashMovement(fixture.contextA, "supply", {
        branchId: fixture.branchA.id,
        amountCents: 200,
        reason: "Reforço",
      }),
      cashService.registerCashMovement(fixture.contextA, "withdrawal", {
        branchId: fixture.branchA.id,
        amountCents: 50,
        reason: "Sangria",
      }),
    ]);
    const first = await cashService.closeCashSession(fixture.contextA, opened.value.id, {
      countedAmountCents: 1_150,
      idempotencyKey: "close-cash-phase-1",
    });
    const replay = await cashService.closeCashSession(fixture.contextA, opened.value.id, {
      countedAmountCents: 1_150,
      idempotencyKey: "close-cash-phase-1",
    });
    expect(first).toMatchObject({ status: "closed", differenceCents: 0, replayed: false });
    expect(replay).toMatchObject({ status: "closed", differenceCents: 0, replayed: true });
  });
});

async function createFixture(db: Db) {
  const [tenantA] = await db
    .insert(tenants)
    .values({ name: "Operational A", slug: `operational-a-${Date.now()}`, status: "active" })
    .returning();
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: "Operational B", slug: `operational-b-${Date.now()}`, status: "active" })
    .returning();
  if (!tenantA || !tenantB) throw new Error("Failed to create tenants");
  const [branchA] = await db
    .insert(branches)
    .values({ tenantId: tenantA.id, name: "Matriz A" })
    .returning();
  const [branchB] = await db
    .insert(branches)
    .values({ tenantId: tenantB.id, name: "Matriz B" })
    .returning();
  if (!branchA || !branchB) throw new Error("Failed to create branches");
  const [userA] = await db
    .insert(users)
    .values({ tenantId: tenantA.id, email: `a-${Date.now()}@test.local`, name: "Operador A" })
    .returning();
  const [userB] = await db
    .insert(users)
    .values({ tenantId: tenantB.id, email: `b-${Date.now()}@test.local`, name: "Operador B" })
    .returning();
  if (!userA || !userB) throw new Error("Failed to create users");
  const [tableA1] = await db
    .insert(diningTables)
    .values({ tenantId: tenantA.id, branchId: branchA.id, code: "M01", name: "Mesa 1", seats: 4 })
    .returning();
  const [tableA2] = await db
    .insert(diningTables)
    .values({ tenantId: tenantA.id, branchId: branchA.id, code: "M02", name: "Mesa 2", seats: 4 })
    .returning();
  if (!tableA1 || !tableA2) throw new Error("Failed to create tables");
  return {
    tenantA,
    tenantB,
    branchA,
    branchB,
    tableA1,
    tableA2,
    contextA: {
      tenantId: tenantA.id,
      branchId: branchA.id,
      userId: userA.id,
      requestId: "operational-phase-1-a",
      permissions: ["pos:operate", "cash:manage", "tenant:manage"],
    },
    contextB: {
      tenantId: tenantB.id,
      branchId: branchB.id,
      userId: userB.id,
      requestId: "operational-phase-1-b",
      permissions: ["pos:operate"],
    },
  };
}

async function cleanupTenant(db: Db, tenantId: string) {
  await db.delete(outboxEvents).where(eq(outboxEvents.tenantId, tenantId));
  await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
  await db.delete(operationalEvents).where(eq(operationalEvents.tenantId, tenantId));
  await db.delete(tableEvents).where(eq(tableEvents.tenantId, tenantId));
  await db.delete(reservationTables).where(eq(reservationTables.tenantId, tenantId));
  await db.delete(reservations).where(eq(reservations.tenantId, tenantId));
  await db.delete(payments).where(eq(payments.tenantId, tenantId));
  await db.delete(orderItems).where(eq(orderItems.tenantId, tenantId));
  await db.delete(orders).where(eq(orders.tenantId, tenantId));
  await db.delete(cashMovements).where(eq(cashMovements.tenantId, tenantId));
  await db.delete(cashSessions).where(eq(cashSessions.tenantId, tenantId));
  await db.delete(operationalShifts).where(eq(operationalShifts.tenantId, tenantId));
  await db
    .delete(branchBusinessHourExceptions)
    .where(eq(branchBusinessHourExceptions.tenantId, tenantId));
  await db.delete(branchBusinessHours).where(eq(branchBusinessHours.tenantId, tenantId));
  await db
    .delete(branchOperationalSettings)
    .where(eq(branchOperationalSettings.tenantId, tenantId));
  await db.delete(diningTables).where(eq(diningTables.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(branches).where(eq(branches.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}
