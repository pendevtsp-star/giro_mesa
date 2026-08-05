import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { CertificateService } from "./certificate.service";
import { FiscalService } from "./fiscal.service";
import { FiscalCredentialsService } from "./fiscal-credentials.service";
import { FiscalOnboardingService } from "./fiscal-onboarding.service";

const fiscalSettingsSchema = z.object({
  branchId: z.string().min(1),
  provider: z.literal("focus_nfe").default("focus_nfe"),
  status: z.enum(["disabled", "enabled"]).default("disabled"),
  environment: z.enum(["homologation", "production"]).default("homologation"),
  defaultModel: z.enum(["nfce", "nfe", "nfse"]).default("nfce"),
  legalName: z.string().optional(),
  tradeName: z.string().optional(),
  document: z.string().optional(),
  stateRegistration: z.string().optional(),
  municipalRegistration: z.string().optional(),
  taxRegime: z.string().default("simples_nacional"),
  uf: z.string().length(2).optional(),
  cityCode: z.string().optional(),
  cityName: z.string().optional(),
  series: z.string().default("1"),
  certificateSecretRef: z.string().optional(),
  cscSecretRef: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const issueSchema = z.object({
  model: z.enum(["nfce", "nfe", "nfse"]).optional(),
});

const branchSchema = z.object({ branchId: z.string().uuid() });
const companySchema = z.object({
  branchId: z.string().uuid(),
  legalName: z.string().trim().min(3).max(180),
  tradeName: z.string().trim().max(180).optional(),
  document: z.string().min(14).max(18),
  stateRegistration: z.string().trim().min(2).max(32),
  municipalRegistration: z.string().trim().max(32).optional(),
  taxRegime: z.string().min(2).max(40),
  uf: z.string().length(2),
  cityCode: z.string().min(2).max(12),
  cityName: z.string().trim().min(2).max(120),
  expectedVersion: z.number().int().positive(),
});
const accountantInvitationSchema = z.object({
  branchId: z.string().uuid(),
  email: z.string().email(),
  expiresInHours: z.number().int().min(1).max(168).default(48),
});
const taxProfileSchema = z.object({
  branchId: z.string().uuid(),
  expectedVersion: z.number().int().positive(),
  cscId: z.string().max(80).optional(),
  series: z.string().min(1).max(20),
  defaultModel: z.enum(["nfce", "nfe", "nfse"]).default("nfce"),
  defaults: z.record(z.string(), z.unknown()).default({}),
});
const dryRunSchema = z.object({
  branchId: z.string().uuid(),
  scenario: z.enum(["success", "rejected", "uncertain"]).optional(),
});
const homologationSchema = z.object({
  branchId: z.string().uuid(),
  scenarios: z.array(z.string().min(1).max(40)).max(20).optional(),
});
const credentialSchema = z.object({
  branchId: z.string().uuid(),
  environment: z.enum(["homologation", "production"]),
  token: z.string().trim().min(8).max(500),
});
const productionEnableSchema = z.object({
  reason: z.string().trim().min(8).max(240),
  mfaCode: z.string().regex(/^\d{6}$/),
  expectedVersion: z.number().int().positive(),
});
const productionDisableSchema = z.object({ reason: z.string().trim().min(8).max(240) });
const cancelSchema = z.object({
  reason: z.string().trim().min(15).max(255),
  idempotencyKey: z.string().min(8).max(180),
});
const querySchema = z.object({ idempotencyKey: z.string().min(8).max(180) });
const fiscalUsageSettingsSchema = z.object({
  branchId: z.string().uuid(),
  monthlyAllowance: z.number().int().positive().max(10_000_000).nullable(),
  alertAtPercent: z.number().int().min(1).max(100).default(80),
});
const fiscalUsagePeriodSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Period must use YYYY-MM");

const certificateUploadSchema = z.object({
  branchId: z.string().min(1),
  name: z.string().min(1).max(120),
  type: z.enum(["a1", "a3"]).default("a1"),
  password: z.string().min(1),
  data: z.string().min(1),
  filename: z.string().optional(),
});

@Controller("fiscal")
export class FiscalController {
  constructor(
    @Inject(FiscalService)
    private readonly fiscalService: FiscalService,
    @Inject(CertificateService)
    private readonly certificateService: CertificateService,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(FiscalOnboardingService)
    private readonly onboardingService: FiscalOnboardingService,
    @Inject(FiscalCredentialsService)
    private readonly credentialsService: FiscalCredentialsService,
  ) {}

  @Get("onboarding")
  async getOnboarding(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.context(headers, "fiscal:read");
    return this.onboardingService.get(context, z.string().uuid().parse(branchId));
  }

  @Post("onboarding/start")
  async startOnboarding(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:configure");
    return this.onboardingService.start(context, branchSchema.parse(body).branchId);
  }

  @Patch("onboarding/company")
  async updateCompany(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:configure");
    return this.onboardingService.updateCompany(context, companySchema.parse(body));
  }

  @Patch("onboarding/tax-profile")
  async updateTaxProfile(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:configure");
    return this.onboardingService.updateTaxProfile(context, taxProfileSchema.parse(body));
  }

  @Post("onboarding/accountant-invitations")
  async inviteAccountant(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:configure");
    return this.onboardingService.inviteAccountant(context, accountantInvitationSchema.parse(body));
  }

  @Delete("onboarding/accountant-invitations/:id")
  async revokeAccountantInvitation(@Headers() headers: HeaderRecord, @Param("id") id: string) {
    const context = await this.context(headers, "fiscal:configure");
    return this.onboardingService.revokeInvitation(context, z.string().uuid().parse(id));
  }

  @Post("onboarding/provider/dry-run")
  async providerDryRun(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:configure");
    return this.onboardingService.providerDryRun(context, dryRunSchema.parse(body));
  }

  @Post("onboarding/provider/register")
  async registerProviderSimulator(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:configure");
    return this.onboardingService.registerSimulator(context, branchSchema.parse(body).branchId);
  }

  @Post("onboarding/homologation-tests")
  async runHomologation(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:configure");
    return this.onboardingService.runHomologation(context, homologationSchema.parse(body));
  }

  @Get("credentials")
  async listCredentials(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.context(headers, "fiscal:configure");
    return { data: await this.credentialsService.list(context, z.string().uuid().parse(branchId)) };
  }

  @Post("credentials")
  async replaceCredential(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:configure");
    return this.credentialsService.replace(context, credentialSchema.parse(body));
  }

  @Delete("credentials/:id")
  async revokeCredential(@Headers() headers: HeaderRecord, @Param("id") id: string) {
    const context = await this.context(headers, "fiscal:configure");
    return this.credentialsService.revoke(context, z.string().uuid().parse(id));
  }

  @Post("branches/:branchId/production/enable")
  async enableProduction(
    @Headers() headers: HeaderRecord,
    @Param("branchId") branchId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:activate_production");
    return this.onboardingService.enableProduction(context, {
      branchId: z.string().uuid().parse(branchId),
      ...productionEnableSchema.parse(body),
    });
  }

  @Post("branches/:branchId/production/disable")
  async disableProduction(
    @Headers() headers: HeaderRecord,
    @Param("branchId") branchId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:activate_production");
    return this.onboardingService.disableProduction(
      context,
      z.string().uuid().parse(branchId),
      productionDisableSchema.parse(body).reason,
    );
  }

  @Get("documents")
  async listDocuments(
    @Headers() headers: HeaderRecord,
    @Query("status") status?: string,
    @Query("branchId") branchId?: string,
  ) {
    const context = await this.context(headers, "fiscal:read");
    return {
      data: await this.fiscalService.listDocuments(context, { status, branchId }),
    };
  }

  @Get("usage")
  async getUsage(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("period") period: string,
  ) {
    const context = await this.context(headers, "fiscal:read");
    return this.fiscalService.getUsage(
      context,
      z.string().uuid().parse(branchId),
      fiscalUsagePeriodSchema.parse(period),
    );
  }

  @Patch("usage-settings")
  async updateUsageSettings(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:configure");
    return this.fiscalService.updateUsageSettings(context, fiscalUsageSettingsSchema.parse(body));
  }

  @Get("settings")
  async getSettings(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.context(headers, "fiscal:read");
    return this.fiscalService.getSettings(context, branchId);
  }

  @Post("settings")
  async upsertSettings(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:manage");
    return this.fiscalService.upsertSettings(context, fiscalSettingsSchema.parse(body));
  }

  @Post("orders/:orderId/issue")
  async issueOrderDocument(
    @Headers() headers: HeaderRecord,
    @Param("orderId") orderId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:manage");
    return this.fiscalService.issueOrderDocument(context, orderId, issueSchema.parse(body ?? {}));
  }

  @Get("documents/:documentId/status")
  async getDocumentStatus(
    @Headers() headers: HeaderRecord,
    @Param("documentId") documentId: string,
  ) {
    const context = await this.context(headers, "fiscal:read");
    return this.fiscalService.getDocument(context, documentId);
  }

  @Post("documents/:documentId/cancel")
  async cancelDocument(
    @Headers() headers: HeaderRecord,
    @Param("documentId") documentId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:manage");
    const input = cancelSchema.parse(body);
    return this.fiscalService.cancelDocument(context, documentId, input);
  }

  @Post("documents/:documentId/query")
  async queryDocument(
    @Headers() headers: HeaderRecord,
    @Param("documentId") documentId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:manage");
    return this.fiscalService.queryDocument(
      context,
      documentId,
      querySchema.parse(body).idempotencyKey,
    );
  }

  @Post("documents/:documentId/retry")
  async retryDocument(@Headers() headers: HeaderRecord, @Param("documentId") documentId: string) {
    const context = await this.context(headers, "fiscal:manage");
    return this.fiscalService.retryDocument(context, documentId);
  }

  @Get("certificates")
  async listCertificates(@Headers() headers: HeaderRecord, @Query("branchId") branchId?: string) {
    const context = await this.context(headers, "fiscal:configure");
    return {
      data: await this.certificateService.list(context, branchId),
    };
  }

  @Get("certificates/:id")
  async getCertificate(@Headers() headers: HeaderRecord, @Param("id") id: string) {
    const context = await this.context(headers, "fiscal:configure");
    return this.certificateService.get(context, id);
  }

  @Post("certificates")
  async uploadCertificate(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "fiscal:configure");
    const input = certificateUploadSchema.parse(body);
    const data = Buffer.from(input.data, "base64");
    return this.certificateService.upload(context, {
      ...input,
      data,
      filename: input.filename,
    });
  }

  @Delete("certificates/:id")
  async deleteCertificate(@Headers() headers: HeaderRecord, @Param("id") id: string) {
    const context = await this.context(headers, "fiscal:configure");
    await this.certificateService.delete(context, id);
    return { success: true };
  }

  @Post("certificates/:id/validate")
  async validateCertificate(@Headers() headers: HeaderRecord, @Param("id") id: string) {
    const context = await this.context(headers, "fiscal:configure");
    return this.certificateService.validate(context, id);
  }

  private async context(headers: HeaderRecord, permission: string) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }
}
