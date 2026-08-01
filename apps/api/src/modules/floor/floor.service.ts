import { randomUUID } from "node:crypto";
import {
  auditLogs,
  diningTables,
  floorAreas,
  orders,
  reservations,
  reservationTables,
  tableEvents,
  waitlistEntries,
} from "@giromesa/db";
import {
  type ReservationStatus,
  stateMachines,
  type TenantContext,
  type WaitlistStatus,
} from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq, inArray, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { assertTableCanSeatParty, assertTablesCanSeatParty } from "./floor-rules";

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
  tableIds?: string[] | undefined;
  customerId?: string | null | undefined;
  customerName: string;
  customerPhone?: string | undefined;
  partySize: number;
  scheduledAt: Date;
  durationMinutes?: number | undefined;
  toleranceMinutes?: number | undefined;
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

type TransactionClient = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

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
    const rows = await this.database.db
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
    if (rows.length === 0) return [];
    const assignments = await this.database.db
      .select()
      .from(reservationTables)
      .where(
        and(
          eq(reservationTables.tenantId, context.tenantId),
          eq(reservationTables.branchId, branchId),
          inArray(
            reservationTables.reservationId,
            rows.map((row) => row.id),
          ),
        ),
      );
    return rows.map((reservation) => ({
      ...reservation,
      tableIds: assignments
        .filter((assignment) => assignment.reservationId === reservation.id)
        .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
        .map((assignment) => assignment.tableId),
    }));
  }

  async createReservation(context: TenantContext, input: ReservationInput) {
    const branchId = requireBranchId(context);
    const tableIds = normalizeTableIds(input.tableIds, input.tableId);
    return this.database.db.transaction(async (tx) => {
      if (tableIds.length > 0) {
        const tables = await this.lockTables(tx, context, branchId, tableIds);
        assertTablesCanSeatParty(tables, input.partySize);
        await this.assertNoReservationConflict(
          tx,
          context,
          branchId,
          tableIds,
          input.scheduledAt,
          input.durationMinutes ?? 120,
        );
      }
      const [reservation] = await tx
        .insert(reservations)
        .values({
          tenantId: context.tenantId,
          branchId,
          tableId: tableIds[0] ?? null,
          customerId: input.customerId ?? null,
          customerName: input.customerName,
          customerPhone: input.customerPhone ?? null,
          partySize: input.partySize,
          scheduledAt: input.scheduledAt,
          durationMinutes: input.durationMinutes ?? 120,
          toleranceMinutes: input.toleranceMinutes ?? 15,
          notes: input.notes ?? null,
          createdByUserId: requireUserId(context),
        })
        .returning();
      if (!reservation) throw new BadRequestException("Unable to create reservation");
      if (tableIds.length > 0) {
        await tx.insert(reservationTables).values(
          tableIds.map((tableId, index) => ({
            tenantId: context.tenantId,
            branchId,
            reservationId: reservation.id,
            tableId,
            isPrimary: index === 0,
          })),
        );
      }
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "floor.reservation_created",
        entityType: "reservation",
        entityId: reservation.id,
        metadata: { partySize: reservation.partySize, tableIds },
      });
      return { ...reservation, tableIds };
    });
  }

  async updateReservation(
    context: TenantContext,
    reservationId: string,
    input: {
      status?: ReservationStatus | undefined;
      tableId?: string | null | undefined;
      tableIds?: string[] | undefined;
      notes?: string | null | undefined;
      expectedVersion?: number | undefined;
    },
  ) {
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
      if (!reservation) throw new NotFoundException("Reservation not found");
      if (input.expectedVersion !== undefined && input.expectedVersion !== reservation.version) {
        throw new ConflictException({
          error: "reservation_version_conflict",
          currentVersion: reservation.version,
        });
      }
      if (input.status && input.status !== reservation.status) {
        stateMachines.assertReservationTransition(reservation.status, input.status);
      }
      const hasTableUpdate = input.tableIds !== undefined || input.tableId !== undefined;
      const tableIds = hasTableUpdate
        ? normalizeTableIds(input.tableIds, input.tableId)
        : await this.listReservationTableIds(tx, context, branchId, reservation.id);
      if (hasTableUpdate && tableIds.length > 0) {
        const tables = await this.lockTables(tx, context, branchId, tableIds);
        assertTablesCanSeatParty(tables, reservation.partySize);
        await this.assertNoReservationConflict(
          tx,
          context,
          branchId,
          tableIds,
          reservation.scheduledAt,
          reservation.durationMinutes,
          reservation.id,
        );
        await tx
          .delete(reservationTables)
          .where(
            and(
              eq(reservationTables.tenantId, context.tenantId),
              eq(reservationTables.reservationId, reservation.id),
            ),
          );
        await tx.insert(reservationTables).values(
          tableIds.map((tableId, index) => ({
            tenantId: context.tenantId,
            branchId,
            reservationId: reservation.id,
            tableId,
            isPrimary: index === 0,
          })),
        );
      } else if (hasTableUpdate) {
        await tx
          .delete(reservationTables)
          .where(
            and(
              eq(reservationTables.tenantId, context.tenantId),
              eq(reservationTables.reservationId, reservation.id),
            ),
          );
      }
      const [updated] = await tx
        .update(reservations)
        .set({
          ...(input.status ? { status: input.status } : {}),
          ...(hasTableUpdate ? { tableId: tableIds[0] ?? null } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          version: reservation.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(reservations.tenantId, context.tenantId),
            eq(reservations.branchId, branchId),
            eq(reservations.id, reservationId),
            eq(reservations.version, reservation.version),
          ),
        )
        .returning();
      if (!updated) throw new ConflictException("Reservation was updated concurrently");
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "floor.reservation_updated",
        entityType: "reservation",
        entityId: updated.id,
        metadata: { status: updated.status, tableIds },
      });
      return { ...updated, tableIds };
    });
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

  async seatReservation(
    context: TenantContext,
    reservationId: string,
    requestedTableIds?: string[],
  ) {
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
      if (!reservation) throw new NotFoundException("Reservation not found");
      if (!["booked", "arrived"].includes(reservation.status)) {
        throw new BadRequestException("Reservation cannot be seated");
      }
      const tableIds = requestedTableIds?.length
        ? normalizeTableIds(requestedTableIds)
        : await this.listReservationTableIds(tx, context, branchId, reservation.id);
      const resolvedTableIds =
        tableIds.length > 0 ? tableIds : normalizeTableIds([], reservation.tableId);
      const tables = await this.lockTables(tx, context, branchId, resolvedTableIds);
      assertTablesCanSeatParty(tables, reservation.partySize);
      const existingOrders = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.tenantId, context.tenantId),
            inArray(orders.tableId, resolvedTableIds),
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
      if (existingOrders.length > 0) throw new ConflictException("Table already has an open order");
      const primaryTableId = resolvedTableIds[0];
      if (!primaryTableId) throw new BadRequestException("Select at least one table");
      const [order] = await tx
        .insert(orders)
        .values({
          tenantId: context.tenantId,
          branchId,
          tableId: primaryTableId,
          customerId: reservation.customerId,
          channel: "table",
          status: "opened",
          peopleCount: reservation.partySize,
          openedAt: new Date(),
        })
        .returning();
      if (!order) throw new BadRequestException("Unable to open table order");
      const now = new Date();
      const groupId = resolvedTableIds.length > 1 ? randomUUID() : null;
      await tx
        .update(reservations)
        .set({
          tableId: primaryTableId,
          status: "seated",
          seatedAt: now,
          version: reservation.version + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(reservations.tenantId, context.tenantId),
            eq(reservations.branchId, branchId),
            eq(reservations.id, reservation.id),
            eq(reservations.version, reservation.version),
          ),
        );
      await tx
        .delete(reservationTables)
        .where(
          and(
            eq(reservationTables.tenantId, context.tenantId),
            eq(reservationTables.reservationId, reservation.id),
          ),
        );
      await tx.insert(reservationTables).values(
        resolvedTableIds.map((tableId, index) => ({
          tenantId: context.tenantId,
          branchId,
          reservationId: reservation.id,
          tableId,
          isPrimary: index === 0,
        })),
      );
      await tx
        .update(diningTables)
        .set({
          status: "occupied",
          groupId,
          reservedName: null,
          version: sql`${diningTables.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, branchId),
            inArray(diningTables.id, resolvedTableIds),
          ),
        );
      await tx.insert(tableEvents).values(
        resolvedTableIds.map((tableId) => ({
          tenantId: context.tenantId,
          branchId,
          tableId,
          reservationId: reservation.id,
          orderId: order.id,
          type: "reservation.seated",
          createdByUserId: requireUserId(context),
          metadata: { partySize: reservation.partySize, tableIds: resolvedTableIds },
        })),
      );
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId,
        userId: context.userId,
        requestId: context.requestId,
        action: "floor.reservation_seated",
        entityType: "reservation",
        entityId: reservation.id,
        metadata: { tableIds: resolvedTableIds, orderId: order.id },
      });
      return {
        reservationId: reservation.id,
        tableId: primaryTableId,
        tableIds: resolvedTableIds,
        order,
        status: "seated",
      };
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
        .set({
          status: "free",
          version: sql`${diningTables.version} + 1`,
          updatedAt: new Date(),
        })
        .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, source.id)));
      await tx
        .update(diningTables)
        .set({
          status: "occupied",
          version: sql`${diningTables.version} + 1`,
          updatedAt: new Date(),
        })
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
        .set({
          status: "free",
          reservedName: null,
          version: sql`${diningTables.version} + 1`,
          updatedAt: new Date(),
        })
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

  private async lockTables(
    tx: TransactionClient,
    context: TenantContext,
    branchId: string,
    tableIds: string[],
  ) {
    const tables = await tx
      .select()
      .from(diningTables)
      .where(
        and(
          eq(diningTables.tenantId, context.tenantId),
          eq(diningTables.branchId, branchId),
          inArray(diningTables.id, tableIds),
        ),
      )
      .orderBy(diningTables.id)
      .for("update");
    if (tables.length !== tableIds.length) throw new NotFoundException("Table not found");
    return tables;
  }

  private async listReservationTableIds(
    tx: TransactionClient,
    context: TenantContext,
    branchId: string,
    reservationId: string,
  ) {
    const assignments = await tx
      .select()
      .from(reservationTables)
      .where(
        and(
          eq(reservationTables.tenantId, context.tenantId),
          eq(reservationTables.branchId, branchId),
          eq(reservationTables.reservationId, reservationId),
        ),
      );
    return assignments
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
      .map((assignment) => assignment.tableId);
  }

  private async assertNoReservationConflict(
    tx: TransactionClient,
    context: TenantContext,
    branchId: string,
    tableIds: string[],
    scheduledAt: Date,
    durationMinutes: number,
    ignoredReservationId?: string,
  ) {
    const assignments = await tx
      .select({
        tableId: reservationTables.tableId,
        reservationId: reservations.id,
        scheduledAt: reservations.scheduledAt,
        durationMinutes: reservations.durationMinutes,
      })
      .from(reservationTables)
      .innerJoin(
        reservations,
        and(
          eq(reservations.tenantId, context.tenantId),
          eq(reservations.id, reservationTables.reservationId),
        ),
      )
      .where(
        and(
          eq(reservationTables.tenantId, context.tenantId),
          eq(reservationTables.branchId, branchId),
          inArray(reservationTables.tableId, tableIds),
          inArray(reservations.status, ["booked", "arrived"]),
        ),
      );
    const requestedEnd = scheduledAt.getTime() + durationMinutes * 60_000;
    const conflict = assignments.find((assignment) => {
      if (assignment.reservationId === ignoredReservationId) return false;
      const existingStart = assignment.scheduledAt.getTime();
      const existingEnd = existingStart + assignment.durationMinutes * 60_000;
      return scheduledAt.getTime() < existingEnd && requestedEnd > existingStart;
    });
    if (conflict) {
      throw new ConflictException({
        error: "reservation_table_conflict",
        tableId: conflict.tableId,
        reservationId: conflict.reservationId,
      });
    }
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

function normalizeTableIds(tableIds?: string[], legacyTableId?: string | null) {
  return [...new Set([...(tableIds ?? []), ...(legacyTableId ? [legacyTableId] : [])])].sort();
}

function requireBranchId(context: TenantContext) {
  if (!context.branchId) throw new BadRequestException("branchId is required");
  return context.branchId;
}

function requireUserId(context: TenantContext) {
  if (!context.userId) throw new BadRequestException("Authenticated user is required");
  return context.userId;
}
