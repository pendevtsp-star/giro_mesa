import { auditLogs, branches, diningTables, floorPlans, orders, users } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class PosRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listTables(context: TenantContext, branchId: string) {
    return this.database.db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.branchId, branchId)));
  }

  async createTable(
    context: TenantContext,
    input: { branchId: string; code: string; name: string; seats: number },
  ) {
    const [table] = await this.database.db
      .insert(diningTables)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        seats: input.seats,
      })
      .returning();
    if (!table) throw new Error("Failed to create table");
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "dining_table.created",
      entityType: "dining_table",
      entityId: table.id,
      metadata: { code: table.code, seats: table.seats },
    });
    return table;
  }

  async listTableHistory(context: TenantContext, tableId: string, limit = 24) {
    const [table] = await this.database.db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, tableId)))
      .limit(1);

    if (!table) {
      throw new NotFoundException("Table not found");
    }

    const tableOrders = await this.database.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.tableId, tableId)))
      .orderBy(desc(orders.createdAt))
      .limit(40);

    const orderIds = tableOrders.map((order) => order.id);
    const entityFilters = [
      and(eq(auditLogs.entityType, "dining_table"), eq(auditLogs.entityId, tableId)),
      ...(orderIds.length > 0
        ? [and(eq(auditLogs.entityType, "order"), inArray(auditLogs.entityId, orderIds))]
        : []),
    ];

    return this.database.db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
        userId: auditLogs.userId,
        userName: users.name,
        userEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, and(eq(users.tenantId, context.tenantId), eq(users.id, auditLogs.userId)))
      .where(and(eq(auditLogs.tenantId, context.tenantId), or(...entityFilters)))
      .orderBy(desc(auditLogs.createdAt))
      .limit(Math.min(Math.max(limit, 1), 50));
  }

  async getFloorPlan(context: TenantContext, branchId: string) {
    const [plan] = await this.database.db
      .select()
      .from(floorPlans)
      .where(and(eq(floorPlans.tenantId, context.tenantId), eq(floorPlans.branchId, branchId)))
      .limit(1);
    return {
      id: plan?.id ?? null,
      branchId,
      name: plan?.name ?? "Salão principal",
      layout: plan?.layout ?? {},
      version: plan?.version ?? 0,
    };
  }

  async saveFloorPlan(
    context: TenantContext,
    input: {
      branchId: string;
      expectedVersion: number;
      layout: Record<string, { x: number; y: number }>;
    },
  ) {
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, input.branchId)))
      .limit(1);
    if (!branch) throw new NotFoundException("Branch not found");
    const [existing] = await this.database.db
      .select({ id: floorPlans.id, version: floorPlans.version })
      .from(floorPlans)
      .where(
        and(eq(floorPlans.tenantId, context.tenantId), eq(floorPlans.branchId, input.branchId)),
      )
      .limit(1);
    let plan: typeof floorPlans.$inferSelect | undefined;
    if (existing) {
      if (existing.version !== input.expectedVersion) {
        throw new ConflictException({
          error: "floor_plan_version_conflict",
          currentVersion: existing.version,
        });
      }
      [plan] = await this.database.db
        .update(floorPlans)
        .set({
          layout: input.layout,
          version: sql`${floorPlans.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(floorPlans.id, existing.id),
            eq(floorPlans.tenantId, context.tenantId),
            eq(floorPlans.version, input.expectedVersion),
          ),
        )
        .returning();
      if (!plan) {
        throw new ConflictException({ error: "floor_plan_version_conflict" });
      }
    } else {
      if (input.expectedVersion !== 0) {
        throw new ConflictException({ error: "floor_plan_version_conflict", currentVersion: 0 });
      }
      [plan] = await this.database.db
        .insert(floorPlans)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          name: "Salão principal",
          layout: input.layout,
          version: 1,
        })
        .returning();
    }
    if (!plan) throw new Error("Failed to save floor plan");
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "floor_plan.updated",
      entityType: "floor_plan",
      entityId: plan.id,
      metadata: { tableCount: Object.keys(input.layout).length, version: plan.version },
    });
    return plan;
  }

  async ensureBranchBelongsToTenant(context: TenantContext, branchId: string) {
    if (!branchId) {
      throw new BadRequestException("branchId is required");
    }
    const [branch] = await this.database.db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, branchId)))
      .limit(1);
    if (!branch) {
      throw new NotFoundException("Branch not found");
    }
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

  async updateTable(
    context: TenantContext,
    tableId: string,
    data: Partial<Pick<typeof diningTables.$inferInsert, "status" | "reservedName">>,
  ) {
    const [existing] = await this.database.db
      .select({ id: diningTables.id, branchId: diningTables.branchId })
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, tableId)))
      .limit(1);
    if (!existing) throw new NotFoundException("Table not found");

    const [updated] = await this.database.db
      .update(diningTables)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(diningTables.id, tableId))
      .returning();

    await this.insertAuditLog(context, {
      branchId: existing.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "dining_table.updated",
      entityType: "dining_table",
      entityId: tableId,
      metadata: data,
    });

    return updated;
  }

  async mergeTables(context: TenantContext, branchId: string, tableIds: string[]) {
    const { randomUUID } = await import("node:crypto");
    const groupId = randomUUID();

    const tables = await this.database.db
      .select()
      .from(diningTables)
      .where(
        and(
          eq(diningTables.tenantId, context.tenantId),
          eq(diningTables.branchId, branchId),
          inArray(diningTables.id, tableIds),
        ),
      );

    if (tables.length < 2) {
      throw new BadRequestException("Select at least 2 tables to merge");
    }

    await this.database.db
      .update(diningTables)
      .set({ groupId, updatedAt: new Date() })
      .where(and(eq(diningTables.tenantId, context.tenantId), inArray(diningTables.id, tableIds)));

    await this.insertAuditLog(context, {
      branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "table_group.created",
      entityType: "dining_table",
      entityId: groupId,
      metadata: { tableIds, tableCount: tableIds.length },
    });

    return this.database.db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.branchId, branchId)));
  }

  async unmergeTables(context: TenantContext, tableId: string) {
    const [table] = await this.database.db
      .select()
      .from(diningTables)
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, tableId)))
      .limit(1);

    if (!table) {
      throw new NotFoundException("Table not found");
    }

    if (!table.groupId) {
      throw new BadRequestException("Table is not part of a group");
    }

    const groupId = table.groupId;

    await this.database.db
      .update(diningTables)
      .set({ groupId: null, updatedAt: new Date() })
      .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.groupId, groupId)));

    await this.insertAuditLog(context, {
      branchId: table.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "table_group.dissolved",
      entityType: "dining_table",
      entityId: groupId,
      metadata: { groupId },
    });

    return this.database.db
      .select()
      .from(diningTables)
      .where(
        and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.branchId, table.branchId)),
      );
  }
}
