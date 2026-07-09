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

const clubSaleSchema = z.object({
  branchId: z.string().min(1),
  productId: z.string().min(1),
  quantityBottles: z.number().int().positive(),
  externalClubId: z.string().min(1),
  externalCustomerId: z.string().optional(),
  idempotencyKey: z.string().min(8),
});

const doseConsumptionSchema = z.object({
  branchId: z.string().min(1),
  productId: z.string().min(1),
  externalClubId: z.string().min(1),
  externalConsumptionId: z.string().min(1),
  doseMl: z.number().int().positive().default(50),
  employeeRef: z.string().optional(),
  idempotencyKey: z.string().min(8),
});

const customerLinkSchema = z.object({
  customerId: z.string().min(1),
  externalCustomerId: z.string().min(1),
  idempotencyKey: z.string().min(8),
});

const configureSchema = z.object({
  branchId: z.string().optional(),
  rotateKey: z.boolean().optional().default(false),
});

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
  ) {
    const context = await this.integrationContext(headers, "stock:read");
    return {
      data: await this.clubWhiskyService.listStockAvailability(
        context,
        this.authorizedBranchId(context.branchId, branchId),
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
