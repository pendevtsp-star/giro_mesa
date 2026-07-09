import { auditLogs, users } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

export type ListAuditEventsInput = {
  action?: string | undefined;
  userId?: string | undefined;
  entityType?: string | undefined;
  dateFrom?: Date | undefined;
  dateTo?: Date | undefined;
  limit?: number | undefined;
};

@Injectable()
export class AuditService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listEvents(context: TenantContext, input: ListAuditEventsInput = {}) {
    const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);
    const filters = [eq(auditLogs.tenantId, context.tenantId)];

    if (input.action) {
      filters.push(eq(auditLogs.action, input.action));
    }
    if (input.userId) {
      filters.push(eq(auditLogs.userId, input.userId));
    }
    if (input.entityType) {
      filters.push(eq(auditLogs.entityType, input.entityType));
    }
    if (input.dateFrom) {
      filters.push(gte(auditLogs.createdAt, input.dateFrom));
    }
    if (input.dateTo) {
      filters.push(lte(auditLogs.createdAt, input.dateTo));
    }

    return this.database.db
      .select({
        id: auditLogs.id,
        branchId: auditLogs.branchId,
        userId: auditLogs.userId,
        userName: users.name,
        userEmail: users.email,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        metadata: auditLogs.metadata,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(users, and(eq(users.tenantId, context.tenantId), eq(users.id, auditLogs.userId)))
      .where(and(...filters))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);
  }
}
