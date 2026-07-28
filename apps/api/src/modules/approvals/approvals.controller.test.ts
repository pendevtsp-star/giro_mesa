import type { TenantContext } from "@giromesa/domain";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../../common/password";
import {
  type ApprovalRecord,
  type ApprovalsRepository,
  ApprovalsService,
  type OperationPolicyRecord,
} from "./approvals.service";

const managerContext: TenantContext = {
  tenantId: "tenant-a",
  branchId: "branch-a",
  userId: "manager-a",
  requestId: "request-a",
  permissions: ["approvals:manage"],
};

class MemoryApprovalsRepository implements ApprovalsRepository {
  policies: OperationPolicyRecord[] = [];
  approvals: ApprovalRecord[] = [];
  auditActions: string[] = [];

  async listUserRoleIds() {
    return ["manager-role"];
  }

  async listPolicies(context: TenantContext) {
    return this.policies.filter((policy) => policy.tenantId === context.tenantId);
  }

  async savePolicy(_context: TenantContext, policy: OperationPolicyRecord) {
    this.policies = [policy];
    return policy;
  }

  async listApprovals(context: TenantContext) {
    return this.approvals.filter((approval) => approval.tenantId === context.tenantId);
  }

  async findApproval(context: TenantContext, approvalId: string) {
    return (
      this.approvals.find(
        (approval) => approval.tenantId === context.tenantId && approval.id === approvalId,
      ) ?? null
    );
  }

  async createApproval(_context: TenantContext, approval: ApprovalRecord) {
    this.approvals.push(approval);
    return approval;
  }

  async decideApproval(
    context: TenantContext,
    approvalId: string,
    status: "approved" | "rejected",
    decisionReason?: string,
  ) {
    const approval = await this.findApproval(context, approvalId);
    if (approval?.status !== "pending") return approval;
    approval.status = status;
    approval.decidedByUserId = context.userId ?? null;
    approval.decisionReason = decisionReason ?? null;
    approval.decidedAt = new Date();
    return approval;
  }

  async markApplied(context: TenantContext, approvalId: string) {
    const approval = await this.findApproval(context, approvalId);
    if (approval) approval.appliedAt = new Date();
    return approval;
  }

  async audit(_context: TenantContext, action: string) {
    this.auditActions.push(action);
  }
}

describe("ApprovalsService", () => {
  let managerPinHash: string;

  beforeAll(async () => {
    managerPinHash = await hashPassword("4826");
  });

  function setup() {
    const repository = new MemoryApprovalsRepository();
    repository.policies.push({
      id: "policy-a",
      tenantId: "tenant-a",
      branchId: "branch-a",
      roleId: "manager-role",
      maxDiscountWithoutApprovalBps: 500,
      requireCancellationReason: true,
      requireApprovalAfterKitchen: true,
      returnStockOnApprovedCancellation: true,
      managerPinHash,
    });
    repository.approvals.push({
      id: "approval-a",
      tenantId: "tenant-a",
      branchId: "branch-a",
      entityType: "order",
      entityId: "11111111-1111-4111-8111-111111111111",
      action: "order.discount",
      requestedByUserId: "waiter-a",
      decidedByUserId: null,
      requestedValueCents: 1500,
      approvedValueCents: null,
      reason: "Cliente recorrente",
      decisionReason: null,
      status: "pending",
      metadata: {},
      decidedAt: null,
      appliedAt: null,
      createdAt: new Date(),
    });
    return { repository, service: new ApprovalsService(repository) };
  }

  it("rejects an invalid manager PIN", async () => {
    const { service } = setup();

    await expect(
      service.approve(managerContext, "approval-a", { managerPin: "0000" }),
    ).rejects.toThrow("Invalid manager approval");
  });

  it("does not expose approvals from another tenant", async () => {
    const { service } = setup();

    await expect(
      service.approve({ ...managerContext, tenantId: "tenant-b" }, "approval-a", {
        managerPin: "4826",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("approves once and records append-only audit actions", async () => {
    const { repository, service } = setup();

    const first = await service.approve(managerContext, "approval-a", {
      managerPin: "4826",
      reason: "Dentro da política",
    });
    const second = await service.approve(managerContext, "approval-a", {
      managerPin: "4826",
    });

    expect(first.status).toBe("approved");
    expect(second.status).toBe("approved");
    expect(repository.auditActions).toEqual([
      "approval.approved",
      "approval.application_completed",
    ]);
  });

  it("requires approval management permission", async () => {
    const { service } = setup();

    await expect(
      service.approve({ ...managerContext, permissions: ["pos:operate"] }, "approval-a", {
        managerPin: "4826",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("hashes a configured manager PIN and never returns its hash", async () => {
    const { repository, service } = setup();

    const result = await service.updatePolicy(managerContext, {
      branchId: "branch-a",
      roleId: "manager-role",
      maxDiscountWithoutApprovalBps: 500,
      requireCancellationReason: true,
      requireApprovalAfterKitchen: true,
      returnStockOnApprovedCancellation: true,
      managerPin: "7391",
    });

    expect(result).not.toHaveProperty("managerPinHash");
    expect(repository.policies[0]?.managerPinHash).not.toBe("7391");
    await expect(
      service.approve(managerContext, "approval-a", { managerPin: "7391" }),
    ).resolves.toMatchObject({ status: "approved" });
  });
});
