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
import { DatabaseService } from "../database/database.service";

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

  async findOpenCashSession(context: TenantContext, branchId: string) {
    const [session] = await this.database.db
      .select({ id: cashSessions.id })
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

  async findCashSessionById(context: TenantContext, cashSessionId: string) {
    const [session] = await this.database.db
      .select()
      .from(cashSessions)
      .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.id, cashSessionId)))
      .limit(1);
    return session ?? null;
  }

  async findCashMovements(context: TenantContext, sessionId: string) {
    return this.database.db
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
        totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(
        and(
          eq(payments.tenantId, context.tenantId),
          eq(payments.status, "confirmed"),
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
  ) {
    return this.database.db
      .select({
        id: payments.id,
        amountCents: payments.amountCents,
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
          eq(payments.status, "confirmed"),
          eq(payments.method, "cash"),
          eq(orders.branchId, branchId),
          session ? sql`${payments.confirmedAt} >= ${session.openedAt}` : sql`true`,
          session?.closedAt ? sql`${payments.confirmedAt} <= ${session.closedAt}` : sql`true`,
        ),
      )
      .orderBy(desc(payments.createdAt));
  }

  async countOpenOrders(context: TenantContext, branchId: string) {
    const [openOrders] = await this.database.db
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
  ) {
    const [session] = await this.database.db
      .insert(cashSessions)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return session ?? null;
  }

  async updateCashSession(
    context: TenantContext,
    sessionId: string,
    data: Partial<typeof cashSessions.$inferInsert>,
  ) {
    const [updated] = await this.database.db
      .update(cashSessions)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(cashSessions.tenantId, context.tenantId), eq(cashSessions.id, sessionId)))
      .returning();
    return updated ?? null;
  }

  async insertCashMovement(
    context: TenantContext,
    data: Omit<typeof cashMovements.$inferInsert, "tenantId">,
  ) {
    const [movement] = await this.database.db
      .insert(cashMovements)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return movement ?? null;
  }

  async insertAuditLog(
    context: TenantContext,
    data: Omit<typeof auditLogs.$inferInsert, "tenantId">,
  ) {
    const [log] = await this.database.db
      .insert(auditLogs)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return log ?? null;
  }

  async insertOutboxEvent(
    context: TenantContext,
    data: Omit<typeof outboxEvents.$inferInsert, "tenantId">,
  ) {
    const [event] = await this.database.db
      .insert(outboxEvents)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return event ?? null;
  }
}
