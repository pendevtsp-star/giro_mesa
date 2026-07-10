import * as schema from "@giromesa/db";
import { branches, cashSessions, orders, payments, tenants, users } from "@giromesa/db";
import { eq } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DatabaseService } from "../database/database.service";
import { ReportsService } from "./reports.service";

type Db = NodePgDatabase<typeof schema>;

const runIntegration = process.env.RUN_DB_INTEGRATION_TESTS === "true" ? describe : describe.skip;

const databaseUrl =
  process.env.DATABASE_URL ??
  (process.env.CI
    ? "postgres://giromesa:giromesa@localhost:5432/giromesa"
    : "postgres://giromesa:giromesa@localhost:55432/giromesa");

async function cleanupTenant(db: Db, tenantId: string) {
  await db.delete(payments).where(eq(payments.tenantId, tenantId));
  await db.delete(orders).where(eq(orders.tenantId, tenantId));
  await db.delete(cashSessions).where(eq(cashSessions.tenantId, tenantId));
  await db.delete(users).where(eq(users.tenantId, tenantId));
  await db.delete(branches).where(eq(branches.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
}

async function createReportsFixture(db: Db) {
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: "Reports Test",
      slug: `reports-test-${Date.now()}`,
      status: "active",
    })
    .returning();
  if (!tenant) {
    throw new Error("Failed to create reports test tenant");
  }

  const [branch] = await db
    .insert(branches)
    .values({ tenantId: tenant.id, name: "Matriz" })
    .returning();
  const [operator] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: `reports-${Date.now()}@example.test`,
      name: "Operador Relatorios",
      isActive: true,
    })
    .returning();

  if (!branch || !operator) {
    throw new Error("Failed to create reports test branch or user");
  }

  const [balancedSession] = await db
    .insert(cashSessions)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      operatorId: operator.id,
      status: "closed",
      openingAmountCents: 10000,
      expectedAmountCents: 19000,
      countedAmountCents: 19000,
      openedAt: new Date("2026-07-07T12:00:00.000Z"),
      closedAt: new Date("2026-07-07T15:00:00.000Z"),
    })
    .returning();

  const [divergentSession] = await db
    .insert(cashSessions)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      operatorId: operator.id,
      status: "disputed",
      openingAmountCents: 8000,
      expectedAmountCents: 16000,
      countedAmountCents: 15000,
      openedAt: new Date("2026-07-07T18:00:00.000Z"),
      closedAt: new Date("2026-07-07T22:00:00.000Z"),
    })
    .returning();

  if (!balancedSession || !divergentSession) {
    throw new Error("Failed to create reports test cash sessions");
  }

  const [pixOrder] = await db
    .insert(orders)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      channel: "counter",
      status: "paid",
      subtotalCents: 9000,
      totalCents: 9000,
      openedAt: new Date("2026-07-07T12:30:00.000Z"),
      closedAt: new Date("2026-07-07T12:50:00.000Z"),
    })
    .returning();
  const [cashOrder] = await db
    .insert(orders)
    .values({
      tenantId: tenant.id,
      branchId: branch.id,
      channel: "table",
      status: "paid",
      subtotalCents: 7000,
      totalCents: 7000,
      openedAt: new Date("2026-07-07T18:20:00.000Z"),
      closedAt: new Date("2026-07-07T18:50:00.000Z"),
    })
    .returning();

  if (!pixOrder || !cashOrder) {
    throw new Error("Failed to create reports test orders");
  }

  await db.insert(payments).values([
    {
      tenantId: tenant.id,
      orderId: pixOrder.id,
      provider: "manual",
      method: "pix_manual",
      status: "confirmed",
      amountCents: 9000,
      idempotencyKey: `reports-pix-${Date.now()}`,
      confirmedAt: new Date("2026-07-07T13:10:00.000Z"),
      createdAt: new Date("2026-07-07T13:10:00.000Z"),
      updatedAt: new Date("2026-07-07T13:10:00.000Z"),
    },
    {
      tenantId: tenant.id,
      orderId: cashOrder.id,
      provider: "manual",
      method: "cash",
      status: "confirmed",
      amountCents: 7000,
      idempotencyKey: `reports-cash-${Date.now()}`,
      confirmedAt: new Date("2026-07-07T19:00:00.000Z"),
      createdAt: new Date("2026-07-07T19:00:00.000Z"),
      updatedAt: new Date("2026-07-07T19:00:00.000Z"),
    },
  ]);

  return { tenant, branch, operator };
}

