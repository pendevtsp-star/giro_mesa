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

type TransactionClient = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];

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
    await this.ensureBranchBelongsToTenant(context, input.branchId);
    return this.database.db.transaction(async (tx) => {
      const [table] = await tx
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
      await this.insertAuditLog(
        context,
        {
          branchId: input.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "dining_table.created",
          entityType: "dining_table",
          entityId: table.id,
          metadata: { code: table.code, seats: table.seats },
        },
        tx,
      );
      return table;
    });
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
    return this.database.db.transaction(async (tx) => {
      const [branch] = await tx
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.tenantId, context.tenantId), eq(branches.id, input.branchId)))
        .limit(1);
      if (!branch) throw new NotFoundException("Branch not found");
      const [existing] = await tx
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
        [plan] = await tx
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
        [plan] = await tx
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
      await this.insertAuditLog(
        context,
        {
          branchId: input.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "floor_plan.updated",
          entityType: "floor_plan",
          entityId: plan.id,
          metadata: { tableCount: Object.keys(input.layout).length, version: plan.version },
        },
        tx,
      );
      return plan;
    });
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
    client: DatabaseService["db"] | TransactionClient = this.database.db,
  ) {
    const [log] = await client
      .insert(auditLogs)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return log ?? null;
  }

  async updateTable(
    context: TenantContext,
    tableId: string,
    data: Partial<Pick<typeof diningTables.$inferInsert, "status" | "reservedName">>,
    expectedVersion?: number,
  ) {
    return this.database.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          id: diningTables.id,
          branchId: diningTables.branchId,
          version: diningTables.version,
        })
        .from(diningTables)
        .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, tableId)))
        .limit(1);
      if (!existing) throw new NotFoundException("Table not found");
      if (expectedVersion !== undefined && expectedVersion !== existing.version) {
        throw new ConflictException({
          error: "dining_table_version_conflict",
          currentVersion: existing.version,
        });
      }

      const [updated] = await tx
        .update(diningTables)
        .set({ ...data, version: sql`${diningTables.version} + 1`, updatedAt: new Date() })
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, existing.branchId),
            eq(diningTables.id, tableId),
            ...(expectedVersion !== undefined ? [eq(diningTables.version, expectedVersion)] : []),
          ),
        )
        .returning();
      if (!updated) {
        throw new ConflictException({ error: "dining_table_version_conflict" });
      }

      await this.insertAuditLog(
        context,
        {
          branchId: existing.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "dining_table.updated",
          entityType: "dining_table",
          entityId: tableId,
          metadata: { ...data, previousVersion: existing.version, version: updated.version },
        },
        tx,
      );

      return updated;
    });
  }

  async mergeTables(context: TenantContext, branchId: string, tableIds: string[]) {
    const { randomUUID } = await import("node:crypto");
    const groupId = randomUUID();
    const uniqueTableIds = [...new Set(tableIds)].sort();
    return this.database.db.transaction(async (tx) => {
      const tables = await tx
        .select()
        .from(diningTables)
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, branchId),
            inArray(diningTables.id, uniqueTableIds),
          ),
        )
        .orderBy(diningTables.id)
        .for("update");
      if (uniqueTableIds.length < 2 || tables.length !== uniqueTableIds.length) {
        throw new BadRequestException("Select at least 2 valid tables to merge");
      }
      await tx
        .update(diningTables)
        .set({
          groupId,
          version: sql`${diningTables.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, branchId),
            inArray(diningTables.id, uniqueTableIds),
          ),
        );
      await this.insertAuditLog(
        context,
        {
          branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "table_group.created",
          entityType: "dining_table",
          entityId: groupId,
          metadata: { tableIds: uniqueTableIds, tableCount: uniqueTableIds.length },
        },
        tx,
      );
      return tx
        .select()
        .from(diningTables)
        .where(
          and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.branchId, branchId)),
        );
    });
  }

  async unmergeTables(context: TenantContext, tableId: string) {
    return this.database.db.transaction(async (tx) => {
      const [table] = await tx
        .select()
        .from(diningTables)
        .where(and(eq(diningTables.tenantId, context.tenantId), eq(diningTables.id, tableId)))
        .for("update")
        .limit(1);
      if (!table) throw new NotFoundException("Table not found");
      if (!table.groupId) throw new BadRequestException("Table is not part of a group");
      const groupId = table.groupId;
      await tx
        .update(diningTables)
        .set({
          groupId: null,
          version: sql`${diningTables.version} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, table.branchId),
            eq(diningTables.groupId, groupId),
          ),
        );
      await this.insertAuditLog(
        context,
        {
          branchId: table.branchId,
          userId: context.userId,
          requestId: context.requestId,
          action: "table_group.dissolved",
          entityType: "dining_table",
          entityId: groupId,
          metadata: { groupId },
        },
        tx,
      );
      return tx
        .select()
        .from(diningTables)
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, table.branchId),
          ),
        );
    });
  }
}
