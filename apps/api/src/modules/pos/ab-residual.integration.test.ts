import * as schema from "@giromesa/db";
import {
  approvalRequests,
  auditLogs,
  branches,
  diningTables,
  floorAreas,
  operationalEvents,
  operationalShifts,
  operationIdempotency,
  tableEvents,
  tableWaiterAssignments,
  tenants,
  users,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ApprovalsService } from "../approvals/approvals.service";
import type { DatabaseService } from "../database/database.service";
import { WaiterAssignmentService } from "./waiter-assignment.service";

type Db = NodePgDatabase<typeof schema>;
const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const databaseUrl =
  process.env.DATABASE_URL ?? "postgres://giromesa:giromesa@localhost:55434/giromesa_validation";

runIntegration("A/B residual managerial assignments and receipts", () => {
  let pool: Pool;
  let db: Db;
  let service: WaiterAssignmentService;
  let fixture: Awaited<ReturnType<typeof createFixture>>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    service = new WaiterAssignmentService({ db } as DatabaseService, {} as ApprovalsService);
    fixture = await createFixture(db);
  });

  afterAll(async () => {
    if (fixture) await cleanup(db, fixture.tenantA.id, fixture.tenantB.id);
    await pool.end();
  });

  it("copies only active waiters from the prior shift and assigns an entire sector", async () => {
    const copied = await service.copyPreviousShift(fixture.managerContext, fixture.branchA.id);
    expect(copied.copied).toHaveLength(1);
    expect(copied.copied[0]).toMatchObject({
      tableId: fixture.tableA.id,
      waiterUserId: fixture.waiterA.id,
      version: 1,
    });

    const batch = await service.assignBatch(
      { ...fixture.managerContext, requestId: "ab-batch-sector" },
      {
        branchId: fixture.branchA.id,
        waiterUserId: fixture.waiterB.id,
        areaId: fixture.area.id,
        expectedVersions: { [fixture.tableA.id]: 1, [fixture.tableB.id]: 0 },
        reason: "Distribuição do setor principal",
      },
    );
    expect(batch.count).toBe(2);
    expect(
      Object.fromEntries(
        batch.assignments.map((assignment) => [assignment.tableId, assignment.version]),
      ),
    ).toEqual({ [fixture.tableA.id]: 2, [fixture.tableB.id]: 1 });
  });

  it("rejects stale versions and cross-tenant table batches atomically", async () => {
    await expect(
      service.assign(
        { ...fixture.managerContext, requestId: "ab-stale-version" },
        {
          branchId: fixture.branchA.id,
          tableId: fixture.tableA.id,
          waiterUserId: fixture.waiterA.id,
          expectedVersion: 1,
          reason: "Comando antigo",
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    await expect(
      service.assignBatch(
        { ...fixture.managerContext, requestId: "ab-cross-tenant" },
        {
          branchId: fixture.branchA.id,
          waiterUserId: fixture.waiterA.id,
          tableIds: [fixture.tableA.id, fixture.otherTable.id],
          reason: "Lote inválido",
        },
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await currentAssignment(db, fixture.tenantA.id, fixture.tableA.id)).toMatchObject({
      waiterUserId: fixture.waiterB.id,
      version: 2,
    });
  });

  it("redistributes inactive assignments and returns an immutable queryable help receipt", async () => {
    const redistributed = await service.redistributeInactive(
      { ...fixture.managerContext, requestId: "ab-redistribute" },
      {
        branchId: fixture.branchA.id,
        waiterUserId: fixture.waiterA.id,
        tableIds: [fixture.tableC.id],
        expectedVersions: { [fixture.tableC.id]: 1 },
        reason: "Garçom indisponível",
      },
    );
    expect(redistributed.assignments[0]).toMatchObject({
      waiterUserId: fixture.waiterA.id,
      version: 2,
    });

    const input = {
      branchId: fixture.branchA.id,
      tableId: fixture.tableA.id,
      reason: "Apoio pontual no atendimento",
      idempotencyKey: "ab-help-idempotency-0001",
      expectedAssignmentVersion: 2,
    };
    const first = await service.requestHelp(fixture.waiterAContext, input);
    const replay = await service.requestHelp(
      { ...fixture.waiterAContext, requestId: "ab-help-replay" },
      input,
    );
    expect(replay).toEqual(first);
    await expect(
      service.requestHelp(
        { ...fixture.waiterAContext, requestId: "ab-help-mutated" },
        { ...input, reason: "Payload alterado" },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    const [stored] = await db
      .select({ status: operationIdempotency.status, response: operationIdempotency.response })
      .from(operationIdempotency)
      .where(
        and(
          eq(operationIdempotency.tenantId, fixture.tenantA.id),
          eq(operationIdempotency.scope, "waiter.help_request"),
          eq(operationIdempotency.idempotencyKey, input.idempotencyKey),
        ),
      );
    expect(stored?.status).toBe("completed");
    expect(stored?.response).toMatchObject({ receipt: { version: 2 } });
  });
});

async function createFixture(db: Db) {
  const suffix = Date.now();
  const [tenantA, tenantB] = await db
    .insert(tenants)
    .values([
      { name: "AB A", slug: `ab-a-${suffix}`, status: "active" },
      { name: "AB B", slug: `ab-b-${suffix}`, status: "active" },
    ])
    .returning();
  if (!tenantA || !tenantB) throw new Error("Unable to create AB tenants");
  const [branchA, branchB] = await db
    .insert(branches)
    .values([
      { tenantId: tenantA.id, name: "Matriz A" },
      { tenantId: tenantB.id, name: "Matriz B" },
    ])
    .returning();
  if (!branchA || !branchB) throw new Error("Unable to create AB branches");
  const [manager, waiterA, waiterB, inactive] = await db
    .insert(users)
    .values([
      { tenantId: tenantA.id, email: `manager-${suffix}@ab.local`, name: "Gerente" },
      { tenantId: tenantA.id, email: `waiter-a-${suffix}@ab.local`, name: "Garçom A" },
      { tenantId: tenantA.id, email: `waiter-b-${suffix}@ab.local`, name: "Garçom B" },
      {
        tenantId: tenantA.id,
        email: `inactive-${suffix}@ab.local`,
        name: "Garçom inativo",
        isActive: false,
      },
    ])
    .returning();
  if (!manager || !waiterA || !waiterB || !inactive) throw new Error("Unable to create AB users");
  const [area] = await db
    .insert(floorAreas)
    .values({ tenantId: tenantA.id, branchId: branchA.id, name: "Salão principal" })
    .returning();
  if (!area) throw new Error("Unable to create AB area");
  const [tableA, tableB, tableC] = await db
    .insert(diningTables)
    .values([
      {
        tenantId: tenantA.id,
        branchId: branchA.id,
        areaId: area.id,
        code: "A01",
        name: "Mesa A01",
        seats: 4,
      },
      {
        tenantId: tenantA.id,
        branchId: branchA.id,
        areaId: area.id,
        code: "A02",
        name: "Mesa A02",
        seats: 4,
      },
      { tenantId: tenantA.id, branchId: branchA.id, code: "A03", name: "Mesa A03", seats: 4 },
    ])
    .returning();
  const [otherTable] = await db
    .insert(diningTables)
    .values({
      tenantId: tenantB.id,
      branchId: branchB.id,
      code: "B01",
      name: "Mesa B01",
      seats: 4,
    })
    .returning();
  if (!tableA || !tableB || !tableC || !otherTable) throw new Error("Unable to create AB tables");
  const [previousShift] = await db
    .insert(operationalShifts)
    .values({
      tenantId: tenantA.id,
      branchId: branchA.id,
      openedByUserId: manager.id,
      status: "closed",
      openedAt: new Date(Date.now() - 86_400_000),
      closedAt: new Date(Date.now() - 80_000_000),
    })
    .returning();
  const [currentShift] = await db
    .insert(operationalShifts)
    .values({ tenantId: tenantA.id, branchId: branchA.id, openedByUserId: manager.id })
    .returning();
  if (!previousShift || !currentShift) throw new Error("Unable to create AB shifts");
  await db.insert(tableWaiterAssignments).values([
    {
      tenantId: tenantA.id,
      branchId: branchA.id,
      shiftId: previousShift.id,
      tableId: tableA.id,
      waiterUserId: waiterA.id,
      assignedByUserId: manager.id,
      source: "manager",
      endedAt: previousShift.closedAt,
    },
    {
      tenantId: tenantA.id,
      branchId: branchA.id,
      shiftId: previousShift.id,
      tableId: tableB.id,
      waiterUserId: inactive.id,
      assignedByUserId: manager.id,
      source: "manager",
      endedAt: previousShift.closedAt,
    },
    {
      tenantId: tenantA.id,
      branchId: branchA.id,
      shiftId: currentShift.id,
      tableId: tableC.id,
      waiterUserId: inactive.id,
      assignedByUserId: manager.id,
      source: "manager",
    },
  ]);
  const managerContext: TenantContext = {
    tenantId: tenantA.id,
    branchId: branchA.id,
    userId: manager.id,
    requestId: "ab-manager",
    permissions: ["tenant:manage", "pos:operate"],
  };
  const waiterAContext: TenantContext = {
    tenantId: tenantA.id,
    branchId: branchA.id,
    userId: waiterA.id,
    requestId: "ab-help",
    permissions: ["pos:operate"],
  };
  return {
    tenantA,
    tenantB,
    branchA,
    managerContext,
    waiterAContext,
    waiterA,
    waiterB,
    area,
    tableA,
    tableB,
    tableC,
    otherTable,
  };
}

async function currentAssignment(db: Db, tenantId: string, tableId: string) {
  const [assignment] = await db
    .select()
    .from(tableWaiterAssignments)
    .where(
      and(
        eq(tableWaiterAssignments.tenantId, tenantId),
        eq(tableWaiterAssignments.tableId, tableId),
        isNull(tableWaiterAssignments.endedAt),
      ),
    );
  return assignment;
}

async function cleanup(db: Db, tenantA: string, tenantB: string) {
  const tenantIds = [tenantA, tenantB];
  for (const tenantId of tenantIds) {
    await db.delete(operationIdempotency).where(eq(operationIdempotency.tenantId, tenantId));
    await db.delete(operationalEvents).where(eq(operationalEvents.tenantId, tenantId));
    await db.delete(auditLogs).where(eq(auditLogs.tenantId, tenantId));
    await db.delete(tableEvents).where(eq(tableEvents.tenantId, tenantId));
    await db.delete(approvalRequests).where(eq(approvalRequests.tenantId, tenantId));
    await db.delete(tableWaiterAssignments).where(eq(tableWaiterAssignments.tenantId, tenantId));
    await db.delete(operationalShifts).where(eq(operationalShifts.tenantId, tenantId));
    await db.delete(diningTables).where(eq(diningTables.tenantId, tenantId));
    await db.delete(floorAreas).where(eq(floorAreas.tenantId, tenantId));
    await db.delete(users).where(eq(users.tenantId, tenantId));
    await db.delete(branches).where(eq(branches.tenantId, tenantId));
    await db.delete(tenants).where(eq(tenants.id, tenantId));
  }
}
