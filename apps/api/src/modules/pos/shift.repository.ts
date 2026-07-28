import { cashSessions, operationalShifts } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

@Injectable()
export class ShiftRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async findCurrentShift(context: TenantContext, branchId: string) {
    const [shift] = await this.database.db
      .select()
      .from(operationalShifts)
      .where(
        and(
          eq(operationalShifts.tenantId, context.tenantId),
          eq(operationalShifts.branchId, branchId),
          eq(operationalShifts.status, "open"),
        ),
      )
      .limit(1);
    return shift ?? null;
  }

  async insertShift(
    context: TenantContext,
    data: Omit<typeof operationalShifts.$inferInsert, "tenantId">,
  ) {
    const [shift] = await this.database.db
      .insert(operationalShifts)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return shift ?? null;
  }

  async updateShift(
    context: TenantContext,
    shiftId: string,
    data: Partial<typeof operationalShifts.$inferInsert>,
  ) {
    const [updated] = await this.database.db
      .update(operationalShifts)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(operationalShifts.tenantId, context.tenantId), eq(operationalShifts.id, shiftId)),
      )
      .returning();
    return updated ?? null;
  }

  async findOpenCashSession(context: TenantContext, branchId: string) {
    const [cash] = await this.database.db
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
    return cash ?? null;
  }
}
