import { Body, Controller, Delete, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { CertificateService } from "./certificate.service";
import { FiscalService } from "./fiscal.service";

const fiscalSettingsSchema = z.object({
  branchId: z.string().min(1),
  provider: z.string().min(2).default("mock"),
  status: z.string().min(2).default("enabled"),
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
  ) {}

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
  async cancelDocument(@Headers() headers: HeaderRecord, @Param("documentId") documentId: string) {
    const context = await this.context(headers, "fiscal:manage");
    return this.fiscalService.cancelDocument(context, documentId);
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
