import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Inject,
  Post,
  Query,
} from "@nestjs/common";
import { z } from "zod";
import { firstHeader, type HeaderRecord } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { ClubWhiskyService } from "./club-whisky.service";
import { IntegrationAuthService } from "./integration-auth.service";

export const clubSaleSchema = z
  .object({
    branchId: z.string().min(1).max(180),
    saleType: z.enum(["individual", "combo_pool"]).default("individual"),
    productId: z.string().min(1).max(180).optional(),
    eligibleProductIds: z.array(z.string().min(1).max(180)).min(2).max(100).optional(),
    quantityBottles: z.number().int().positive().default(1),
    totalDoses: z.number().int().positive().optional(),
    doseMl: z.number().int().positive().max(5_000).optional(),
    externalClubId: z.string().min(1).max(180),
    externalOfferId: z.string().min(1).max(180).optional(),
    externalCustomerId: z.string().min(1).max(180).optional(),
    idempotencyKey: z.string().min(8).max(180),
  })
  .strict()
  .superRefine((input, context) => {
    if (input.saleType === "individual") {
      if (!input.productId) {
        context.addIssue({
          code: "custom",
          message: "productId is required for an individual club sale",
          path: ["productId"],
        });
      }
      if (input.eligibleProductIds !== undefined) {
        context.addIssue({
          code: "custom",
          message: "eligibleProductIds must be omitted for an individual club sale",
          path: ["eligibleProductIds"],
        });
      }
    }

    if (input.saleType === "combo_pool") {
      if (input.productId !== undefined) {
        context.addIssue({
          code: "custom",
          message: "productId must be omitted for a combo sale",
          path: ["productId"],
        });
      }
      if (!input.eligibleProductIds || input.eligibleProductIds.length < 2) {
        context.addIssue({
          code: "custom",
          message: "eligibleProductIds must contain at least two products for a combo",
          path: ["eligibleProductIds"],
        });
      } else if (new Set(input.eligibleProductIds).size < 2) {
        context.addIssue({
          code: "custom",
          message: "eligibleProductIds must contain at least two distinct products",
          path: ["eligibleProductIds"],
        });
      }
      if (!input.totalDoses) {
        context.addIssue({
          code: "custom",
          message: "totalDoses is required for a combo sale",
          path: ["totalDoses"],
        });
      }
    }
  });

export const doseConsumptionSchema = z.strictObject({
  branchId: z.string().min(1).max(180),
  orderId: z.string().uuid().optional(),
  productId: z.string().min(1).max(180),
  externalClubId: z.string().min(1).max(180),
  externalOfferId: z.string().min(1).max(180).optional(),
  offerType: z.enum(["individual", "combo_pool"]).optional(),
  externalConsumptionId: z.string().min(1).max(180),
  doseMl: z.number().int().positive().max(5_000).default(50),
  employeeRef: z.string().max(180).optional(),
  idempotencyKey: z.string().min(8).max(180),
});

export const doseConsumptionReversalSchema = z.strictObject({
  branchId: z.string().min(1).max(180),
  productId: z.string().min(1).max(180),
  externalClubId: z.string().min(1).max(180),
  externalConsumptionId: z.string().min(1).max(180),
  externalReversalId: z.string().min(1).max(180),
  originalIdempotencyKey: z.string().min(8).max(180),
  doseMl: z.number().int().positive().max(5_000),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().min(8).max(180),
});

export const customerLinkSchema = z.strictObject({
  customerId: z.string().min(1).max(180),
  externalCustomerId: z.string().min(1).max(180),
  idempotencyKey: z.string().min(8).max(180),
});

export const configureSchema = z.strictObject({
  branchId: z.string().optional(),
  remoteClientId: z.string().trim().min(1).max(160).optional(),
  webhookSecretRef: z
    .string()
    .trim()
    .regex(
      /^CLUB_WHISKY_WEBHOOK_SECRET(?:_[A-Z0-9_]+)?$/,
      "Webhook secret reference must use the CLUB_WHISKY_WEBHOOK_SECRET prefix",
    )
    .optional(),
  webhookUrl: z
    .url()
    .refine(isAllowedDoseClubWebhookUrl, "Webhook URL is not allowed for Dose Club")
    .optional(),
  rotateKey: z.boolean().optional().default(false),
});

