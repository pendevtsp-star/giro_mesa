import {
  auditLogs,
  diningTables,
  floorAreas,
  orders,
  reservations,
  tableEvents,
  waitlistEntries,
} from "@giromesa/db";
import {
  type ReservationStatus,
  stateMachines,
  type TenantContext,
  type WaitlistStatus,
} from "@giromesa/domain";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { assertTableCanSeatParty } from "./floor-rules";

type AreaInput = {
  name: string;
  sortOrder?: number | undefined;
  isActive?: boolean | undefined;
  layout?: Record<string, unknown> | undefined;
};

type AreaUpdateInput = {
  name?: string | undefined;
  sortOrder?: number | undefined;
  isActive?: boolean | undefined;
  layout?: Record<string, unknown> | undefined;
};

type ReservationInput = {
  tableId?: string | null | undefined;
  customerId?: string | null | undefined;
  customerName: string;
  customerPhone?: string | undefined;
  partySize: number;
  scheduledAt: Date;
  notes?: string | undefined;
};

type WaitlistInput = {
  tableId?: string | null | undefined;
  customerId?: string | null | undefined;
  customerName: string;
  customerPhone?: string | undefined;
  partySize: number;
  quotedWaitMinutes?: number | undefined;
  notes?: string | undefined;
};