runIntegration("ReportsService filters", () => {
  let pool: Pool;
  let db: Db;
  let reportsService: ReportsService;
  let fixture: Awaited<ReturnType<typeof createReportsFixture>>;

  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    db = drizzle(pool, { schema });
    reportsService = new ReportsService({ db } as DatabaseService);
    fixture = await createReportsFixture(db);
  });

  afterAll(async () => {
    if (fixture?.tenant.id) {
      await cleanupTenant(db, fixture.tenant.id);
    }
    await pool.end();
  });

  it("filters report by payment method", async () => {
    const report = await reportsService.financialReport(
      {
        tenantId: fixture.tenant.id,
        branchId: fixture.branch.id,
        userId: fixture.operator.id,
        requestId: "reports-it-method",
        permissions: ["reports:read"],
      },
      {
        branchId: fixture.branch.id,
        period: "custom",
        variance: "all",
        paymentMethod: "pix_manual",
        dateFrom: new Date("2026-07-07T00:00:00.000Z"),
        dateTo: new Date("2026-07-08T00:00:00.000Z"),
      },
    );

    expect(report.payments.totalCents).toBe(9000);
    expect(report.payments.count).toBe(1);
    expect(report.payments.byMethod).toEqual({ pix_manual: 9000 });
    expect(report.payments.mix).toHaveLength(1);
    expect(report.cashSessions).toHaveLength(2);
    expect(report.cashSessions[0]?.paymentsTotalCents).toBe(0);
    expect(report.cashSessions[1]?.paymentsTotalCents).toBe(9000);
  });

  it("filters report by divergent variance only", async () => {
    const report = await reportsService.financialReport(
      {
        tenantId: fixture.tenant.id,
        branchId: fixture.branch.id,
        userId: fixture.operator.id,
        requestId: "reports-it-variance",
        permissions: ["reports:read"],
      },
      {
        branchId: fixture.branch.id,
        period: "custom",
        variance: "divergent",
        dateFrom: new Date("2026-07-07T00:00:00.000Z"),
        dateTo: new Date("2026-07-08T00:00:00.000Z"),
      },
    );

    expect(report.cashSessions).toHaveLength(1);
    expect(report.cashSessions[0]?.status).toBe("disputed");
    expect(report.cashManagement?.balancedSessions).toBe(0);
    expect(report.cashManagement?.divergentSessions).toBe(1);
    expect(report.operators?.[0]?.cashSessionCount).toBe(1);
  });

  it("filters report by cash session status", async () => {
    const report = await reportsService.financialReport(
      {
        tenantId: fixture.tenant.id,
        branchId: fixture.branch.id,
        userId: fixture.operator.id,
        requestId: "reports-it-status",
        permissions: ["reports:read"],
      },
      {
        branchId: fixture.branch.id,
        period: "custom",
        variance: "all",
        cashSessionStatus: "closed",
        dateFrom: new Date("2026-07-07T00:00:00.000Z"),
        dateTo: new Date("2026-07-08T00:00:00.000Z"),
      },
    );

    expect(report.cashSessions).toHaveLength(1);
    expect(report.cashSessions[0]?.status).toBe("closed");
    expect(report.cashManagement?.sessionsClosed).toBe(1);
    expect(report.cashManagement?.divergentSessions).toBe(0);
  });

  it("filters report by a specific cash session", async () => {
    const allSessions = await reportsService.financialReport(
      {
        tenantId: fixture.tenant.id,
        branchId: fixture.branch.id,
        userId: fixture.operator.id,
        requestId: "reports-it-session-all",
        permissions: ["reports:read"],
      },
      {
        branchId: fixture.branch.id,
        period: "custom",
        variance: "all",
        dateFrom: new Date("2026-07-07T00:00:00.000Z"),
        dateTo: new Date("2026-07-08T00:00:00.000Z"),
      },
    );

    const targetSessionId = allSessions.cashSessions?.find(
      (session) => session.status === "closed",
    )?.id;
    expect(targetSessionId).toBeTruthy();

    const report = await reportsService.financialReport(
      {
        tenantId: fixture.tenant.id,
        branchId: fixture.branch.id,
        userId: fixture.operator.id,
        requestId: "reports-it-session-one",
        permissions: ["reports:read"],
      },
      {
        branchId: fixture.branch.id,
        cashSessionId: targetSessionId,
        period: "custom",
        variance: "all",
        dateFrom: new Date("2026-07-07T00:00:00.000Z"),
        dateTo: new Date("2026-07-08T00:00:00.000Z"),
      },
    );

    expect(report.cashSessions).toHaveLength(1);
    expect(report.cashSessions[0]?.id).toBe(targetSessionId);
    expect(report.cashManagement?.sessionsClosed).toBe(1);
  });

  it("filters report by balanced variance only", async () => {
    const report = await reportsService.financialReport(
      {
        tenantId: fixture.tenant.id,
        branchId: fixture.branch.id,
        userId: fixture.operator.id,
        requestId: "reports-it-balanced",
        permissions: ["reports:read"],
      },
      {
        branchId: fixture.branch.id,
        period: "custom",
        variance: "balanced",
        dateFrom: new Date("2026-07-07T00:00:00.000Z"),
        dateTo: new Date("2026-07-08T00:00:00.000Z"),
      },
    );

    expect(report.cashSessions).toHaveLength(1);
    expect(report.cashSessions[0]?.status).toBe("closed");
    expect(report.cashManagement?.balancedSessions).toBe(1);
    expect(report.cashManagement?.divergentSessions).toBe(0);
  });
});