function isAllowedDoseClubWebhookUrl(value: string) {
  const target = new URL(value);
  const configuredBaseUrl = process.env.CLUB_WHISKY_API_BASE_URL;
  if (
    configuredBaseUrl &&
    target.origin === new URL(configuredBaseUrl).origin &&
    (process.env.NODE_ENV !== "production" || target.protocol === "https:")
  ) {
    return true;
  }

  if (
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1", "::1"].includes(target.hostname)
  ) {
    return true;
  }

  return target.protocol === "https:" && target.hostname === "doseclube.giromesa.com.br";
}

@Controller("integrations/club-whisky")
export class ClubWhiskyController {
  constructor(
    @Inject(ClubWhiskyService)
    private readonly clubWhiskyService: ClubWhiskyService,
    @Inject(AuthService)
    private readonly authService: AuthService,
    @Inject(IntegrationAuthService)
    private readonly integrationAuthService: IntegrationAuthService,
    @Inject(RateLimitService)
    private readonly rateLimitService: RateLimitService,
  ) {}

  @Get("branches")
  async listBranches(@Headers() headers: HeaderRecord) {
    const context = await this.integrationContext(headers, "branches:read");
    return {
      data: await this.clubWhiskyService.listBranches(context),
    };
  }

  @Get("products")
  async listEligibleProducts(@Headers() headers: HeaderRecord) {
    const context = await this.integrationContext(headers, "products:read");
    return {
      data: await this.clubWhiskyService.listEligibleProducts(context),
    };
  }

  @Get("stock")
  async listStockAvailability(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("productId") productId?: string,
  ) {
    const context = await this.integrationContext(headers, "stock:read");
    return {
      data: await this.clubWhiskyService.listStockAvailability(
        context,
        this.authorizedBranchId(context.branchId, branchId),
        productId,
      ),
    };
  }

  @Post("sales")
  async registerClubSale(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.integrationContext(headers, "club_sales:write");
    return this.clubWhiskyService.registerClubSale(context, clubSaleSchema.parse(body));
  }

  @Post("dose-consumptions")
  async registerDoseConsumption(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.integrationContext(headers, "club_consumption:write");
    return this.clubWhiskyService.registerDoseConsumption(
      context,
      doseConsumptionSchema.parse(body),
    );
  }

  @Post("dose-consumptions/reversals")
  async reverseDoseConsumption(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.integrationContext(headers, "club_consumption:reverse");
    return this.clubWhiskyService.reverseDoseConsumption(
      context,
      doseConsumptionReversalSchema.parse(body),
    );
  }

  @Post("customer-links")
  async linkCustomer(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.integrationContext(headers, "customers:link");
    return this.clubWhiskyService.linkCustomer(context, customerLinkSchema.parse(body));
  }

  @Post("configure")
  async ensureIntegrationAccount(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const input = configureSchema.parse(body ?? {});
    const context = await this.context(headers, "tenant:manage");
    return this.clubWhiskyService.ensureIntegrationAccount(context, input);
  }

  @Get("config")
  async getIntegrationConfig(@Headers() headers: HeaderRecord) {
    const context = await this.context(headers, "tenant:manage");
    return this.clubWhiskyService.getIntegrationConfig(context);
  }

  private async context(headers: HeaderRecord, permission: string) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }

  private integrationContext(headers: HeaderRecord, scope: string) {
    this.rateLimitService.assertAllowed(headers, {
      namespace: "club_whisky_api",
      limit: 120,
      windowMs: 60_000,
      identifier: firstHeader(headers["x-giromesa-integration-key"]),
    });
    return this.integrationAuthService.resolveContext(headers, "club_whisky", scope);
  }

  private authorizedBranchId(contextBranchId: string | undefined, requestedBranchId: string) {
    if (!requestedBranchId) {
      throw new ForbiddenException("branchId is required");
    }

    if (contextBranchId && requestedBranchId !== contextBranchId) {
      throw new ForbiddenException("Integration key is not authorized for this branch");
    }

    return requestedBranchId;
  }
}
