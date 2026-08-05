import { approvalRequests, auditLogs, operationPolicies, userRoles } from "@giromesa/db";
import type { ApprovalStatus, TenantContext } from "@giromesa/domain";
import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import type {
  ApprovalRecord,
  ApprovalsRepository,
  ApprovalTransaction,
  OperationPolicyRecord,
} from "./approvals.service";

@Injectable()
export class DatabaseApprovalsRepository implements ApprovalsRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listUserRoleIds(context: TenantContext) {
    if (!context.userId) return [];
    const rows = await this.database.db
      .select({ roleId: userRoles.roleId })
      .from(userRoles)
      .where(and(eq(userRoles.tenantId, context.tenantId), eq(userRoles.userId, context.userId)));
    return rows.map((row) => row.roleId);
  }

  async listPolicies(context: TenantContext) {
    const rows = await this.database.db
      .select()
      .from(operationPolicies)
      .where(eq(operationPolicies.tenantId, context.tenantId));
    return rows.map(toPolicyRecord);
  }

  async savePolicy(context: TenantContext, policy: OperationPolicyRecord) {
    const [existing] = await this.database.db
      .select({ id: operationPolicies.id })
      .from(operationPolicies)
      .where(
        and(eq(operationPolicies.tenantId, context.tenantId), eq(operationPolicies.id, policy.id)),
      )
      .limit(1);
    const values = {
      tenantId: context.tenantId,
      branchId: policy.branchId,
      roleId: policy.roleId,
      maxDiscountWithoutApprovalBps: policy.maxDiscountWithoutApprovalBps,
      requireCancellationReason: policy.requireCancellationReason,
      requireApprovalAfterKitchen: policy.requireApprovalAfterKitchen,
      returnStockOnApprovedCancellation: policy.returnStockOnApprovedCancellation,
      managerPinHash: policy.managerPinHash,
      updatedAt: new Date(),
    };
    const [saved] = existing
      ? await this.database.db
          .update(operationPolicies)
          .set(values)
          .where(
            and(
              eq(operationPolicies.tenantId, context.tenantId),
              eq(operationPolicies.id, policy.id),
            ),
          )
          .returning()
      : await this.database.db
          .insert(operationPolicies)
          .values({ id: policy.id, ...values })
          .returning();
    if (!saved) throw new Error("Unable to save operation policy");
    return toPolicyRecord(saved);
  }

  async listApprovals(context: TenantContext, status?: ApprovalStatus) {
    const condition = status
      ? and(eq(approvalRequests.tenantId, context.tenantId), eq(approvalRequests.status, status))
      : eq(approvalRequests.tenantId, context.tenantId);
    const rows = await this.database.db
      .select()
      .from(approvalRequests)
      .where(condition)
      .orderBy(desc(approvalRequests.createdAt));
    return rows.map(toApprovalRecord);
  }

  async findApproval(context: TenantContext, approvalId: string) {
    const [row] = await this.database.db
      .select()
      .from(approvalRequests)
      .where(
        and(eq(approvalRequests.tenantId, context.tenantId), eq(approvalRequests.id, approvalId)),
      )
      .limit(1);
    return row ? toApprovalRecord(row) : null;
  }

  async createApproval(context: TenantContext, approval: ApprovalRecord, tx?: ApprovalTransaction) {
    const executor = tx ?? this.database.db;
    const [created] = await executor
      .insert(approvalRequests)
      .values({
        id: approval.id,
        tenantId: context.tenantId,
        branchId: approval.branchId,
        entityType: approval.entityType,
        entityId: approval.entityId,
        action: approval.action,
        requestedByUserId: approval.requestedByUserId,
        requestedValueCents: approval.requestedValueCents,
        approvedValueCents: approval.approvedValueCents,
        reason: approval.reason,
        status: approval.status,
        metadata: approval.metadata,
      })
      .returning();
    if (!created) throw new Error("Unable to create approval request");
    return toApprovalRecord(created);
  }

  async decideApproval(
    context: TenantContext,
    approvalId: string,
    status: "approved" | "rejected",
    decisionReason?: string,
  ) {
    const [decided] = await this.database.db
      .update(approvalRequests)
      .set({
        status,
        decidedByUserId: context.userId,
        decisionReason: decisionReason ?? null,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(approvalRequests.tenantId, context.tenantId),
          eq(approvalRequests.id, approvalId),
          eq(approvalRequests.status, "pending"),
        ),
      )
      .returning();
    return decided ? toApprovalRecord(decided) : this.findApproval(context, approvalId);
  }

  async markApplied(context: TenantContext, approvalId: string) {
    const [applied] = await this.database.db
      .update(approvalRequests)
      .set({ appliedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(approvalRequests.tenantId, context.tenantId),
          eq(approvalRequests.id, approvalId),
          isNull(approvalRequests.appliedAt),
        ),
      )
      .returning();
    return applied ? toApprovalRecord(applied) : this.findApproval(context, approvalId);
  }

  async audit(
    context: TenantContext,
    action: string,
    entity: { id: string; branchId: string | null },
    metadata: Record<string, unknown> = {},
    tx?: ApprovalTransaction,
  ) {
    await (tx ?? this.database.db).insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: entity.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action,
      entityType: action.startsWith("operation_policy") ? "operation_policy" : "approval_request",
      entityId: entity.id,
      metadata,
    });
  }
}

function toPolicyRecord(row: typeof operationPolicies.$inferSelect): OperationPolicyRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    roleId: row.roleId,
    maxDiscountWithoutApprovalBps: row.maxDiscountWithoutApprovalBps,
    requireCancellationReason: row.requireCancellationReason,
    requireApprovalAfterKitchen: row.requireApprovalAfterKitchen,
    returnStockOnApprovedCancellation: row.returnStockOnApprovedCancellation,
    managerPinHash: row.managerPinHash,
  };
}

function toApprovalRecord(row: typeof approvalRequests.$inferSelect): ApprovalRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    branchId: row.branchId,
    entityType: row.entityType,
    entityId: row.entityId,
    action: row.action,
    requestedByUserId: row.requestedByUserId,
    decidedByUserId: row.decidedByUserId,
    requestedValueCents: row.requestedValueCents,
    approvedValueCents: row.approvedValueCents,
    reason: row.reason,
    decisionReason: row.decisionReason,
    status: row.status,
    metadata: row.metadata,
    decidedAt: row.decidedAt,
    appliedAt: row.appliedAt,
    createdAt: row.createdAt,
  };
}
