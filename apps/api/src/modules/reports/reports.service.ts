import {
  cashSessions,
  orderItems,
  orders,
  payments,
  recipeItems,
  recipes,
  users,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

type FinancialReportInput = {
  branchId?: string | undefined;
  cashSessionId?: string | undefined;
  paymentMethod?: string | undefined;
  variance: "all" | "divergent" | "balanced";
  cashSessionStatus?: "open" | "closed" | "reconciled" | "disputed" | undefined;
  period: "today" | "week" | "month" | "shift" | "custom";
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
};

@Injectable()
export class ReportsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async financialReport(context: TenantContext, input: FinancialReportInput) {
    const branchId = input.branchId ?? context.branchId;
    if (!branchId) {
      throw new BadRequestException("branchId is required");
    }

    let { from, to } = this.periodWindow(input);
    if (input.cashSessionId) {
      const [selectedSession] = await this.database.db
        .select({
          id: cashSessions.id,
          openedAt: cashSessions.openedAt,
          closedAt: cashSessions.closedAt,
        })
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.tenantId, context.tenantId),
            eq(cashSessions.branchId, branchId),
            eq(cashSessions.id, input.cashSessionId),
          ),
        )
        .limit(1);

      if (!selectedSession) {
        throw new BadRequestException("cashSessionId is invalid for this branch");
      }

      from = selectedSession.openedAt;
      to = selectedSession.closedAt ?? undefined;
    }
    const previous = this.previousPeriodWindow(from, to);
    const paymentFilters = [
      eq(payments.tenantId, context.tenantId),
      eq(orders.branchId, branchId),
      eq(payments.status, "confirmed"),
      gte(payments.createdAt, from),
    ];
    if (input.paymentMethod) {
      paymentFilters.push(eq(payments.method, input.paymentMethod));
    }
    if (to) {
      paymentFilters.push(lte(payments.createdAt, to));
    }

    const paymentRows = await this.database.db
      .select({
        method: payments.method,
        totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
        count: sql<number>`count(${payments.id})::int`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(and(...paymentFilters))
      .groupBy(payments.method);

    const previousPaymentFilters = [
      eq(payments.tenantId, context.tenantId),
      eq(orders.branchId, branchId),
      eq(payments.status, "confirmed"),
      gte(payments.createdAt, previous.from),
    ];
    if (input.paymentMethod) {
      previousPaymentFilters.push(eq(payments.method, input.paymentMethod));
    }
    if (previous.to) {
      previousPaymentFilters.push(lte(payments.createdAt, previous.to));
    }

    const previousPaymentRows = await this.database.db
      .select({
        totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
        count: sql<number>`count(${payments.id})::int`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(and(...previousPaymentFilters));

    const channelRows = await this.database.db
      .select({
        channel: orders.channel,
        totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
        count: sql<number>`count(${payments.id})::int`,
      })
      .from(payments)
      .innerJoin(orders, eq(orders.id, payments.orderId))
      .where(and(...paymentFilters))
      .groupBy(orders.channel);

    const [openOrders] = await this.database.db
      .select({
        count: sql<number>`count(${orders.id})::int`,
        totalCents: sql<number>`coalesce(sum(${orders.totalCents}), 0)::int`,
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

    const sessionRows = await this.database.db
      .select({
        id: cashSessions.id,
        operatorId: cashSessions.operatorId,
        operatorName: users.name,
        status: cashSessions.status,
        openingAmountCents: cashSessions.openingAmountCents,
        expectedAmountCents: cashSessions.expectedAmountCents,
        countedAmountCents: cashSessions.countedAmountCents,
        openedAt: cashSessions.openedAt,
        closedAt: cashSessions.closedAt,
      })
      .from(cashSessions)
      .innerJoin(users, eq(users.id, cashSessions.operatorId))
      .where(
        and(
          eq(cashSessions.tenantId, context.tenantId),
          eq(cashSessions.branchId, branchId),
          gte(cashSessions.openedAt, from),
          to ? lte(cashSessions.openedAt, to) : sql`true`,
          input.cashSessionStatus ? eq(cashSessions.status, input.cashSessionStatus) : sql`true`,
          input.cashSessionId ? eq(cashSessions.id, input.cashSessionId) : sql`true`,
        ),
      )
      .orderBy(cashSessions.openedAt);

    const cashSessionSummaries = await Promise.all(
      sessionRows.map(async (session) => {
        const [sessionPayments] = await this.database.db
          .select({
            totalCents: sql<number>`coalesce(sum(${payments.amountCents}), 0)::int`,
            count: sql<number>`count(${payments.id})::int`,
          })
          .from(payments)
          .innerJoin(orders, eq(orders.id, payments.orderId))
          .where(
            and(
              eq(payments.tenantId, context.tenantId),
              eq(payments.status, "confirmed"),
              input.paymentMethod ? eq(payments.method, input.paymentMethod) : sql`true`,
              eq(orders.branchId, branchId),
              gte(payments.confirmedAt, session.openedAt),
              session.closedAt ? lte(payments.confirmedAt, session.closedAt) : sql`true`,
            ),
          );

        return {
          id: session.id,
          operatorId: session.operatorId,
          operatorName: session.operatorName,
          status: session.status,
          openingAmountCents: session.openingAmountCents,
          expectedAmountCents: session.expectedAmountCents,
          countedAmountCents: session.countedAmountCents,
          differenceCents:
            session.countedAmountCents === null
              ? null
              : session.countedAmountCents - session.expectedAmountCents,
          paymentsTotalCents: Number(sessionPayments?.totalCents ?? 0),
          paymentsCount: Number(sessionPayments?.count ?? 0),
          openedAt: session.openedAt.toISOString(),
          closedAt: session.closedAt?.toISOString() ?? null,
        };
      }),
    );
    const visibleCashSessionSummaries = cashSessionSummaries.filter((session) => {
      if (input.variance === "divergent") {
        return (session.differenceCents ?? 0) !== 0;
      }
      if (input.variance === "balanced") {
        return (session.differenceCents ?? 0) === 0;
      }
      return true;
    });
    const operatorRollup = new Map<
      string,
      {
        operatorId: string;
        operatorName: string;
        paymentsTotalCents: number;
        paymentsCount: number;
        cashSessionCount: number;
      }
    >();
    for (const session of visibleCashSessionSummaries) {
      const current = operatorRollup.get(session.operatorId) ?? {
        operatorId: session.operatorId,
        operatorName: session.operatorName,
        paymentsTotalCents: 0,
        paymentsCount: 0,
        cashSessionCount: 0,
      };
      current.paymentsTotalCents += session.paymentsTotalCents;
      current.paymentsCount += session.paymentsCount;
      current.cashSessionCount += 1;
      operatorRollup.set(session.operatorId, current);
    }

    const totalCents = paymentRows.reduce((sum, row) => sum + Number(row.totalCents), 0);
    const count = paymentRows.reduce((sum, row) => sum + Number(row.count), 0);
    const byMethod = Object.fromEntries(
      paymentRows.map((row) => [row.method, Number(row.totalCents)]),
    );
    const soldItems = await this.database.db
      .select({
        productId: orderItems.productId,
        quantity: sql<number>`coalesce(sum(${orderItems.quantity}), 0)::numeric`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.tenantId, context.tenantId),
          eq(orders.branchId, branchId),
          gte(orderItems.createdAt, from),
          to ? lte(orderItems.createdAt, to) : sql`true`,
          sql`${orderItems.status} <> 'canceled'`,
        ),
      )
      .groupBy(orderItems.productId);
    const productIds = soldItems
      .map((item) => item.productId)
      .filter((id): id is string => Boolean(id));
    const recipeCosts = productIds.length
      ? await this.database.db
          .select({
            productId: recipes.productId,
            quantity: recipeItems.quantity,
            averageCostCents: sql<number>`coalesce((select average_cost_cents from inventory_items where id = ${recipeItems.inventoryItemId}), 0)::int`,
          })
          .from(recipes)
          .innerJoin(recipeItems, eq(recipeItems.recipeId, recipes.id))
          .where(
            and(eq(recipes.tenantId, context.tenantId), inArray(recipes.productId, productIds)),
          )
      : [];
    const soldByProduct = new Map(soldItems.map((item) => [item.productId, Number(item.quantity)]));
    const actualRecipeCostsCents = recipeCosts.reduce(
      (sum, item) =>
        sum +
        Math.round(
          (soldByProduct.get(item.productId) ?? 0) * Number(item.quantity) * item.averageCostCents,
        ),
      0,
    );
    const estimatedCostsCents =
      actualRecipeCostsCents > 0 ? actualRecipeCostsCents : Math.round(totalCents * 0.32);
    const averageTicketCents = count > 0 ? Math.round(totalCents / count) : 0;
    const previousTotalCents = Number(previousPaymentRows[0]?.totalCents ?? 0);
    const previousCount = Number(previousPaymentRows[0]?.count ?? 0);
    const operationalMarginCents = totalCents - estimatedCostsCents;
    const operationalMarginPercent =
      totalCents > 0 ? Number(((operationalMarginCents / totalCents) * 100).toFixed(1)) : 0;
    const paymentMix = paymentRows
      .map((row) => {
        const methodTotalCents = Number(row.totalCents);
        return {
          method: row.method,
          totalCents: methodTotalCents,
          count: Number(row.count),
          sharePercent:
            totalCents > 0 ? Number(((methodTotalCents / totalCents) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.totalCents - a.totalCents);
    const channelMix = channelRows
      .map((row) => {
        const channelTotalCents = Number(row.totalCents);
        return {
          channel: row.channel,
          totalCents: channelTotalCents,
          count: Number(row.count),
          sharePercent:
            totalCents > 0 ? Number(((channelTotalCents / totalCents) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.totalCents - a.totalCents);
    const deltaCents = totalCents - previousTotalCents;
    const deltaPercent =
      previousTotalCents > 0
        ? Number((((totalCents - previousTotalCents) / previousTotalCents) * 100).toFixed(1))
        : null;
    const sessionsOpen = visibleCashSessionSummaries.filter(
      (session) => session.status === "open",
    ).length;
    const sessionsClosed = visibleCashSessionSummaries.filter(
      (session) => session.status === "closed",
    ).length;
    const balancedSessions = visibleCashSessionSummaries.filter(
      (session) => (session.differenceCents ?? 0) === 0,
    ).length;
    const divergentSessions = visibleCashSessionSummaries.filter(
      (session) => (session.differenceCents ?? 0) !== 0,
    ).length;
    const totalDifferenceCents = visibleCashSessionSummaries.reduce(
      (sum, session) => sum + (session.differenceCents ?? 0),
      0,
    );
    const averageDifferenceCents =
      visibleCashSessionSummaries.length > 0
        ? Math.round(totalDifferenceCents / visibleCashSessionSummaries.length)
        : 0;
    const conferenceRatePercent =
      visibleCashSessionSummaries.length > 0
        ? Number(((balancedSessions / visibleCashSessionSummaries.length) * 100).toFixed(1))
        : 0;

    return {
      branchId,
      period: input.period,
      dateFrom: from.toISOString(),
      dateTo: to?.toISOString() ?? null,
      payments: {
        totalCents,
        count,
        byMethod,
        averageTicketCents,
        mix: paymentMix,
      },
      channels: channelMix,
      operators: Array.from(operatorRollup.values()).sort(
        (a, b) => b.paymentsTotalCents - a.paymentsTotalCents,
      ),
      cashSessions: visibleCashSessionSummaries.sort(
        (a, b) => new Date(b.openedAt).getTime() - new Date(a.openedAt).getTime(),
      ),
      cashManagement: {
        sessionsOpen,
        sessionsClosed,
        balancedSessions,
        divergentSessions,
        totalDifferenceCents,
        averageDifferenceCents,
        conferenceRatePercent,
      },
      openOrders: {
        count: Number(openOrders?.count ?? 0),
        totalCents: Number(openOrders?.totalCents ?? 0),
      },
      dre: {
        grossRevenueCents: totalCents,
        estimatedCostsCents,
        actualRecipeCostsCents,
        operationalMarginCents,
        operationalMarginPercent,
      },
      commercial: {
        averageTicketCents,
        openOrdersExposureCents: Number(openOrders?.totalCents ?? 0),
        previousTotalCents,
        previousCount,
        deltaCents,
        deltaPercent,
        previousDateFrom: previous.from.toISOString(),
        previousDateTo: previous.to?.toISOString() ?? null,
        receivedVsOpenRatio:
          Number(openOrders?.totalCents ?? 0) > 0
            ? Number((totalCents / Number(openOrders?.totalCents ?? 1)).toFixed(2))
            : null,
        closeReadiness:
          Number(openOrders?.count ?? 0) === 0
            ? "ready"
            : Number(openOrders?.totalCents ?? 0) > totalCents * 0.3
              ? "attention"
              : "monitor",
      },
    };
  }

  async productSalesReport(context: TenantContext, input: FinancialReportInput) {
    const branchId = input.branchId ?? context.branchId;
    if (!branchId) {
      throw new BadRequestException("branchId is required");
    }
    const { from, to } = this.periodWindow(input);
    const rows = await this.database.db
      .select({
        productId: orderItems.productId,
        name: orderItems.nameSnapshot,
        quantity: sql<string>`coalesce(sum(${orderItems.quantity}), 0)`,
        revenueCents: sql<number>`coalesce(sum(${orderItems.totalCents}), 0)::int`,
        averageUnitCents: sql<number>`coalesce(avg(${orderItems.unitPriceCents}), 0)::int`,
        orderCount: sql<number>`count(distinct ${orders.id})::int`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orderItems.tenantId, context.tenantId),
          eq(orders.branchId, branchId),
          gte(orderItems.createdAt, from),
          to ? lte(orderItems.createdAt, to) : sql`true`,
          sql`${orderItems.status} <> 'canceled'`,
        ),
      )
      .groupBy(orderItems.productId, orderItems.nameSnapshot)
      .orderBy(sql`sum(${orderItems.totalCents}) desc`)
      .limit(30);
    const totalCents = rows.reduce((sum, row) => sum + Number(row.revenueCents), 0);
    return {
      branchId,
      period: input.period,
      dateFrom: from.toISOString(),
      dateTo: to?.toISOString() ?? null,
      totalCents,
      products: rows.map((row) => ({
        productId: row.productId,
        name: row.name,
        quantity: Number(row.quantity),
        revenueCents: Number(row.revenueCents),
        averageUnitCents: Number(row.averageUnitCents),
        orderCount: Number(row.orderCount),
        sharePercent:
          totalCents > 0 ? Number(((Number(row.revenueCents) / totalCents) * 100).toFixed(1)) : 0,
      })),
    };
  }

  private periodWindow(input: FinancialReportInput) {
    if (input.period === "custom") {
      if (!input.dateFrom) {
        throw new BadRequestException("dateFrom is required for custom period");
      }
      return { from: input.dateFrom, to: input.dateTo };
    }

    const now = new Date();
    if (input.period === "week") {
      return { from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), to: undefined };
    }
    if (input.period === "month") {
      return { from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), to: undefined };
    }
    const start = new Date(now);
    start.setHours(input.period === "shift" ? 12 : 0, 0, 0, 0);
    return { from: start, to: undefined };
  }

  private previousPeriodWindow(from: Date, to?: Date) {
    const currentTo = to ?? new Date();
    const durationMs = Math.max(60_000, currentTo.getTime() - from.getTime());
    const previousTo = new Date(from.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - durationMs);
    return { from: previousFrom, to: previousTo };
  }
}
