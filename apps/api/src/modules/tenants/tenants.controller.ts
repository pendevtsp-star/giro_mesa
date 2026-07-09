import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Patch,
  Post,
} from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { TenantsService } from "./tenants.service";

const createTenantSchema = z.object({
  name: z.string().min(2),
  ownerName: z.string().min(2),
  ownerEmail: z.email(),
  ownerPassword: z.string().min(8),
  document: z.string().optional(),
  planCode: z.string().optional(),
});

const brandingSchema = z
  .object({
    displayName: z.string().min(2).max(80).optional(),
    logoUrl: z
      .union([z.url().max(500), z.literal(""), z.null()])
      .optional()
      .transform((value) => (value === "" ? null : value)),
    themeMode: z.enum(["light", "dark", "system"]).optional(),
    accentPreset: z.enum(["emerald", "blue", "amber", "rose", "violet"]).optional(),
  })
  .refine((input) => Object.values(input).some((value) => value !== undefined), {
    message: "At least one branding field must be provided",
  });

const logoUploadSchema = z.object({
  fileName: z.string().min(1).max(180),
  dataUrl: z.string().min(40).max(700_000),
});

@Controller("tenants")
export class TenantsController {
  constructor(
    @Inject(TenantsService) private readonly tenantsService: TenantsService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Post()
  async createTenant(@Body() body: unknown) {
    if (process.env.PUBLIC_TENANT_SIGNUP_ENABLED !== "true") {
      throw new ForbiddenException(
        "Public tenant signup is disabled. Use /api/v1/platform/tenants.",
      );
    }
    rejectTenantOverride(body);
    const input = createTenantSchema.parse(body);
    return this.tenantsService.createTenant(input);
  }

  @Get("branding")
  async getBranding(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    return this.tenantsService.getBranding(context);
  }

  @Patch("branding")
  async updateBranding(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");
    return this.tenantsService.updateBranding(context, brandingSchema.parse(body));
  }

  @Post("branding/logo")
  async uploadLogo(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");
    return this.tenantsService.uploadLogo(context, logoUploadSchema.parse(body));
  }

  @Delete("branding/logo")
  async removeLogo(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");
    return this.tenantsService.removeLogo(context);
  }
}
