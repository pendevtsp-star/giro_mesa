import { auditLogs, diningTables, kdsStations, kdsTickets, orders } from "@giromesa/db";
import { type OrderItemStatus, stateMachines, type TenantContext } from "@giromesa/domain";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class KdsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listStations(context: TenantContext) {
    const conditions = [eq(kdsStations.tenantId, context.tenantId)];
    if (context.branchId) conditions.push(eq(kdsStations.branchId, context.branchId));
    return this.database.db
      .select({
        id: kdsStations.id,
        branchId: kdsStations.branchId,
        name: kdsStations.name,
        type: kdsStations.type,
        isActive: kdsStations.isActive,
      })
      .from(kdsStations)
      .where(and(...conditions));
  }

  async listTickets(
    context: TenantContext,
    input: { stationId?: string | undefined; status?: OrderItemStatus | undefined } = {},
  ) {
    const conditions = [eq(kdsTickets.tenantId, context.tenantId)];
    if (context.branchId) conditions.push(eq(kdsTickets.branchId, context.branchId));
    if (input.stationId) conditions.push(eq(kdsTickets.stationId, input.stationId));
    if (input.status) conditions.push(eq(kdsTickets.status, input.status));
    return this.database.db
      .select({
        id: kdsTickets.id,
        tenantId: kdsTickets.tenantId,
        branchId: kdsTickets.branchId,
        stationId: kdsTickets.stationId,
        stationName: kdsStations.name,
        orderId: kdsTickets.orderId,
        tableCode: diningTables.code,
        orderChannel: orders.channel,
        orderStatus: orders.status,
        status: kdsTickets.status,
        priority: kdsTickets.priority,
        payload: kdsTickets.payload,
        createdAt: kdsTickets.createdAt,
      })
      .from(kdsTickets)
      .innerJoin(kdsStations, eq(kdsStations.id, kdsTickets.stationId))
      .innerJoin(orders, eq(orders.id, kdsTickets.orderId))
      .leftJoin(diningTables, eq(diningTables.id, orders.tableId))
      .where(and(...conditions));
  }

  async recallLastDelivered(context: TenantContext, stationId: string) {
    const conditions = [
      eq(kdsTickets.tenantId, context.tenantId),
      eq(kdsTickets.stationId, stationId),
      eq(kdsTickets.status, "served"),
    ];
    if (context.branchId) conditions.push(eq(kdsTickets.branchId, context.branchId));

    return this.database.db.transaction(async (tx) => {
      const [ticket] = await tx
        .select({
          id: kdsTickets.id,
          tenantId: kdsTickets.tenantId,
          branchId: kdsTickets.branchId,
          stationId: kdsTickets.stationId,
          stationName: kdsStations.name,
          orderId: kdsTickets.orderId,
          tableCode: diningTables.code,
          orderChannel: orders.channel,
          orderStatus: orders.status,
          status: kdsTickets.status,
          priority: kdsTickets.priority,
          payload: kdsTickets.payload,
          createdAt: kdsTickets.createdAt,
        })
        .from(kdsTickets)
        .innerJoin(kdsStations, eq(kdsStations.id, kdsTickets.stationId))
        .innerJoin(orders, eq(orders.id, kdsTickets.orderId))
        .leftJoin(diningTables, eq(diningTables.id, orders.tableId))
        .where(and(...conditions))
        .orderBy(desc(kdsTickets.updatedAt))
        .limit(1);

      if (!ticket) throw new NotFoundException("Nenhuma entrega encontrada nesta estação");

      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: ticket.branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "kds.delivery_recalled",
        entityType: "kds_ticket",
        entityId: ticket.id,
        metadata: { stationId },
      });

      return { ...ticket, audit: "kds.delivery_recalled" };
    });
  }

  async updateTicket(context: TenantContext, ticketId: string, status: OrderItemStatus) {
    const conditions = [eq(kdsTickets.tenantId, context.tenantId), eq(kdsTickets.id, ticketId)];
    if (context.branchId) conditions.push(eq(kdsTickets.branchId, context.branchId));
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${ticketId}`}, 0))`,
      );
      const [ticket] = await tx
        .select()
        .from(kdsTickets)
        .where(and(...conditions))
        .limit(1);

      if (!ticket) throw new NotFoundException("KDS ticket not found");
      if (ticket.status === status) return { ...ticket, audit: "kds.ticket_updated" };

      const isReturn = isKdsReturn(ticket.status, status);
      assertKdsTransition(ticket.status, status);
      const payload = ticket.payload ?? {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      const nextItems = isReturn
        ? items.map((item) =>
            item && typeof item === "object" && (item as { status?: unknown }).status === "ready"
              ? { ...(item as Record<string, unknown>), status: "preparing" }
              : item,
          )
        : items;
      const [updated] = await tx
        .update(kdsTickets)
        .set({
          status,
          payload: isReturn ? { ...payload, items: nextItems } : payload,
          bumpedAt: status === "ready" ? new Date() : isReturn ? null : ticket.bumpedAt,
          updatedAt: new Date(),
        })
        .where(and(...conditions))
        .returning();

      const audit = isReturn ? "kds.ticket_returned" : "kds.ticket_updated";
      if (isReturn) {
        await tx.insert(auditLogs).values({
          tenantId: context.tenantId,
          branchId: ticket.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: audit,
          entityType: "kds_ticket",
          entityId: ticket.id,
          metadata: { from: ticket.status, to: status, stationId: ticket.stationId },
        });
      }

      return { ...updated, audit };
    });
  }

  async updateTicketItem(
    context: TenantContext,
    ticketId: string,
    itemId: string,
    status: OrderItemStatus,
  ) {
    const conditions = [eq(kdsTickets.tenantId, context.tenantId), eq(kdsTickets.id, ticketId)];
    if (context.branchId) conditions.push(eq(kdsTickets.branchId, context.branchId));
    return this.database.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${ticketId}`}, 0))`,
      );
      const [ticket] = await tx
        .select()
        .from(kdsTickets)
        .where(and(...conditions))
        .limit(1);
      if (!ticket) throw new NotFoundException("KDS ticket not found");
      const payload = ticket.payload ?? {};
      const items = Array.isArray(payload.items) ? payload.items : [];
      const current = items.find(
        (item) =>
          Boolean(item) && typeof item === "object" && (item as { id?: unknown }).id === itemId,
      ) as Record<string, unknown> | undefined;
      if (!current) throw new NotFoundException("KDS item not found");
      const currentStatus =
        typeof current.status === "string" ? (current.status as OrderItemStatus) : "sent";
      if (currentStatus === status) return { ...ticket, audit: "kds.item_updated" };
      const isReturn = isKdsReturn(currentStatus, status);
      assertKdsTransition(currentStatus, status);
      const nextItems = items.map((item) =>
        item && typeof item === "object" && (item as { id?: unknown }).id === itemId
          ? { ...(item as Record<string, unknown>), status }
          : item,
      );
      const statuses = nextItems.map((item) =>
        typeof item === "object" &&
        item &&
        typeof (item as Record<string, unknown>).status === "string"
          ? (item as Record<string, unknown>).status
          : "sent",
      );
      const nextTicketStatus: OrderItemStatus = statuses.every(
        (itemStatus) => itemStatus === "served",
      )
        ? "served"
        : statuses.some((itemStatus) => itemStatus === "ready")
          ? "ready"
          : statuses.some((itemStatus) => itemStatus === "preparing")
            ? "preparing"
            : "sent";
      const [updated] = await tx
        .update(kdsTickets)
        .set({
          payload: { ...payload, items: nextItems },
          status: nextTicketStatus,
          bumpedAt:
            nextTicketStatus === "ready"
              ? (ticket.bumpedAt ?? new Date())
              : isReturn
                ? null
                : ticket.bumpedAt,
          updatedAt: new Date(),
        })
        .where(and(...conditions))
        .returning();
      const audit = isReturn ? "kds.item_returned" : "kds.item_updated";
      if (isReturn) {
        await tx.insert(auditLogs).values({
          tenantId: context.tenantId,
          branchId: ticket.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: audit,
          entityType: "kds_ticket_item",
          entityId: itemId,
          metadata: {
            ticketId,
            from: currentStatus,
            to: status,
            stationId: ticket.stationId,
          },
        });
      }
      return { ...updated, audit };
    });
  }
}

export function assertKdsTransition(from: OrderItemStatus, to: OrderItemStatus) {
  if (isKdsReturn(from, to)) return;
  stateMachines.assertOrderItemTransition(from, to);
}

function isKdsReturn(from: OrderItemStatus, to: OrderItemStatus) {
  return from === "ready" && to === "preparing";
}
