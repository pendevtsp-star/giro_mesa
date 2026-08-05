import {
  auditLogs,
  cashMovements,
  cashSessions,
  orders,
  outboxEvents,
  payments,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { netPaymentSumSql, paymentLedgerDeltaSql } from "../../common/payment-ledger";
import { DatabaseService } from "../database/database.service";

type TransactionClient = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];
type CashDbClient = DatabaseService["db"] | TransactionClient;

@Injectable()
export class CashRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async findCurrentCashSession(context: TenantContext, branchId: string) {
    const [session] = await this.database.db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.branchId, branchId)))
      .orderBy(desc(cashSessions.openedAt))
      .limit(1);
    return session ?? null;
  }

  async findOpenCashSession(
    context: TenantContext,
    branchId: string,
    client: CashDbClient = this.database.db,
  ) {
    const [session] = await client
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.tenantId, context.tenantId),
          eq(cashSessions.branchId, branchId),
          eq(cashSessions.status, "open"),
        ),
      )
      .limit(1);
    return session ?? null;
  }

  async findOpenCashSessionForUpdate(
    context: TenantContext,
    branchId: string,
    client: TransactionClient,
  ) {
    const [session] = await client
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.tenantId, context.tenantId),
          eq(cashSessions.branchId, branchId),
          eq(cashSessions.status, "open"),
        ),
      )
      .for("update")
      .limit(1);
    return session ?? null;
  }

  async findCashSessionById(
    context: TenantContext,
    cashSessionId: string,
    client: CashDbClient = this.database.db,
  ) {
    const [session] = await client
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.id, cashSessionId)))
      .limit(1);
    return session ?? null;
  }

  async findCashSessionByIdForUpdate(
    context: TenantContext,
    cashSessionId: string,
    client: TransactionClient,
  ) {
    const [session] = await client
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.id, cashSessionId)))
      .for("update")
      .limit(1);
    return session ?? null;
  }

  async findCashSessionByCloseKey(
    context: TenantContext,
    idempotencyKey: string,
    client: CashDbClient = this.database.db,
  ) {
    const [session] = await client
      .select()
      .from(cashSessions)
      .where(
        and(
          eq(cashSessions.tenantId, context.tenantId),
          eq(cashSessions.closeIdempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return session ?? null;
  }

  async findCashMovements(
    context: TenantContext,
    sessionId: string,
    client: CashDbClient = this.database.db,
  ) {
    return client
      .select({
        id: cashMovements.id,
        type: cashMovements.type,
        amountCents: cashMovements.amountCents,
        reason: cashMovements.reason,
        createdAt: cashMovements.createdAt,
      })
      .from(cashMovements)
      .where(
        and(
          eq(cashMovements.tenantId, context.tenantId),
          eq(cashMovements.cashSessionId, sessionId),
        ),
      );
  }

  async findPaymentsByMethod(
    context: TenantContext,
    branchId: string,
    session: { openedAt: Date; closedAt: Date | null } | null,
  ) {
    return this.database.db
      .select({
        method: payments.method,
        totalCents: netPaymentSumSql(),
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.tenantId, context.tenantId),
          sql`${paymentLedgerDeltaSql()} <> 0`,
          eq(orders.branchId, branchId),
          session ? sql`${payments.confirmedAt} >= ${session.openedAt}` : sql`true`,
          session?.closedAt ? sql`${payments.confirmedAt} <= ${session.closedAt}` : sql`true`,
        ),
      )
      .groupBy(payments.method);
  }

  async findCashHandovers(
    context: TenantContext,
    branchId: string,
    session: { openedAt: Date; closedAt: Date | null } | null,
    client: CashDbClient = this.database.db,
  ) {
    return client
      .select({
        id: payments.id,
        amountCents: paymentLedgerDeltaSql(),
        status: payments.cashHandoverStatus,
        registeredByUserId: payments.registeredByUserId,
        registeredVia: payments.registeredVia,
        createdAt: payments.createdAt,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.tenantId, context.tenantId),
          sql`${paymentLedgerDeltaSql()} <> 0`,
          eq(payments.method, "cash"),
          eq(orders.branchId, branchId),
          session ? sql`${payments.confirmedAt} >= ${session.openedAt}` : sql`true`,
          session?.closedAt ? sql`${payments.confirmedAt} <= ${session.closedAt}` : sql`true`,
        ),
      )
      .orderBy(desc(payments.createdAt));
  }

  async countOpenOrders(
    context: TenantContext,
    branchId: string,
    client: CashDbClient = this.database.db,
  ) {
    const [openOrders] = await client
      .select({
        count: sql<number>`count(${orders.id})`,
        totalCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, context.tenantId),
          eq(orders.branchId, branchId),
          inArray(orders.status, [
            "opened",
            "sent_to_kitchen",
            "preparing",
            "ready",
            "served",
            "waiting_payment",
            "partially_paid",
          ]),
        ),
      );
    return {
      count: Number(openOrders?.count ?? 0),
      totalCents: Number(openOrders?.totalCents ?? 0),
    };
  }

  async insertCashSession(
    context: TenantContext,
    data: Omit<typeof cashSessions.$inferInsert, "tenantId">,
    client: CashDbClient = this.database.db,
  ) {
    const [session] = await client
      .insert(cashSessions)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return session ?? null;
  }

  async updateCashSession(
    context: TenantContext,
    sessionId: string,
    data: Partial<typeof cashSessions.$inferInsert>,
    expectedVersion?: number,
    client: CashDbClient = this.database.db,
  ) {
    const [updated] = await client
      .update(cashSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(cashSessions.tenantId, context.tenantId),
          eq(cashSessions.id, sessionId),
          expectedVersion === undefined ? undefined : eq(cashSessions.version, expectedVersion),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async insertCashMovement(
    context: TenantContext,
    data: Omit<typeof cashMovements.$inferInsert, "tenantId">,
    client: CashDbClient = this.database.db,
  ) {
    const [movement] = await client
      .insert(cashMovements)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return movement ?? null;
  }

  async insertAuditLog(
    context: TenantContext,
    data: Omit<typeof auditLogs.$inferInsert, "tenantId">,
    client: CashDbClient = this.database.db,
  ) {
    const [log] = await client
      .insert(auditLogs)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return log ?? null;
  }

  async insertOutboxEvent(
    context: TenantContext,
    data: Omit<typeof outboxEvents.$inferInsert, "tenantId">,
    client: CashDbClient = this.database.db,
  ) {
    const [event] = await client
      .insert(outboxEvents)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return event ?? null;
  }
}
