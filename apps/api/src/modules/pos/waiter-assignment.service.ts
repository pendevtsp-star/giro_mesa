import {
  approvalRequests,
  auditLogs,
  branchOperationalSettings,
  diningTables,
  operationalShifts,
  tableEvents,
  tableWaiterAssignments,
  users,
} from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { ApprovalsService } from "../approvals/approvals.service";
import { DatabaseService } from "../database/database.service";
import { confirmOperation, reserveOperation } from "./operation-receipts";

type Tx = Parameters<Parameters<DatabaseService["db"]["transaction"]>[0]>[0];
type AssignmentSource = "manager" | "area" | "first_service" | "transfer";

@Injectable()
export class WaiterAssignmentService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ApprovalsService) private readonly approvals: ApprovalsService,
  ) {}

  async list(context: TenantContext, branchId: string) {
    const shift = await this.currentShift(context, branchId);
    if (!shift) return { shift: null, assignments: [] };
    const assignments = await this.database.db
      .select({
        assignment: tableWaiterAssignments,
        tableCode: diningTables.code,
        tableName: diningTables.name,
        waiterName: users.name,
        waiterIsActive: users.isActive,
      })
      .from(tableWaiterAssignments)
      .innerJoin(diningTables, eq(diningTables.id, tableWaiterAssignments.tableId))
      .innerJoin(users, eq(users.id, tableWaiterAssignments.waiterUserId))
      .where(
        and(
          eq(tableWaiterAssignments.tenantId, context.tenantId),
          eq(tableWaiterAssignments.branchId, branchId),
          eq(tableWaiterAssignments.shiftId, shift.id),
          isNull(tableWaiterAssignments.endedAt),
        ),
      );
    return {
      shift,
      assignments: assignments.map((row) => ({
        ...row,
        needsRedistribution: !row.waiterIsActive,
      })),
    };
  }

  async assign(
    context: TenantContext,
    input: {
      branchId: string;
      tableId: string;
      waiterUserId: string;
      reason?: string | undefined;
      source?: AssignmentSource | undefined;
      expectedVersion?: number | undefined;
    },
  ) {
    this.requireManager(context);
    return this.database.db.transaction((tx) =>
      this.replaceAssignment(context, tx, {
        ...input,
        source: (input.source ?? "manager") as AssignmentSource,
      }),
    );
  }

  async assignBatch(
    context: TenantContext,
    input: {
      branchId: string;
      waiterUserId: string;
      areaId?: string | undefined;
      tableIds?: string[] | undefined;
      expectedVersions?: Record<string, number> | undefined;
      reason: string;
    },
  ) {
    this.requireManager(context);
    return this.database.db.transaction(async (tx) => {
      const shift = await this.requireShift(context, input.branchId, tx);
      const requestedIds = [...new Set(input.tableIds ?? [])];
      const rows = await tx
        .select({ id: diningTables.id })
        .from(diningTables)
        .where(
          and(
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, input.branchId),
            isNull(diningTables.archivedAt),
            input.areaId ? eq(diningTables.areaId, input.areaId) : undefined,
            requestedIds.length ? inArray(diningTables.id, requestedIds) : undefined,
          ),
        );
      if (requestedIds.length && rows.length !== requestedIds.length) {
        throw new NotFoundException("Uma ou mais mesas não pertencem à filial informada");
      }
      if (!rows.length) throw new BadRequestException("Nenhuma mesa encontrada para distribuição");
      const assignments = [];
      for (const table of [...rows].sort((left, right) => left.id.localeCompare(right.id))) {
        assignments.push(
          await this.replaceAssignment(context, tx, {
            branchId: input.branchId,
            tableId: table.id,
            waiterUserId: input.waiterUserId,
            reason: input.reason,
            source: input.areaId ? "area" : "manager",
            ...(input.expectedVersions && table.id in input.expectedVersions
              ? { expectedVersion: input.expectedVersions[table.id] }
              : {}),
          }),
        );
      }
      return { shiftId: shift.id, assignments, count: assignments.length };
    });
  }

  async copyPreviousShift(context: TenantContext, branchId: string) {
    this.requireManager(context);
    return this.database.db.transaction(async (tx) => {
      const shift = await this.requireShift(context, branchId, tx);
      const [previous] = await tx
        .select({ id: operationalShifts.id })
        .from(operationalShifts)
        .where(
          and(
            eq(operationalShifts.tenantId, context.tenantId),
            eq(operationalShifts.branchId, branchId),
            ne(operationalShifts.id, shift.id),
          ),
        )
        .orderBy(desc(operationalShifts.openedAt))
        .limit(1);
      if (!previous) return { shiftId: shift.id, copied: [], skipped: [], sourceShiftId: null };
      const previousRows = await tx
        .select({
          tableId: tableWaiterAssignments.tableId,
          waiterUserId: tableWaiterAssignments.waiterUserId,
          updatedAt: tableWaiterAssignments.updatedAt,
        })
        .from(tableWaiterAssignments)
        .innerJoin(users, eq(users.id, tableWaiterAssignments.waiterUserId))
        .innerJoin(diningTables, eq(diningTables.id, tableWaiterAssignments.tableId))
        .where(
          and(
            eq(tableWaiterAssignments.tenantId, context.tenantId),
            eq(tableWaiterAssignments.branchId, branchId),
            eq(tableWaiterAssignments.shiftId, previous.id),
            eq(users.isActive, true),
            isNull(diningTables.archivedAt),
          ),
        )
        .orderBy(desc(tableWaiterAssignments.updatedAt));
      const latestByTable = new Map<string, (typeof previousRows)[number]>();
      for (const row of previousRows) {
        if (!latestByTable.has(row.tableId)) latestByTable.set(row.tableId, row);
      }
      const copied = [];
      const skipped: string[] = [];
      for (const row of [...latestByTable.values()].sort((left, right) =>
        left.tableId.localeCompare(right.tableId),
      )) {
        const current = await this.activeAssignment(context, branchId, row.tableId, tx, shift.id);
        if (current) {
          skipped.push(row.tableId);
          continue;
        }
        copied.push(
          await this.replaceAssignment(context, tx, {
            branchId,
            tableId: row.tableId,
            waiterUserId: row.waiterUserId,
            reason: `Cópia do turno ${previous.id}`,
            source: "manager",
            expectedVersion: 0,
          }),
        );
      }
      return { shiftId: shift.id, copied, skipped, sourceShiftId: previous.id };
    });
  }

  async redistributeInactive(
    context: TenantContext,
    input: {
      branchId: string;
      waiterUserId: string;
      tableIds?: string[] | undefined;
      expectedVersions?: Record<string, number> | undefined;
      reason: string;
    },
  ) {
    this.requireManager(context);
    return this.database.db.transaction(async (tx) => {
      const shift = await this.requireShift(context, input.branchId, tx);
      const tableIds = [...new Set(input.tableIds ?? [])];
      const rows = await tx
        .select({ tableId: tableWaiterAssignments.tableId })
        .from(tableWaiterAssignments)
        .innerJoin(users, eq(users.id, tableWaiterAssignments.waiterUserId))
        .where(
          and(
            eq(tableWaiterAssignments.tenantId, context.tenantId),
            eq(tableWaiterAssignments.branchId, input.branchId),
            eq(tableWaiterAssignments.shiftId, shift.id),
            isNull(tableWaiterAssignments.endedAt),
            eq(users.isActive, false),
            tableIds.length ? inArray(tableWaiterAssignments.tableId, tableIds) : undefined,
          ),
        );
      const assignments = [];
      for (const row of [...rows].sort((left, right) =>
        left.tableId.localeCompare(right.tableId),
      )) {
        assignments.push(
          await this.replaceAssignment(context, tx, {
            branchId: input.branchId,
            tableId: row.tableId,
            waiterUserId: input.waiterUserId,
            reason: input.reason,
            source: "transfer",
            ...(input.expectedVersions && row.tableId in input.expectedVersions
              ? { expectedVersion: input.expectedVersions[row.tableId] }
              : {}),
          }),
        );
      }
      return { shiftId: shift.id, assignments, count: assignments.length };
    });
  }

  async claim(context: TenantContext, branchId: string, tableId: string) {
    if (!context.userId) throw new ForbiddenException("Authenticated operator is required");
    const waiterUserId = context.userId;
    return this.database.db.transaction(async (tx) => {
      const shift = await this.requireShift(context, branchId, tx);
      await this.lock(tx, context.tenantId, shift.id, tableId);
      const existing = await this.activeAssignment(context, branchId, tableId, tx, shift.id);
      if (existing) {
        if (existing.waiterUserId === waiterUserId) return { assignment: existing, claimed: false };
        throw new ConflictException("Mesa atendida por outro garçom");
      }
      const assignment = await this.insertAssignment(context, tx, {
        branchId,
        tableId,
        waiterUserId,
        source: "first_service",
        shiftId: shift.id,
      });
      return { assignment, claimed: true };
    });
  }

  async transfer(
    context: TenantContext,
    input: {
      branchId: string;
      tableId: string;
      waiterUserId: string;
      reason: string;
      expectedVersion?: number | undefined;
    },
  ) {
    this.requireManager(context);
    return this.database.db.transaction((tx) =>
      this.replaceAssignment(context, tx, { ...input, source: "transfer" }),
    );
  }

  async requestHelp(
    context: TenantContext,
    input: {
      branchId: string;
      tableId: string;
      reason: string;
      idempotencyKey: string;
      expectedAssignmentVersion?: number | undefined;
    },
  ) {
    const userId = context.userId;
    if (!userId) throw new ForbiddenException("Operador autenticado obrigatório");
    return this.database.db.transaction(async (tx) => {
      const reservation = await reserveOperation<Record<string, unknown>>(tx, {
        tenantId: context.tenantId,
        branchId: input.branchId,
        scope: "waiter.help_request",
        idempotencyKey: input.idempotencyKey,
        payload: {
          tableId: input.tableId,
          reason: input.reason,
          expectedAssignmentVersion: input.expectedAssignmentVersion ?? null,
          requestedByUserId: userId,
        },
      });
      if (reservation.replay) return reservation.replay;
      const shift = await this.requireShift(context, input.branchId, tx);
      const assignment = await this.activeAssignment(
        context,
        input.branchId,
        input.tableId,
        tx,
        shift.id,
      );
      if (!assignment || assignment.waiterUserId === userId) {
        throw new BadRequestException("Esta mesa não precisa de ajuda de outro garçom");
      }
      if (
        input.expectedAssignmentVersion !== undefined &&
        assignment.version !== input.expectedAssignmentVersion
      ) {
        throw new ConflictException({
          error: "waiter_assignment_version_conflict",
          currentVersion: assignment.version,
        });
      }
      const [existing] = await tx
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.tenantId, context.tenantId),
            eq(approvalRequests.branchId, input.branchId),
            eq(approvalRequests.entityType, "dining_table"),
            eq(approvalRequests.entityId, input.tableId),
            eq(approvalRequests.action, "waiter_table_help"),
            eq(approvalRequests.requestedByUserId, userId),
            eq(approvalRequests.status, "pending"),
          ),
        )
        .limit(1);
      if (existing) {
        return confirmOperation(tx, {
          reservationId: reservation.reservationId,
          scope: "waiter.help_request",
          idempotencyKey: input.idempotencyKey,
          aggregateType: "approval_request",
          aggregateId: existing.id,
          version: assignment.version,
          result: { id: existing.id, status: "pending" as const, replayed: true },
        });
      }
      const [request] = await tx
        .insert(approvalRequests)
        .values({
          tenantId: context.tenantId,
          branchId: input.branchId,
          entityType: "dining_table",
          entityId: input.tableId,
          action: "waiter_table_help",
          requestedByUserId: userId,
          reason: input.reason,
          metadata: { shiftId: shift.id, assignedWaiterUserId: assignment.waiterUserId },
        })
        .returning({ id: approvalRequests.id, status: approvalRequests.status });
      if (!request) throw new ConflictException("Não foi possível solicitar ajuda");
      await tx.insert(auditLogs).values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        userId,
        requestId: context.requestId,
        action: "waiter_assignment.help_requested",
        entityType: "approval_request",
        entityId: request.id,
        metadata: { tableId: input.tableId, assignedWaiterUserId: assignment.waiterUserId },
      });
      return confirmOperation(tx, {
        reservationId: reservation.reservationId,
        scope: "waiter.help_request",
        idempotencyKey: input.idempotencyKey,
        aggregateType: "approval_request",
        aggregateId: request.id,
        version: assignment.version,
        result: { ...request, replayed: false },
      });
    });
  }

  async listHelpRequests(context: TenantContext, branchId: string) {
    this.requireManager(context);
    return this.database.db
      .select({
        id: approvalRequests.id,
        status: approvalRequests.status,
        reason: approvalRequests.reason,
        requestedAt: approvalRequests.createdAt,
        requestedByUserId: approvalRequests.requestedByUserId,
        tableId: diningTables.id,
        tableCode: diningTables.code,
        tableName: diningTables.name,
      })
      .from(approvalRequests)
      .innerJoin(diningTables, eq(diningTables.id, approvalRequests.entityId))
      .where(
        and(
          eq(approvalRequests.tenantId, context.tenantId),
          eq(approvalRequests.branchId, branchId),
          eq(approvalRequests.entityType, "dining_table"),
          eq(approvalRequests.action, "waiter_table_help"),
          eq(approvalRequests.status, "pending"),
        ),
      )
      .orderBy(approvalRequests.createdAt);
  }

  async grantHelp(context: TenantContext, requestId: string, managerPin: string) {
    this.requireManager(context);
    if (!context.userId) throw new ForbiddenException("Operador autenticado obrigatório");
    await this.approvals.verifyManagerPin(context, managerPin);
    const now = new Date();
    const [request] = await this.database.db
      .update(approvalRequests)
      .set({
        status: "approved",
        decidedByUserId: context.userId,
        decidedAt: now,
        decisionReason: "Ajuda pontual autorizada",
        updatedAt: now,
      })
      .where(
        and(
          eq(approvalRequests.tenantId, context.tenantId),
          eq(approvalRequests.id, requestId),
          eq(approvalRequests.action, "waiter_table_help"),
          eq(approvalRequests.status, "pending"),
        ),
      )
      .returning();
    if (!request) throw new ConflictException("Solicitação de ajuda não encontrada ou já decidida");
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: request.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: "waiter_assignment.help_granted",
      entityType: "approval_request",
      entityId: request.id,
      metadata: { tableId: request.entityId, requestedByUserId: request.requestedByUserId },
    });
    return { id: request.id, status: request.status };
  }

  async assertOrderAccess(
    context: TenantContext,
    order: { branchId: string; tableId: string | null },
    tx?: Tx,
  ): Promise<void> {
    if (!tx) {
      await this.database.db.transaction((transaction) =>
        this.assertOrderAccess(context, order, transaction),
      );
      return;
    }
    if (!order.tableId || !context.userId || this.canManage(context)) return;
    const policy = await this.policy(context, order.branchId, tx);
    if (policy !== "strict") return;
    const shift = await this.currentShift(context, order.branchId, tx);
    if (!shift) throw new ForbiddenException("Seu turno não está aberto");
    await this.lock(tx, context.tenantId, shift.id, order.tableId);
    const existing = await this.activeAssignment(
      context,
      order.branchId,
      order.tableId,
      tx,
      shift.id,
    );
    if (!existing) {
      await this.claimInTransaction(context, order.branchId, order.tableId, tx);
      return;
    }
    if (existing.waiterUserId !== context.userId) {
      if (await this.consumeHelpGrant(context, order.branchId, order.tableId, tx)) return;
      throw new ForbiddenException(
        "Mesa atendida por outro garçom. Peça ajuda ou solicite transferência.",
      );
    }
  }

  private async replaceAssignment(
    context: TenantContext,
    tx: Tx,
    input: {
      branchId: string;
      tableId: string;
      waiterUserId: string;
      reason?: string | undefined;
      source: AssignmentSource;
      expectedVersion?: number | undefined;
    },
  ) {
    const shift = await this.requireShift(context, input.branchId, tx);
    await this.lock(tx, context.tenantId, shift.id, input.tableId);
    const current = await this.activeAssignment(
      context,
      input.branchId,
      input.tableId,
      tx,
      shift.id,
    );
    const currentVersion = current?.version ?? 0;
    if (input.expectedVersion !== undefined && input.expectedVersion !== currentVersion) {
      throw new ConflictException({
        error: "waiter_assignment_version_conflict",
        currentVersion,
      });
    }
    const now = new Date();
    if (current?.waiterUserId === input.waiterUserId) return current;
    if (current) {
      await tx
        .update(tableWaiterAssignments)
        .set({
          endedAt: now,
          endedByUserId: context.userId ?? null,
          reason: input.reason ?? current.reason,
          version: current.version + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(tableWaiterAssignments.tenantId, context.tenantId),
            eq(tableWaiterAssignments.id, current.id),
          ),
        );
    }
    return this.insertAssignment(context, tx, {
      ...input,
      shiftId: shift.id,
      version: currentVersion + 1,
    });
  }

  private async claimInTransaction(
    context: TenantContext,
    branchId: string,
    tableId: string,
    tx?: Tx,
  ) {
    if (!tx || !context.userId) throw new ForbiddenException("Unable to claim this table");
    const shift = await this.requireShift(context, branchId, tx);
    await this.lock(tx, context.tenantId, shift.id, tableId);
    const afterLock = await this.activeAssignment(context, branchId, tableId, tx, shift.id);
    if (afterLock && afterLock.waiterUserId !== context.userId) {
      throw new ConflictException("A mesa foi assumida por outro garçom");
    }
    if (!afterLock) {
      await this.insertAssignment(context, tx, {
        branchId,
        tableId,
        waiterUserId: context.userId,
        source: "first_service",
        shiftId: shift.id,
      });
    }
  }

  private async insertAssignment(
    context: TenantContext,
    tx: Tx,
    input: {
      branchId: string;
      tableId: string;
      waiterUserId: string;
      source: AssignmentSource;
      reason?: string | undefined;
      shiftId?: string | undefined;
      version?: number | undefined;
    },
  ) {
    const shiftId = input.shiftId ?? (await this.requireShift(context, input.branchId, tx)).id;
    const [[table], [waiter]] = await Promise.all([
      tx
        .select({ id: diningTables.id })
        .from(diningTables)
        .where(
          and(
            eq(diningTables.id, input.tableId),
            eq(diningTables.tenantId, context.tenantId),
            eq(diningTables.branchId, input.branchId),
          ),
        )
        .limit(1),
      tx
        .select({ id: users.id, isActive: users.isActive })
        .from(users)
        .where(and(eq(users.id, input.waiterUserId), eq(users.tenantId, context.tenantId)))
        .limit(1),
    ]);
    if (!table) throw new NotFoundException("Mesa não encontrada nesta filial");
    if (!waiter?.isActive)
      throw new BadRequestException("Operador inválido ou inativo para esta unidade");
    const [assignment] = await tx
      .insert(tableWaiterAssignments)
      .values({
        tenantId: context.tenantId,
        branchId: input.branchId,
        shiftId,
        tableId: input.tableId,
        waiterUserId: input.waiterUserId,
        assignedByUserId: context.userId ?? null,
        source: input.source,
        reason: input.reason ?? null,
        version: input.version ?? 1,
      })
      .returning();
    if (!assignment) throw new ConflictException("Não foi possível atribuir a mesa");
    await tx.insert(tableEvents).values({
      tenantId: context.tenantId,
      branchId: input.branchId,
      tableId: input.tableId,
      type: `waiter_assignment.${input.source}`,
      createdByUserId: context.userId ?? input.waiterUserId,
      metadata: {
        assignmentId: assignment.id,
        waiterUserId: input.waiterUserId,
        assignmentVersion: assignment.version,
        reason: input.reason ?? null,
      },
    });
    await tx.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId,
      userId: context.userId ?? null,
      requestId: context.requestId,
      action: "waiter_assignment.created",
      entityType: "table_waiter_assignment",
      entityId: assignment.id,
      metadata: {
        tableId: input.tableId,
        waiterUserId: input.waiterUserId,
        assignmentVersion: assignment.version,
        source: input.source,
        reason: input.reason ?? null,
      },
    });
    return assignment;
  }

  private async activeAssignment(
    context: TenantContext,
    branchId: string,
    tableId: string,
    tx?: Tx,
    shiftId?: string,
  ) {
    const client = tx ?? this.database.db;
    const effectiveShiftId = shiftId ?? (await this.currentShift(context, branchId, tx))?.id;
    if (!effectiveShiftId) return null;
    const [assignment] = await client
      .select()
      .from(tableWaiterAssignments)
      .where(
        and(
          eq(tableWaiterAssignments.tenantId, context.tenantId),
          eq(tableWaiterAssignments.branchId, branchId),
          eq(tableWaiterAssignments.shiftId, effectiveShiftId),
          eq(tableWaiterAssignments.tableId, tableId),
          isNull(tableWaiterAssignments.endedAt),
        ),
      )
      .limit(1);
    return assignment ?? null;
  }

  private async policy(context: TenantContext, branchId: string, tx?: Tx) {
    const client = tx ?? this.database.db;
    const [settings] = await client
      .select({ policy: branchOperationalSettings.waiterResponsibilityPolicy })
      .from(branchOperationalSettings)
      .where(
        and(
          eq(branchOperationalSettings.tenantId, context.tenantId),
          eq(branchOperationalSettings.branchId, branchId),
        ),
      )
      .limit(1);
    return settings?.policy ?? "collaborative";
  }

  private async consumeHelpGrant(
    context: TenantContext,
    branchId: string,
    tableId: string,
    tx?: Tx,
  ) {
    if (!tx || !context.userId) return false;
    const [consumed] = await tx
      .update(approvalRequests)
      .set({ appliedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(approvalRequests.tenantId, context.tenantId),
          eq(approvalRequests.branchId, branchId),
          eq(approvalRequests.entityType, "dining_table"),
          eq(approvalRequests.entityId, tableId),
          eq(approvalRequests.action, "waiter_table_help"),
          eq(approvalRequests.requestedByUserId, context.userId),
          eq(approvalRequests.status, "approved"),
          isNull(approvalRequests.appliedAt),
        ),
      )
      .returning({ id: approvalRequests.id });
    return Boolean(consumed);
  }

  private async currentShift(context: TenantContext, branchId: string, tx?: Tx) {
    const client = tx ?? this.database.db;
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

  private async requireShift(context: TenantContext, branchId: string, tx: Tx) {
    const shift = await this.currentShift(context, branchId, tx);
    if (!shift) throw new BadRequestException("Abra o turno antes de organizar o atendimento");
    return shift;
  }

  private async lock(tx: Tx, tenantId: string, shiftId: string, tableId: string) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${tenantId}:${shiftId}:${tableId}`}))`,
    );
  }

  private requireManager(context: TenantContext) {
    if (!this.canManage(context)) {
      throw new ForbiddenException("Somente gerente ou proprietário pode organizar a equipe");
    }
  }

  private canManage(context: TenantContext) {
    return (
      context.permissions.includes("tenant:manage") ||
      context.permissions.includes("approvals:manage")
    );
  }
}