@Injectable()
export class FloorService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listAreas(context: TenantContext) {
    return this.database.db
      .select()
      .from(floorAreas)
      .where(
        and(
          eq(floorAreas.tenantId, context.tenantId),
          eq(floorAreas.branchId, requireBranchId(context)),
        ),
      )
      .orderBy(floorAreas.sortOrder);
  }

  async createArea(context: TenantContext, input: AreaInput) {
    const branchId = requireBranchId(context);
    const [area] = await this.database.db
      .insert(floorAreas)
      .values({
        tenantId: context.tenantId,
        branchId,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true,
        layout: input.layout ?? {},
      })
      .returning();
    if (!area) throw new BadRequestException("Unable to create floor area");
    await this.audit(context, branchId, "floor.area_created", "floor_area", area.id, {
      name: area.name,
    });
    return area;
  }

  async updateArea(context: TenantContext, areaId: string, input: AreaUpdateInput) {
    const branchId = requireBranchId(context);
    const [area] = await this.database.db
      .update(floorAreas)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(floorAreas.tenantId, context.tenantId),
          eq(floorAreas.branchId, branchId),
          eq(floorAreas.id, areaId),
        ),
      )
      .returning();
    if (!area) throw new NotFoundException("Floor area not found");
    await this.audit(context, branchId, "floor.area_updated", "floor_area", area.id, {});
    return area;
  }

  async listReservations(context: TenantContext, status?: ReservationStatus | undefined) {
    const branchId = requireBranchId(context);
    return this.database.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.tenantId, context.tenantId),
          eq(reservations.branchId, branchId),
          status ? eq(reservations.status, status) : undefined,
        ),
      )
      .orderBy(reservations.scheduledAt);
  }

  async createReservation(context: TenantContext, input: ReservationInput) {
    const branchId = requireBranchId(context);
    if (input.tableId) {
      const table = await this.findTable(context, input.tableId);
      assertTableCanSeatParty(table, input.partySize);
    }
    const [reservation] = await this.database.db
      .insert(reservations)
      .values({
        tenantId: context.tenantId,
        branchId,
        tableId: input.tableId ?? null,
        customerId: input.customerId ?? null,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        partySize: input.partySize,
        scheduledAt: input.scheduledAt,
        notes: input.notes ?? null,
        createdByUserId: requireUserId(context),
      })
      .returning();
    if (!reservation) throw new BadRequestException("Unable to create reservation");
    await this.audit(
      context,
      branchId,
      "floor.reservation_created",
      "reservation",
      reservation.id,
      { partySize: reservation.partySize, tableId: reservation.tableId },
    );
    return reservation;
  }

  async updateReservation(
    context: TenantContext,
    reservationId: string,
    input: {
      status?: ReservationStatus | undefined;
      tableId?: string | null | undefined;
      notes?: string | null | undefined;
    },
  ) {
    const branchId = requireBranchId(context);
    const reservation = await this.findReservation(context, reservationId);
    if (input.status && input.status !== reservation.status) {
      stateMachines.assertReservationTransition(reservation.status, input.status);
    }
    if (input.tableId) {
      const table = await this.findTable(context, input.tableId);
      assertTableCanSeatParty(table, reservation.partySize);
    }
    const [updated] = await this.database.db
      .update(reservations)
      .set({
        ...(input.status ? { status: input.status } : {}),
        ...(input.tableId !== undefined ? { tableId: input.tableId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(reservations.tenantId, context.tenantId),
          eq(reservations.branchId, branchId),
          eq(reservations.id, reservationId),
        ),
      )
      .returning();
    if (!updated) throw new NotFoundException("Reservation not found");
    await this.audit(context, branchId, "floor.reservation_updated", "reservation", updated.id, {
      status: updated.status,
      tableId: updated.tableId,
    });
    return updated;
  }

  async listWaitlist(context: TenantContext, status?: WaitlistStatus | undefined) {
    const branchId = requireBranchId(context);
    return this.database.db
      .select()
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.tenantId, context.tenantId),
          eq(waitlistEntries.branchId, branchId),
          status ? eq(waitlistEntries.status, status) : undefined,
        ),
      )
      .orderBy(waitlistEntries.createdAt);
  }

  async createWaitlistEntry(context: TenantContext, input: WaitlistInput) {
    const branchId = requireBranchId(context);
    const [entry] = await this.database.db
      .insert(waitlistEntries)
      .values({
        tenantId: context.tenantId,
        branchId,
        tableId: input.tableId ?? null,
        customerId: input.customerId ?? null,
        customerName: input.customerName,
        customerPhone: input.customerPhone ?? null,
        partySize: input.partySize,
        quotedWaitMinutes: input.quotedWaitMinutes ?? null,
        notes: input.notes ?? null,
        createdByUserId: requireUserId(context),
      })
      .returning();
    if (!entry) throw new BadRequestException("Unable to create waitlist entry");
    await this.audit(context, branchId, "floor.waitlist_created", "waitlist_entry", entry.id, {
      partySize: entry.partySize,
    });
    return entry;
  }

  async updateWaitlistEntry(
    context: TenantContext,
    entryId: string,
    input: {
      status?: WaitlistStatus | undefined;
      tableId?: string | null | undefined;
      notes?: string | null | undefined;
    },
  ) {
    const branchId = requireBranchId(context);
    const [entry] = await this.database.db
      .select()
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.tenantId, context.tenantId),
          eq(waitlistEntries.branchId, branchId),
          eq(waitlistEntries.id, entryId),
        ),
      )
      .limit(1);
    if (!entry) throw new NotFoundException("Waitlist entry not found");
    if (input.status && input.status !== entry.status) {
      stateMachines.assertWaitlistTransition(entry.status, input.status);
    }
    const [updated] = await this.database.db
      .update(waitlistEntries)
      .set({
        ...(input.status ? { status: input.status } : {}),
        ...(input.tableId !== undefined ? { tableId: input.tableId } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.status === "notified" ? { notifiedAt: new Date() } : {}),
        ...(input.status === "seated" ? { seatedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(waitlistEntries.tenantId, context.tenantId), eq(waitlistEntries.id, entryId)))
      .returning();
    if (!updated) throw new NotFoundException("Waitlist entry not found");
    await this.audit(context, branchId, "floor.waitlist_updated", "waitlist_entry", updated.id, {
      status: updated.status,
      tableId: updated.tableId,
    });
    return updated;
  }

  async seatReservation(context: TenantContext, reservationId: string, tableId: string) {
    const branchId = requireBranchId(context);
    return this.database.db.transaction(async (tx) => {
      const [reservation] = await tx
        .select()
        .from(reservations)
        .where(
          and(
            eq(reservations.tenantId, context.tenantId),
            eq(reservations.branchId, branchId),
            eq(reservations.id, reservationId),
          ),
        )
        .for("update")
        .limit(1);
      const [table] = await tx
        .select()
        .from(diningTables)
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, branchId),
            eq(diningTables.id, tableId),
          ),
        )
        .for("update")
        .limit(1);
      if (!reservation) throw new NotFoundException("Reservation not found");
      if (!table) throw new NotFoundException("Table not found");
      if (!["booked", "arrived"].includes(reservation.status)) {
        throw new BadRequestException("Reservation cannot be seated");
      }
      assertTableCanSeatParty(table, reservation.partySize);
      const [existingOrder] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, context.tenantId),
            eq(orders.tableId, table.id),
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
        )
        .limit(1);
      if (existingOrder) throw new BadRequestException("Table already has an open order");
      const [order] = await tx
        .insert(orders)
        .values({
          tenantId: context.tenantId,
          branchId,
          tableId: table.id,
          customerId: reservation.customerId,
          channel: "table",
          status: "opened",
          peopleCount: reservation.partySize,
          openedAt: new Date(),
        })
        .returning();
      if (!order) throw new BadRequestException("Unable to open table order");
      const now = new Date();
      await tx
        .update(reservations)
        .set({ tableId: table.id, status: "seated", seatedAt: now, updatedAt: now })
        .where(
          and(eq(reservations.tenantId, context.tenantId), eq(reservations.id, reservation.id)),
        );
      await tx
        .update(diningTables)
        .set({ status: "occupied", reservedName: null, updatedAt: now })
        .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, table.id)));
      await tx.insert(tableEvents).values({
        tenantId: context.tenantId,
        branchId,
        tableId: table.id,
        reservationId: reservation.id,
        orderId: order.id,
        type: "reservation.seated",
        createdByUserId: requireUserId(context),
        metadata: { partySize: reservation.partySize },
      });
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "floor.reservation_seated",
        entityType: "reservation",
        entityId: reservation.id,
        metadata: { tableId: table.id, orderId: order.id },
      });
      return { reservationId: reservation.id, tableId: table.id, order, status: "seated" };
    });
  }

  async transferTable(context: TenantContext, tableId: string, targetTableId: string) {
    const branchId = requireBranchId(context);
    if (tableId === targetTableId) throw new BadRequestException("Target table must differ");
    return this.database.db.transaction(async (tx) => {
      const tables = await tx
        .select()
        .from(diningTables)
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, branchId),
            inArray(diningTables.id, [tableId, targetTableId]),
          ),
        )
        .for("update");
      const source = tables.find((table) => table.id === tableId);
      const target = tables.find((table) => table.id === targetTableId);
      if (!source || !target) throw new NotFoundException("Table not found");
      if (source.status !== "occupied")
        throw new BadRequestException("Source table is not occupied");
      assertTableCanSeatParty(target, 1);
      const [order] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, context.tenantId),
            eq(orders.tableId, source.id),
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
        )
        .limit(1);
      if (!order) throw new NotFoundException("Open table order not found");
      await tx
        .update(orders)
        .set({ tableId: target.id, version: order.version + 1, updatedAt: new Date() })
        .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, order.id)));
      await tx
        .update(diningTables)
        .set({ status: "free", updatedAt: new Date() })
        .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, source.id)));
      await tx
        .update(diningTables)
        .set({ status: "occupied", updatedAt: new Date() })
        .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, target.id)));
      await tx.insert(tableEvents).values({
        tenantId: context.tenantId,
        branchId,
        tableId: source.id,
        targetTableId: target.id,
        orderId: order.id,
        type: "table.transferred",
        createdByUserId: requireUserId(context),
        metadata: {},
      });
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "floor.table_transferred",
        entityType: "table",
        entityId: source.id,
        metadata: { targetTableId: target.id, orderId: order.id },
      });
      return { orderId: order.id, fromTableId: source.id, toTableId: target.id };
    });
  }

  async releaseTable(context: TenantContext, tableId: string) {
    const branchId = requireBranchId(context);
    return this.database.db.transaction(async (tx) => {
      const [table] = await tx
        .select()
        .from(diningTables)
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, branchId),
            eq(diningTables.id, tableId),
          ),
        )
        .for("update")
        .limit(1);
      if (!table) throw new NotFoundException("Table not found");
      const [openOrder] = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, context.tenantId),
            eq(orders.tableId, table.id),
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
        )
        .limit(1);
      if (openOrder) throw new BadRequestException("Table has an open order");
      const [released] = await tx
        .update(diningTables)
        .set({ status: "free", reservedName: null, updatedAt: new Date() })
        .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, table.id)))
        .returning();
      await tx.insert(tableEvents).values({
        tenantId: context.tenantId,
        branchId,
        tableId: table.id,
        type: "table.released",
        createdByUserId: requireUserId(context),
        metadata: {},
      });
      return released;
    });
  }

  private async findTable(context: TenantContext, tableId: string) {
    const [table] = await this.database.db
      .select()
      .from(diningTables)
      .where(
        and(
          eq(diningTables.tenantId, context.tenantId),
          eq(diningTables.branchId, requireBranchId(context)),
          eq(diningTables.id, tableId),
        ),
      )
      .limit(1);
    if (!table) throw new NotFoundException("Table not found");
    return table;
  }

  private async findReservation(context: TenantContext, reservationId: string) {
    const [reservation] = await this.database.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.tenantId, context.tenantId),
          eq(reservations.branchId, requireBranchId(context)),
          eq(reservations.id, reservationId),
        ),
      )
      .limit(1);
    if (!reservation) throw new NotFoundException("Reservation not found");
    return reservation;
  }

  private async audit(
    context: TenantContext,
    branchId: string,
    action: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId,
      userId: context.userId,
      requestId: context.requestId,
      action,
      entityType,
      entityId,
      metadata,
    });
  }
}

function requireBranchId(context: TenantContext) {
  if (!context.branchId) throw new BadRequestException("branchId is required");
  return context.branchId;
}

function requireUserId(context: TenantContext) {
  if (!context.userId) throw new BadRequestException("Authenticated user is required");
  return context.userId;
}
