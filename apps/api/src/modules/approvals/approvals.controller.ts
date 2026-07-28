import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { ApprovalsService } from "./approvals.service";

const policySchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  roleId: z.string().uuid().nullable().optional(),
  maxDiscountWithoutApprovalBps: z.number().int().min(0).max(10_000),
  requireCancellationReason: z.boolean(),
  requireApprovalAfterKitchen: z.boolean(),
  returnStockOnApprovedCancellation: z.boolean(),
  managerPin: z.string().min(4).max(12).regex(/^\d+$/).optional(),
});

const decisionSchema = z.object({
  managerPin: z.string().min(4).max(12).regex(/^\d+$/),
  reason: z.string().min(3).max(240).optional(),
});

const approvalStatusSchema = z.enum(["pending", "approved", "rejected", "expired"]);

@Controller()
export class ApprovalsController {
  constructor(
    @Inject(ApprovalsService) private readonly approvalsService: ApprovalsService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get("operation/policies")
  async policy(@Headers() headers: HeaderRecord) {
    const context = await this.context(headers, "approvals:manage");
    return this.approvalsService.getPublicEffectivePolicy(context);
  }

  @Patch("operation/policies")
  async updatePolicy(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "approvals:manage");
    return this.approvalsService.updatePolicy(context, policySchema.parse(body));
  }

  @Get("approvals")
  async list(@Headers() headers: HeaderRecord, @Query("status") status?: string) {
    const context = await this.context(headers, "approvals:manage");
    return {
      data: await this.approvalsService.list(
        context,
        status ? approvalStatusSchema.parse(status) : undefined,
      ),
    };
  }

  @Post("approvals/:approvalId/approve")
  async approve(
    @Headers() headers: HeaderRecord,
    @Param("approvalId") approvalId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "approvals:manage");
    return this.approvalsService.approve(
      context,
      z.string().uuid().parse(approvalId),
      decisionSchema.parse(body),
    );
  }

  @Post("approvals/:approvalId/reject")
  async reject(
    @Headers() headers: HeaderRecord,
    @Param("approvalId") approvalId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "approvals:manage");
    return this.approvalsService.reject(
      context,
      z.string().uuid().parse(approvalId),
      decisionSchema.parse(body),
    );
  }

  private async context(headers: HeaderRecord, permission: string) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }
}
