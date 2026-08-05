import {
  Body,
  ConflictException,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { firstHeader, type HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { BackupService } from "./backup.service";
import { PlatformService } from "./platform.service";

const createTenantSchema = z.object({
  name: z.string().min(2).max(160),
  ownerName: z.string().min(2).max(160),
  ownerEmail: z.email(),
  planCode: z.enum(["starter", "professional", "premium"]).default("professional"),
  document: z.string().max(32).optional(),
  branchName: z.string().min(2).max(140).default("Matriz"),
});

const updateTenantStatusSchema = z.object({
  status: z.enum(["trial", "active", "past_due", "suspended", "canceled"]),
});

const updateTenantSupportSchema = z.object({
  priority: z.enum(["normal", "high"]).default("normal"),
  supportStatus: z
    .enum(["queued", "in_progress", "waiting_customer", "resolved"])
    .default("queued"),
  commercialNotes: z.string().max(4000).default(""),
  relationshipOwnerName: z.string().max(160).optional(),
  relationshipOwnerEmail: z.email().optional().or(z.literal("")),
  slaTier: z.enum(["standard", "priority", "critical"]).default("standard"),
  nextFollowUpAt: z.iso.datetime().optional().nullable(),
  contactSummary: z.string().max(600).optional(),
  accessMode: z.enum(["read_only", "elevated"]).optional(),
  elevationExpiresAt: z.iso.datetime().optional().nullable(),
  elevationReason: z.string().min(10).max(600).optional(),
  accessBranchId: z.string().uuid().optional().nullable(),
  accessResource: z.enum(["operations", "integrations", "audit"]).optional(),
  accessActions: z
    .array(z.enum(["read", "mutate"]))
    .min(1)
    .optional(),
});

const supportScopeSchema = z.object({
  branchId: z.string().uuid().optional(),
  resource: z.enum(["operations", "integrations", "audit"]),
});

const supportDiagnosticSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  resource: z.enum(["operations", "integrations", "audit"]),
  summary: z.string().min(10).max(600),
});

const sendTenantCommunicationSchema = z.object({
  type: z.enum(["trial_ending", "past_due", "support_follow_up"]),
});

const listPlatformCommunicationsSchema = z.object({
  tenantId: z.string().uuid().optional(),
  type: z.enum(["trial_ending", "past_due", "support_follow_up"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

const scheduleBackupSchema = z.object({
  cron: z.string().min(1).max(100),
});

@Controller("platform")
export class PlatformController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(PlatformService) private readonly platformService: PlatformService,
    @Inject(BackupService) private readonly backupService: BackupService,
  ) {}

  @Get("tenants")
  async listTenants(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return {
      data: await this.platformService.listTenants(),
    };
  }

  @Get("summary")
  async summary(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.platformService.getCommercialSummary();
  }

  @Get("communications")
  async listCommunications(
    @Headers() headers: HeaderRecord,
    @Query() query: Record<string, string | undefined>,
  ) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");
    const parsed = listPlatformCommunicationsSchema.parse(query);

    return {
      data: await this.platformService.listCommunications({
        ...(parsed.tenantId ? { tenantId: parsed.tenantId } : {}),
        ...(parsed.type ? { type: parsed.type } : {}),
        ...(parsed.limit ? { limit: parsed.limit } : {}),
      }),
    };
  }

  @Post("tenants")
  async createTenant(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.platformService.createTenant(context, createTenantSchema.parse(body));
  }

  @Get("tenants/:tenantId")
  async getTenant(@Param("tenantId") tenantId: string, @Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.platformService.getTenantDetail(tenantId);
  }

  @Patch("tenants/:tenantId/status")
  async updateTenantStatus(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.platformService.updateTenantStatus(
      context,
      tenantId,
      updateTenantStatusSchema.parse(body).status,
    );
  }

  @Patch("tenants/:tenantId/support")
  async updateTenantSupport(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.platformService.updateTenantSupport(
      context,
      tenantId,
      updateTenantSupportSchema.parse(body),
    );
  }

  @Get("tenants/:tenantId/support-resource")
  async getSupportResource(
    @Param("tenantId") tenantId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");
    const input = supportScopeSchema.parse(query);
    return this.platformService.getSupportResource(
      context,
      tenantId,
      input.branchId ?? null,
      input.resource,
    );
  }

  @Post("tenants/:tenantId/support-diagnostics")
  async recordSupportDiagnostic(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");
    const input = supportDiagnosticSchema.parse(body);
    return this.platformService.recordSupportDiagnostic(context, tenantId, {
      ...input,
      branchId: input.branchId ?? null,
    });
  }

  @Post("tenants/:tenantId/support-grants/:grantId/revoke")
  async revokeSupportGrant(
    @Param("tenantId") tenantId: string,
    @Param("grantId") grantId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");
    return this.platformService.revokeSupportGrant(
      context,
      tenantId,
      z.string().uuid().parse(grantId),
    );
  }

  @Post("tenants/:tenantId/asaas/checkout")
  async prepareAsaasCheckout(
    @Param("tenantId") tenantId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.platformService.prepareAsaasCheckout(
      context,
      tenantId,
      firstHeader(headers["idempotency-key"]),
    );
  }

  @Post("tenants/:tenantId/asaas/simulate-past-due")
  async simulateAsaasPastDue(
    @Param("tenantId") tenantId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.platformService.simulateAsaasPastDue(context, tenantId);
  }

  @Post("tenants/:tenantId/communications")
  async sendTenantCommunication(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.platformService.sendTenantCommunication(
      context,
      tenantId,
      sendTenantCommunicationSchema.parse(body).type,
    );
  }

  @Post("backup")
  async createBackup(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.backupService.createBackup(context);
  }

  @Get("backup")
  async listBackups(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return { data: await this.backupService.listBackups() };
  }

  @Post("backup/:id/restore")
  async restoreBackup(@Param("id") id: string, @Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    // Restoring an in-use database is intentionally unavailable until an isolated
    // restore workflow with verification and dual control exists.
    throw new ConflictException({
      error: "backup_restore_disabled",
      message: "Restore pelo backoffice está desabilitado. Acione a operação de plataforma.",
    });
  }

  @Post("backup/:id/validate")
  async validateBackup(@Param("id") id: string, @Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.backupService.validateBackup(context, id);
  }

  @Post("backup/schedule")
  async scheduleBackup(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.backupService.scheduleBackup(context, scheduleBackupSchema.parse(body).cron);
  }

  @Post("backup/cleanup")
  async cleanupBackups(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");

    return this.backupService.cleanupOldBackups(context);
  }
}
