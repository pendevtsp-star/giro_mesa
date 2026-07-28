import { randomUUID } from "node:crypto";
import type { ApprovalStatus, TenantContext } from "@giromesa/domain";
import { stateMachines } from "@giromesa/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { hashPassword, verifyPassword } from "../../common/password";
import { requirePermission } from "../../common/security";

export type OperationPolicyRecord = {
  id: string;
  tenantId: string;
  branchId: string | null;
  roleId: string | null;
  maxDiscountWithoutApprovalBps: number;
  requireCancellationReason: boolean;
  requireApprovalAfterKitchen: boolean;
  returnStockOnApprovedCancellation: boolean;
  managerPinHash: string | null;
};

export type ApprovalRecord = {
  id: string;
  tenantId: string;
  branchId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  requestedByUserId: string;
  decidedByUserId: string | null;
  requestedValueCents: number | null;
  approvedValueCents: number | null;
  reason: string | null;
  decisionReason: string | null;
  status: ApprovalStatus;
  metadata: Record<string, unknown>;
  decidedAt: Date | null;
  appliedAt: Date | null;
  createdAt: Date;
};

export type PolicyInput = {
  branchId?: string | null | undefined;
  roleId?: string | null | undefined;
  maxDiscountWithoutApprovalBps: number;
  requireCancellationReason: boolean;
  requireApprovalAfterKitchen: boolean;
  returnStockOnApprovedCancellation: boolean;
  managerPin?: string | undefined;
};

export type CreateApprovalInput = {
  branchId?: string | null | undefined;
  entityType: string;
  entityId: string;
  action: string;
  requestedValueCents?: number | null | undefined;
  reason?: string | null | undefined;
  metadata?: Record<string, unknown> | undefined;
};

export interface ApprovalsRepository {
  listUserRoleIds(context: TenantContext): Promise<string[]>;
  listPolicies(context: TenantContext): Promise<OperationPolicyRecord[]>;
  savePolicy(context: TenantContext, policy: OperationPolicyRecord): Promise<OperationPolicyRecord>;
  listApprovals(context: TenantContext, status?: ApprovalStatus): Promise<ApprovalRecord[]>;
  findApproval(context: TenantContext, approvalId: string): Promise<ApprovalRecord | null>;
  createApproval(context: TenantContext, approval: ApprovalRecord): Promise<ApprovalRecord>;
  decideApproval(
    context: TenantContext,
    approvalId: string,
    status: "approved" | "rejected",
    decisionReason?: string | undefined,
  ): Promise<ApprovalRecord | null>;
  markApplied(context: TenantContext, approvalId: string): Promise<ApprovalRecord | null>;
  audit(
    context: TenantContext,
    action: string,
    entity: { id: string; branchId: string | null },
    metadata?: Record<string, unknown>,
  ): Promise<void>;
}

export interface ApprovalApplicator {
  applyApproval(context: TenantContext, approval: ApprovalRecord): Promise<void>;
}

export const APPROVALS_REPOSITORY = Symbol("APPROVALS_REPOSITORY");
export const APPROVAL_APPLICATOR = Symbol("APPROVAL_APPLICATOR");

@Injectable()
export class ApprovalApplicatorRegistry implements ApprovalApplicator {
  private applicator: ApprovalApplicator | null = null;

  register(applicator: ApprovalApplicator) {
    this.applicator = applicator;
  }

  async applyApproval(context: TenantContext, approval: ApprovalRecord) {
    if (!this.applicator) {
      throw new BadRequestException("Approval applicator is unavailable");
    }
    await this.applicator.applyApproval(context, approval);
  }
}

@Injectable()
export class ApprovalsService {
  constructor(
    @Inject(APPROVALS_REPOSITORY)
    private readonly repository: ApprovalsRepository,
    @Optional()
    @Inject(APPROVAL_APPLICATOR)
    private readonly applicator: ApprovalApplicator = {
      async applyApproval() {},
    },
  ) {}

  async getEffectivePolicy(context: TenantContext) {
    const [policies, roleIds] = await Promise.all([
      this.repository.listPolicies(context),
      this.repository.listUserRoleIds(context),
    ]);
    const roleSet = new Set(roleIds);
    const branchId = context.branchId ?? null;
    const eligible = policies.filter(
      (policy) =>
        (!policy.branchId || policy.branchId === branchId) &&
        (!policy.roleId || roleSet.has(policy.roleId)),
    );
    const policy = eligible.sort(
      (left, right) =>
        policySpecificity(right, branchId, roleSet) - policySpecificity(left, branchId, roleSet),
    )[0];
    if (!policy) {
      throw new NotFoundException("Operation policy not found");
    }
    return policy;
  }

  async getPublicEffectivePolicy(context: TenantContext) {
    return withoutPinHash(await this.getEffectivePolicy(context));
  }

