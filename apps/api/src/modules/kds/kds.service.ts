import { diningTables, kdsStations, kdsTickets, orders } from "@giromesa/db";
import { type OrderItemStatus, stateMachines, type TenantContext } from "@giromesa/domain";
import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
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

  async listTickets(context: TenantContext) {
    const conditions = [eq(kdsTickets.tenantId, context.tenantId)];
    if (context.branchId) conditions.push(eq(kdsTickets.branchId, context.branchId));
    return this.database.db
      .select({
        id: kdsTickets.id,
        tenantId: kdsTickets.tenantId,
        branchId: kdsTickets.branchId,
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

  async updateTicket(context: TenantContext, ticketId: string, status: OrderItemStatus) {
    const conditions = [eq(kdsTickets.tenantId, context.tenantId), eq(kdsTickets.id, ticketId)];
    if (context.branchId) conditions.push(eq(kdsTickets.branchId, context.branchId));
    const [ticket] = await this.database.db
      .select()
      .from(kdsTickets)
      .where(and(...conditions))
      .limit(1);

    if (!ticket) {
      throw new NotFoundException("KDS ticket not found");
    }

    stateMachines.assertOrderItemTransition(ticket.status, status);

    const [updated] = await this.database.db
      .update(kdsTickets)
      .set({
        status,
        bumpedAt: status === "ready" ? new Date() : ticket.bumpedAt,
        updatedAt: new Date(),
      })
      .where(and(...conditions))
      .returning();

    return {
      ...updated,
      audit: "kds.ticket_updated",
    };
  }
}
