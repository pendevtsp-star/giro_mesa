import * as schema from "@giromesa/db";
import {
  approvalRequests,
  auditLogs,
  branches,
  branchOperationalSettings,
  categories,
  diningTables,
  operationalEvents,
  operationalShifts,
  operationIdempotency,
  operationPolicies,
  orderItems,
  orders,
  products,
  tableEvents,
  tableWaiterAssignments,
  tenants,
  users,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DatabaseApprovalsRepository } from "../approvals/approvals.repository";
import { ApprovalsService } from "../approvals/approvals.service";
import type { DatabaseService } from "../database/database.service";
import type { CashService } from "./cash.service";
import { OperationalService } from "./operational.service";
import type { OrdersService } from "./orders.service";
import type { PaymentsService } from "./payments.service";
import type { PosRepository } from "./pos.repository";
import { PosService } from "./pos.service";
import type { ShiftService } from "./shift.service";
import { WaiterAssignmentService } from "./waiter-assignment.service";

type Db = NodePgDatabase<typeof schema>;
const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@localhost:55434/giromesa_validation";

runIntegration("waiter assignment concurrency and tenant isolation", () => {
  let pool: Pool;
  let db: Db;
  let service: WaiterAssignmentService;
  let posService: PosService;
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    const databaseService = { db } as DatabaseService;
    const approvals = new ApprovalsService(new DatabaseApprovalsRepository(databaseService));
    service = new WaiterAssignmentService(databaseService, approvals);
    const operationalService = new OperationalService(
      databaseService,
      {
        ensureBranchBelongsToTenant: async () => undefined,
      } as unknown as PosRepository,
      {} as OrdersService,
      {} as CashService,
      {} as ShiftService,
    );
    posService = new PosService(
      databaseService,
      {} as PosRepository,
      {} as OrdersService,
      {} as PaymentsService,
      {} as CashService,
      {} as ShiftService,
      approvals,
      undefined,
      operationalService,
      service,
    );
    fixture = await createFixture(db);
  });

  afterAll(async () => {
    if (fixture) await cleanupTenant(db, fixture.tenantA.id);
    if (fixture) await cleanupTenant(db, fixture.tenantB.id);
    await pool.end();
  });

  it("allows exactly one concurrent waiter claim for a strict table", async () => {
    const attempts = await Promise.allSettled([
      service.claim(fixture.waiterAContext, fixture.branchA.id, fixture.claimTable.id),
      service.claim(fixture.waiterBContext, fixture.branchA.id, fixture.claimTable.id),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejected?.status === "rejected" ? rejected.reason : null).toBeInstanceOf(
      ConflictException,
    );

    const active = await activeAssignments(
      db,
      fixture.tenantA.id,
      fixture.claimShift.id,
      fixture.claimTable.id,
    );
    expect(active).toHaveLength(1);
  });

  it("serializes concurrent manager transfers and keeps one active owner", async () => {
    const results = await Promise.allSettled([
      service.transfer(fixture.managerContext, {
        branchId: fixture.branchA.id,
        tableId: fixture.claimTable.id,
        waiterUserId: fixture.waiterB.id,
        reason: "Troca de praça A",
      }),
      service.transfer(
        { ...fixture.managerContext, requestId: "waiter-transfer-concurrent-b" },
        {
          branchId: fixture.branchA.id,
          tableId: fixture.claimTable.id,
          waiterUserId: fixture.waiterC.id,
          reason: "Troca de praça B",
        },
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const active = await activeAssignments(
      db,
      fixture.tenantA.id,
      fixture.claimShift.id,
      fixture.claimTable.id,
    );
    expect(active).toHaveLength(1);
    expect([fixture.waiterB.id, fixture.waiterC.id]).toContain(active[0]?.waiterUserId);
  });

  it("does not allow an assignment request to cross tenant boundaries", async () => {
    await expect(
      service.claim(fixture.otherTenantContext, fixture.branchB.id, fixture.claimTable.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      await activeAssignments(db, fixture.tenantB.id, fixture.shiftB.id, fixture.claimTable.id),
    ).toHaveLength(0);
  });

  it("consumes an approved help request exactly once", async () => {
    await service.claim(fixture.waiterAContext, fixture.branchA.id, fixture.helpTable.id);
    const [help] = await db
      .insert(approvalRequests)
      .values({
        tenantId: fixture.tenantA.id,
        branchId: fixture.branchA.id,
        entityType: "dining_table",
        entityId: fixture.helpTable.id,
        action: "waiter_table_help",
        requestedByUserId: fixture.waiterB.id,
        status: "approved",
        reason: "Cobrir atendimento durante pausa",
        metadata: { shiftId: fixture.claimShift.id, assignedWaiterUserId: fixture.waiterA.id },
      })
      .returning();
    if (!help) throw new Error("Failed to create approved help request");

    await expect(
      service.assertOrderAccess(fixture.waiterBContext, {
        branchId: fixture.branchA.id,
        tableId: fixture.helpTable.id,
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.assertOrderAccess(
        { ...fixture.waiterBContext, requestId: "waiter-help-second-use" },
        { branchId: fixture.branchA.id, tableId: fixture.helpTable.id },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const [stored] = await db
      .select({ appliedAt: approvalRequests.appliedAt })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, help.id));
    expect(stored?.appliedAt).toBeInstanceOf(Date);
  });

  it("rolls back a help grant with a failed discount and consumes it with the successful retry", async () => {
    await service.claim(fixture.waiterAContext, fixture.branchA.id, fixture.operationTable.id);
    const [help] = await db
      .insert(approvalRequests)
      .values({
        tenantId: fixture.tenantA.id,
        branchId: fixture.branchA.id,
        entityType: "dining_table",
        entityId: fixture.operationTable.id,
        action: "waiter_table_help",
        requestedByUserId: fixture.waiterB.id,
        status: "approved",
        reason: "Apoio em operação real",
        metadata: { shiftId: fixture.claimShift.id, assignedWaiterUserId: fixture.waiterA.id },
      })
      .returning();
    if (!help) throw new Error("Failed to create operation help request");

    await expect(
      posService.requestDiscount(fixture.waiterBContext, fixture.operationOrder.id, {
        amountCents: 1_001,
        reason: "Valor inválido para testar rollback",
      }),
    ).rejects.toThrow(/subtotal|positive/i);
    const [afterRollback] = await db
      .select({ appliedAt: approvalRequests.appliedAt })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, help.id));
    expect(afterRollback?.appliedAt).toBeNull();

    await expect(
      posService.requestDiscount(
        { ...fixture.waiterBContext, requestId: "waiter-help-real-success" },
        fixture.operationOrder.id,
        { amountCents: 100, reason: "Cortesia autorizada" },
      ),
    ).resolves.toMatchObject({ status: "applied", order: { discountCents: 100 } });
    const [afterSuccess] = await db
      .select({ appliedAt: approvalRequests.appliedAt })
      .from(approvalRequests)
      .where(eq(approvalRequests.id, help.id));
    expect(afterSuccess?.appliedAt).toBeInstanceOf(Date);
  });

  it("replays queryable discount and cancellation receipts and rejects mutated payloads", async () => {
    const discountInput = {
      amountCents: 125,
      reason: "Cortesia idempotente",
      idempotencyKey: "discount-receipt-0001",
    };
    const discount = await posService.requestDiscount(
      { ...fixture.waiterAContext, requestId: "discount-receipt-first" },
      fixture.operationOrder.id,
      discountInput,
    );
    await expect(
      posService.requestDiscount(
        { ...fixture.waiterAContext, requestId: "discount-receipt-replay" },
        fixture.operationOrder.id,
        discountInput,
      ),
    ).resolves.toEqual(JSON.parse(JSON.stringify(discount)));
    await expect(
      posService.requestDiscount(
        { ...fixture.waiterAContext, requestId: "discount-receipt-conflict" },
        fixture.operationOrder.id,
        { ...discountInput, amountCents: 126 },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      posService.getOperationReceipt(fixture.waiterAContext, {
        branchId: fixture.branchA.id,
        scope: "order.discount.request",
        idempotencyKey: discountInput.idempotencyKey,
      }),
    ).resolves.toMatchObject({
      status: "completed",
      response: {
        status: "applied",
        receipt: {
          scope: "order.discount.request",
          aggregateType: "order",
          aggregateId: fixture.operationOrder.id,
        },
      },
    });

    const cancellationInput = {
      reason: "Item lançado em duplicidade",
      idempotencyKey: "cancel-receipt-0001",
    };
    const cancellation = await posService.requestItemCancellation(
      { ...fixture.waiterAContext, requestId: "cancel-receipt-first" },
      fixture.operationOrder.id,
      fixture.operationItem.id,
      cancellationInput,
    );
    await expect(
      posService.requestItemCancellation(
        { ...fixture.waiterAContext, requestId: "cancel-receipt-replay" },
        fixture.operationOrder.id,
        fixture.operationItem.id,
        cancellationInput,
      ),
    ).resolves.toEqual(JSON.parse(JSON.stringify(cancellation)));
    await expect(
      posService.requestItemCancellation(
        { ...fixture.waiterAContext, requestId: "cancel-receipt-conflict" },
        fixture.operationOrder.id,
        fixture.operationItem.id,
        { ...cancellationInput, reason: "Outro motivo incompatível" },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      posService.getOperationReceipt(fixture.waiterAContext, {
        branchId: fixture.branchA.id,
        scope: "order_item.cancel.request",
        idempotencyKey: cancellationInput.idempotencyKey,
      }),
    ).resolves.toMatchObject({
      status: "completed",
      response: {
        status: "canceled",
        receipt: {
          scope: "order_item.cancel.request",
          aggregateType: "order_item",
          aggregateId: fixture.operationItem.id,
        },
      },
    });
  });
});

async function createFixture(db: Db) {
  const suffix = Date.now();
  const [tenantA] = await db
    .insert(tenants)
    .values({ name: "Waiter A", slug: `waiter-a-${suffix}`, status: "active" })
    .returning();
  const [tenantB] = await db
    .insert(tenants)
    .values({ name: "Waiter B", slug: `waiter-b-${suffix}`, status: "active" })
    .returning();
  if (!tenantA || !tenantB) throw new Error("Failed to create waiter test tenants");

  const [branchA] = await db
    .insert(branches)
    .values({ tenantId: tenantA.id, name: "Matriz" })
    .returning();
  const [branchB] = await db
    .insert(branches)
    .values({ tenantId: tenantB.id, name: "Outra matriz" })
    .returning();
  if (!branchA || !branchB) throw new Error("Failed to create waiter test branches");

  const [manager, waiterA, waiterB, waiterC] = await db
    .insert(users)
    .values([
      { tenantId: tenantA.id, email: `manager-${suffix}@test.local`, name: "Gerente" },
      { tenantId: tenantA.id, email: `waiter-a-${suffix}@test.local`, name: "Garçom A" },
      { tenantId: tenantA.id, email: `waiter-b-${suffix}@test.local`, name: "Garçom B" },
      { tenantId: tenantA.id, email: `waiter-c-${suffix}@test.local`, name: "Garçom C" },
    ])
    .returning();
  const [otherTenantWaiter] = await db
    .insert(users)
    .values({ tenantId: tenantB.id, email: `waiter-b-${suffix}@test.local`, name: "Outro garçom" })
    .returning();
  if (!manager || !waiterA || !waiterB || !waiterC || !otherTenantWaiter) {
    throw new Error("Failed to create waiter test users");
  }

  const [claimTable, helpTable, operationTable] = await db
    .insert(diningTables)
    .values([
      { tenantId: tenantA.id, branchId: branchA.id, code: "M01", name: "Mesa 1", seats: 4 },
      { tenantId: tenantA.id, branchId: branchA.id, code: "M02", name: "Mesa 2", seats: 4 },
      { tenantId: tenantA.id, branchId: branchA.id, code: "M03", name: "Mesa 3", seats: 4 },
    ])
    .returning();
  if (!claimTable || !helpTable || !operationTable) {
    throw new Error("Failed to create waiter test tables");
  }

  await db.insert(branchOperationalSettings).values([
    { tenantId: tenantA.id, branchId: branchA.id, waiterResponsibilityPolicy: "strict" },
    { tenantId: tenantB.id, branchId: branchB.id, waiterResponsibilityPolicy: "strict" },
  ]);
  const [claimShift] = await db
    .insert(operationalShifts)
    .values({
      tenantId: tenantA.id,
      branchId: branchA.id,
      openedByUserId: manager.id,
      status: "open",
    })
    .returning();
  const [shiftB] = await db
    .insert(operationalShifts)
    .values({
      tenantId: tenantB.id,
      branchId: branchB.id,
      openedByUserId: otherTenantWaiter.id,
      status: "open",
    })
    .returning();
  if (!claimShift || !shiftB) throw new Error("Failed to open waiter test shifts");
  await db.insert(operationPolicies).values({
    tenantId: tenantA.id,
    branchId: branchA.id,
    maxDiscountWithoutApprovalBps: 10_000,
    requireCancellationReason: true,
    requireApprovalAfterKitchen: true,
    returnStockOnApprovedCancellation: true,
  });
  const [operationOrder] = await db
    .insert(orders)
    .values({
      tenantId: tenantA.id,
      branchId: branchA.id,
      tableId: operationTable.id,
      channel: "table",
      status: "opened",
      subtotalCents: 1_000,
      totalCents: 1_000,
      openedAt: new Date(),
    })
    .returning();
  if (!operationOrder) throw new Error("Failed to create waiter operation order");
  const [category] = await db
    .insert(categories)
    .values({ tenantId: tenantA.id, branchId: branchA.id, name: "Operacional" })
    .returning();
  if (!category) throw new Error("Failed to create waiter operation category");
  const [product] = await db
    .insert(products)
    .values({
      tenantId: tenantA.id,
      categoryId: category.id,
      name: "Produto operacional",
      priceCents: 1_000,
      channels: ["pos"],
    })
    .returning();
  if (!product) throw new Error("Failed to create waiter operation product");
  const [operationItem] = await db
    .insert(orderItems)
    .values({
      tenantId: tenantA.id,
      orderId: operationOrder.id,
      productId: product.id,
      nameSnapshot: product.name,
      quantity: "1",
      unitPriceCents: 1_000,
      totalCents: 1_000,
      registeredByUserId: waiterA.id,
      shiftId: claimShift.id,
      responsibleWaiterUserId: waiterA.id,
    })
    .returning();
  if (!operationItem) throw new Error("Failed to create waiter operation item");

  const context = (userId: string, requestId: string, permissions: string[]): TenantContext => ({
    tenantId: tenantA.id,
    branchId: branchA.id,
    userId,
    requestId,
    permissions,
  });
  return {
    tenantA,
    tenantB,
    branchA,
    branchB,
    claimShift,
    shiftB,
    manager,
    waiterA,
    waiterB,
    waiterC,
    claimTable,
    helpTable,
    operationTable,
    operationOrder,
    operationItem,
    managerContext: context(manager.id, "waiter-transfer-manager", [
      "tenant:manage",
      "pos:operate",
    ]),
    waiterAContext: context(waiterA.id, "waiter-claim-a", ["pos:operate"]),
    waiterBContext: context(waiterB.id, "waiter-claim-b", ["pos:operate"]),
    otherTenantContext: {
      tenantId: tenantB.id,
      branchId: branchB.id,
      userId: otherTenantWaiter.id,
      requestId: "waiter-cross-tenant",
      permissions: ["pos:operate"],
    } as TenantContext,
  };
}

async function activeAssignments(db: Db, tenantId: string, shiftId: string, tableId: string) {
  return db
    .select({ id: tableWaiterAssignments.id, waiterUserId: tableWaiterAssignments.waiterUserId })
    .from(tableWaiterAssignments)
    .where(
      and(
        eq(tableWaiterAssignments.tenantId, tenantId),
        eq(tableWaiterAssignments.shiftId, shiftId),
        eq(tableWaiterAssignments.tableId, tableId),
        isNull(tableWaiterAssignments.endedAt),
      ),
    );
}

async function cleanupTenant(db: Db, tenantId: string) {
  await db.delete(operationalEvents).where(eq(operationalEvents.tenantId, tenantId));
  await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
  await db.delete(operationIdempotency).where(eq(operationIdempotency.tenantId, tenantId));
  await db.delete(tableEvents).where(eq(tableEvents.tenantId, tenantId));
  await db.delete(approvalRequests).where(eq(approvalRequests.tenantId, tenantId));
  await db.delete(orderItems).where(eq(orderItems.tenantId, tenantId));
  await db.delete(orders).where(eq(orders.tenantId, tenantId));
  await db.delete(tableWaiterAssignments).where(eq(tableWaiterAssignments.tenantId, tenantId));
  await db.delete(operationalShifts).where(eq(operationalShifts.tenantId, tenantId));
  await db.delete(operationPolicies).where(eq(operationPolicies.tenantId, tenantId));
  await db.delete(products).where(eq(products.tenantId, tenantId));
  await db.delete(categories).where(eq(categories.tenantId, tenantId));
  await db
    .delete(branchOperationalSettings)
    .where(eq(branchOperationalSettings.tenantId, tenantId));
  await db.delete(diningTables).where(eq(diningTables.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(branches).where(eq(branches.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}