  async updatePolicy(context: TenantContext, input: PolicyInput) {
    requirePermission(context, "approvals:manage");
    const current = await this.repository.listPolicies(context);
    const branchId = input.branchId ?? null;
    const roleId = input.roleId ?? null;
    const existing = current.find(
      (policy) => policy.branchId === branchId && policy.roleId === roleId,
    );
    const managerPinHash = input.managerPin
      ? await hashPassword(input.managerPin)
      : (existing?.managerPinHash ?? null);
    const policy: OperationPolicyRecord = {
      id: existing?.id ?? randomUUID(),
      tenantId: context.tenantId,
      branchId,
      roleId,
      maxDiscountWithoutApprovalBps: input.maxDiscountWithoutApprovalBps,
      requireCancellationReason: input.requireCancellationReason,
      requireApprovalAfterKitchen: input.requireApprovalAfterKitchen,
      returnStockOnApprovedCancellation: input.returnStockOnApprovedCancellation,
      managerPinHash,
    };
    const saved = await this.repository.savePolicy(context, policy);
    await this.repository.audit(context, "operation_policy.updated", policy, {
      branchId,
      roleId,
      maxDiscountWithoutApprovalBps: policy.maxDiscountWithoutApprovalBps,
    });
    return withoutPinHash(saved);
  }

  async list(context: TenantContext, status?: ApprovalStatus | undefined) {
    requirePermission(context, "approvals:manage");
    return this.repository.listApprovals(context, status);
  }

  async createRequest(context: TenantContext, input: CreateApprovalInput) {
    const approval: ApprovalRecord = {
      id: randomUUID(),
      tenantId: context.tenantId,
      branchId: input.branchId ?? context.branchId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      requestedByUserId: requireContextUserId(context),
      decidedByUserId: null,
      requestedValueCents: input.requestedValueCents ?? null,
      approvedValueCents: null,
      reason: input.reason ?? null,
      decisionReason: null,
      status: "pending",
      metadata: sanitizeMetadata(input.metadata),
      decidedAt: null,
      appliedAt: null,
      createdAt: new Date(),
    };
    const created = await this.repository.createApproval(context, approval);
    await this.repository.audit(context, "approval.requested", created, {
      action: created.action,
      entityType: created.entityType,
    });
    return created;
  }

  async approve(
    context: TenantContext,
    approvalId: string,
    input: { managerPin: string; reason?: string | undefined },
  ) {
    requirePermission(context, "approvals:manage");
    const approval = await this.repository.findApproval(context, approvalId);
    if (!approval) throw new NotFoundException("Approval request not found");
    if (approval.status === "approved") return approval;
    if (approval.status !== "pending") {
      throw new BadRequestException(`Approval is already ${approval.status}`);
    }

    await this.assertManagerPin(context, input.managerPin);
    stateMachines.assertApprovalTransition(approval.status, "approved");
    const decided = await this.repository.decideApproval(
      context,
      approvalId,
      "approved",
      input.reason,
    );
    if (!decided) throw new NotFoundException("Approval request not found");
    await this.repository.audit(context, "approval.approved", decided, {
      action: decided.action,
    });
    await this.applicator.applyApproval(context, decided);
    const applied = await this.repository.markApplied(context, approvalId);
    if (!applied) throw new NotFoundException("Approval request not found");
    await this.repository.audit(context, "approval.application_completed", applied, {
      action: applied.action,
    });
    return applied;
  }

  async reject(
    context: TenantContext,
    approvalId: string,
    input: { managerPin: string; reason?: string | undefined },
  ) {
    requirePermission(context, "approvals:manage");
    const approval = await this.repository.findApproval(context, approvalId);
    if (!approval) throw new NotFoundException("Approval request not found");
    if (approval.status === "rejected") return approval;
    if (approval.status !== "pending") {
      throw new BadRequestException(`Approval is already ${approval.status}`);
    }
    await this.assertManagerPin(context, input.managerPin);
    stateMachines.assertApprovalTransition(approval.status, "rejected");
    const rejected = await this.repository.decideApproval(
      context,
      approvalId,
      "rejected",
      input.reason,
    );
    if (!rejected) throw new NotFoundException("Approval request not found");
    await this.repository.audit(context, "approval.rejected", rejected, {
      action: rejected.action,
    });
    return rejected;
  }

  private async assertManagerPin(context: TenantContext, managerPin: string) {
    const policy = await this.getEffectivePolicy(context);
    if (!policy.managerPinHash) {
      throw new ForbiddenException("Invalid manager approval");
    }
    const valid = await verifyPassword(policy.managerPinHash, managerPin);
    if (!valid) {
      throw new ForbiddenException("Invalid manager approval");
    }
  }
}

function policySpecificity(
  policy: OperationPolicyRecord,
  branchId: string | null,
  roleIds: Set<string>,
) {
  const branchMatch = Boolean(policy.branchId && policy.branchId === branchId);
  const roleMatch = Boolean(policy.roleId && roleIds.has(policy.roleId));
  if (branchMatch && roleMatch) return 4;
  if (roleMatch) return 3;
  if (branchMatch) return 2;
  return 1;
}

function sanitizeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata).filter(
      ([key]) =>
        !["pin", "managerpin", "password", "token", "cookie", "authorization"].includes(
          key.toLowerCase(),
        ),
    ),
  );
}

function withoutPinHash(policy: OperationPolicyRecord) {
  const { managerPinHash: _managerPinHash, ...publicPolicy } = policy;
  return publicPolicy;
}

function requireContextUserId(context: TenantContext) {
  if (!context.userId) {
    throw new ForbiddenException("Authenticated user required");
  }
  return context.userId;
}
