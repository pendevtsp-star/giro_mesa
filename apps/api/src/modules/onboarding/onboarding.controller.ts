import { Body, Controller, Get, Headers, Inject, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { OnboardingService } from "./onboarding.service";

const stepSchema = z.object({
  stepKey: z.enum([
    "business_profile",
    "branch_setup",
    "team_roles",
    "tables_setup",
    "catalog_setup",
    "printer_setup",
    "cash_setup",
    "qr_menu_setup",
    "test_order",
    "first_shift_ready",
  ]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  blockedReason: z.string().max(240).optional(),
});

@Controller("onboarding")
export class OnboardingController {
  constructor(
    @Inject(OnboardingService) private readonly onboardingService: OnboardingService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get("status")
  async status(@Headers() headers: HeaderRecord, @Query("branchId") branchId?: string) {
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.onboardingService.getStatus(context, branchId);
  }

  @Post("steps/start")
  async startStep(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    const input = stepSchema.parse(body);
    return this.onboardingService.updateStep(context, { ...input, status: "in_progress" });
  }

  @Post("steps/complete")
  async completeStep(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    const input = stepSchema.parse(body);
    return this.onboardingService.updateStep(context, { ...input, status: "completed" });
  }

  @Post("steps/skip")
  async skipStep(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    const input = stepSchema.parse(body);
    return this.onboardingService.updateStep(context, { ...input, status: "skipped" });
  }

  @Patch("steps/block")
  async blockStep(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    const input = stepSchema.parse(body);
    return this.onboardingService.updateStep(context, { ...input, status: "blocked" });
  }

  @Post("readiness/recalculate")
  async recalculate(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    const branchId = z.object({ branchId: z.string().optional() }).parse(body).branchId;
    return this.onboardingService.recalculateReadiness(context, branchId);
  }

  private async contextWithPermission(headers: HeaderRecord, permission: string) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }
}
