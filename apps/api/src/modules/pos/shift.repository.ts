import { cashSessions, operationalShifts } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";

type TransactionClient = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];
type ShiftDbClient = DatabaseService["db"] | TransactionClient;

@Injectable()
export class ShiftRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async findCurrentShift(
    context: TenantContext,
    branchId: string,
    client: ShiftDbClient = this.database.db,
  ) {
    const [shift] = await client
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

  async findCurrentShiftForUpdate(
    context: TenantContext,
    branchId: string,
    client: TransactionClient,
  ) {
    const [shift] = await client
      .select()
      .from(operationalShifts)
      .where(
        and(
          eq(operationalShifts.tenantId, context.tenantId),
          eq(operationalShifts.branchId, branchId),
          eq(operationalShifts.status, "open"),
        ),
      )
      .for("update")
      .limit(1);
    return shift ?? null;
  }

  async findShiftByCloseKey(
    context: TenantContext,
    idempotencyKey: string,
    client: ShiftDbClient = this.database.db,
  ) {
    const [shift] = await client
      .select()
      .from(operationalShifts)
      .where(
        and(
          eq(operationalShifts.tenantId, context.tenantId),
          eq(operationalShifts.closeIdempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return shift ?? null;
  }

  async insertShift(
    context: TenantContext,
    data: Omit<typeof operationalShifts.$inferInsert, "tenantId">,
    client: ShiftDbClient = this.database.db,
  ) {
    const [shift] = await client
      .insert(operationalShifts)
      .values({ ...data, tenantId: context.tenantId })
      .returning();
    return shift ?? null;
  }

  async updateShift(
    context: TenantContext,
    shiftId: string,
    data: Partial<typeof operationalShifts.$inferInsert>,
    expectedVersion?: number,
    client: ShiftDbClient = this.database.db,
  ) {
    const [updated] = await client
      .update(operationalShifts)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(operationalShifts.tenantId, context.tenantId),
          eq(operationalShifts.id, shiftId),
          expectedVersion === undefined
            ? undefined
            : eq(operationalShifts.version, expectedVersion),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async findOpenCashSession(
    context: TenantContext,
    branchId: string,
    client: ShiftDbClient = this.database.db,
  ) {
    const [cash] = await client
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
