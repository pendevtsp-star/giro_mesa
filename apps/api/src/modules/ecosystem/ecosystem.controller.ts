import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Put } from "@nestjs/common";
import { z } from "zod";
import { firstHeader, type HeaderRecord } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { EcosystemService } from "./ecosystem.service";

const entitlementCode = z.enum([
  "giromesa.subscription",
  "doseclub.subscription",
  "bundle",
  "integration.shared_inventory",
]);
const replaceEntitlementsSchema = z.strictObject({
  grant: z.array(entitlementCode).max(20).default([]),
  revoke: z.array(entitlementCode).max(20).default([]),
});
const createCampaignSchema = z
  .strictObject({
    branchId: z.string().uuid().optional(),
    sourceProduct: z.enum(["giromesa", "doseclub"]),
    targetProduct: z.enum(["giromesa", "doseclub"]),
    name: z.string().trim().min(2).max(160),
    message: z.string().trim().min(2).max(500),
    targetUrl: z.url(),
    startsAt: z.iso.datetime().optional(),
    endsAt: z.iso.datetime().optional(),
  })
  .refine((input) => input.sourceProduct !== input.targetProduct, {
    message: "Cross-product campaigns require distinct products",
  })
  .refine(
    (input) => !input.startsAt || !input.endsAt || input.startsAt < input.endsAt,
    "Campaign end must be after its start",
  );
const campaignStatusSchema = z.strictObject({
  status: z.enum(["draft", "active", "paused", "ended"]),
});
const handoffSchema = z.strictObject({
  targetProduct: z.literal("doseclub"),
  returnTo: z
    .string()
    .max(300)
    .regex(/^\/(?!\/)/, "returnTo must be a relative application path")
    .optional(),
});
const exchangeSchema = z.strictObject({ token: z.string().min(32).max(8_000) });

@Controller("ecosystem")
export class EcosystemController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(EcosystemService) private readonly ecosystemService: EcosystemService,
  ) {}

  @Get("catalog")
  catalog() {
    return this.ecosystemService.getCommercialCatalog();
  }

  @Get("entitlements")
  async entitlements(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    return { data: await this.ecosystemService.getEntitlements(context.tenantId) };
  }

  @Put("tenants/:tenantId/entitlements")
  async replaceTenantEntitlements(
    @Param("tenantId") tenantId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "platform:manage");
    return this.ecosystemService.replaceTenantEntitlements(
      context,
      z.string().uuid().parse(tenantId),
      replaceEntitlementsSchema.parse(body),
    );
  }

  @Get("campaigns")
  async campaigns(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");
    return { data: await this.ecosystemService.listCampaigns(context) };
  }

  @Post("campaigns")
  async createCampaign(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");
    return this.ecosystemService.createCampaign(context, createCampaignSchema.parse(body));
  }

  @Patch("campaigns/:campaignId/status")
  async updateCampaignStatus(
    @Param("campaignId") campaignId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "tenant:manage");
    return this.ecosystemService.updateCampaignStatus(
      context,
      z.string().uuid().parse(campaignId),
      campaignStatusSchema.parse(body).status,
    );
  }
}

@Controller("auth/federation")
export class FederationController {
  constructor(
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(EcosystemService) private readonly ecosystemService: EcosystemService,
    @Inject(RateLimitService) private readonly rateLimitService: RateLimitService,
  ) {}

  @Post("handoff")
  async handoff(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    this.rateLimitService.assertAllowed(headers, {
      namespace: "federation_handoff",
      identifier: context.userId,
      limit: 10,
      windowMs: 60_000,
    });
    return this.ecosystemService.createFederationHandoff(context, handoffSchema.parse(body));
  }

  @Post("exchange")
  async exchange(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    this.rateLimitService.assertAllowed(headers, {
      namespace: "federation_exchange",
      identifier: firstHeader(headers["x-product-integration-key"]),
      limit: 120,
      windowMs: 60_000,
    });
    return this.ecosystemService.exchangeFederationHandoff(
      exchangeSchema.parse(body).token,
      firstHeader(headers["x-product-integration-key"]),
    );
  }
}
