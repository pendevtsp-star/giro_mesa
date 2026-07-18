import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { CatalogService } from "./catalog.service";

const createCategorySchema = z.object({
  branchId: z.string().optional(),
  name: z.string().min(2),
  sortOrder: z.number().int().optional(),
});

const updateCategorySchema = createCategorySchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

const createProductSchema = z.object({
  categoryId: z.string().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
  sku: z.string().optional(),
  priceCents: z.number().int().nonnegative(),
  costCents: z.number().int().nonnegative().optional(),
  imageUrl: z.string().optional(),
  isAvailable: z.boolean().optional(),
  isClubEligible: z.boolean().optional(),
  bottleVolumeMl: z.number().int().positive().optional(),
  defaultDoseMl: z.number().int().positive().optional(),
  spiritType: z.string().optional(),
  channels: z.array(z.string()).optional(),
  fiscalNcm: z.string().optional(),
  fiscalCfop: z.string().optional(),
  fiscalCest: z.string().optional(),
  fiscalOrigin: z.string().optional(),
  fiscalCst: z.string().optional(),
  fiscalCsosn: z.string().optional(),
});

const updateProductSchema = createProductSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

const modifierGroupSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(2).max(120),
  minChoices: z.number().int().min(0).optional(),
  maxChoices: z.number().int().min(1).optional(),
  isRequired: z.boolean().optional(),
});
const modifierOptionSchema = z.object({
  name: z.string().min(2).max(120),
  priceDeltaCents: z.number().int().optional(),
  costDeltaCents: z.number().int().optional(),
  isAvailable: z.boolean().optional(),
});

const publicQrOrderSchema = z.object({
  tenantSlug: z.string().min(1).default("bar-aurora-demo"),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive().default(1),
        notes: z.string().optional(),
      }),
    )
    .min(1),
});

const publicQrActionSchema = z.object({
  tenantSlug: z.string().min(1).default("bar-aurora-demo"),
  message: z.string().optional(),
});

@Controller("catalog")
export class CatalogController {
  constructor(
    @Inject(CatalogService)
    private readonly catalogService: CatalogService,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Get("products")
  async listProducts(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    return {
      data: await this.catalogService.listProducts(context),
    };
  }

  @Get("categories")
  async listCategories(@Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    return {
      data: await this.catalogService.listCategories(context),
    };
  }

  @Get("public/menu/:tenantSlug")
  async publicMenu(@Param("tenantSlug") tenantSlug: string) {
    return this.catalogService.getPublicMenu(tenantSlug);
  }

  @Get("public/qr/:tableCode")
  async publicQr(
    @Param("tableCode") tableCode: string,
    @Query("tenantSlug") tenantSlug = "bar-aurora-demo",
  ) {
    return this.catalogService.getPublicQrContext(tenantSlug, tableCode);
  }

  @Post("categories")
  async createCategory(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "catalog:manage");

    return this.catalogService.createCategory(context, createCategorySchema.parse(body));
  }

  @Patch("categories/:categoryId")
  async updateCategory(
    @Param("categoryId") categoryId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "catalog:manage");

    return this.catalogService.updateCategory(
      context,
      categoryId,
      updateCategorySchema.parse(body),
    );
  }

  @Post("products")
  async createProduct(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "catalog:manage");

    return this.catalogService.createProduct(context, createProductSchema.parse(body));
  }

  @Patch("products/:productId")
  async updateProduct(
    @Param("productId") productId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "catalog:manage");

    return this.catalogService.updateProduct(context, productId, updateProductSchema.parse(body));
  }

  @Post("public/qr/:tableCode/orders")
  async createPublicQrOrder(@Param("tableCode") tableCode: string, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.catalogService.createPublicQrOrder(tableCode, publicQrOrderSchema.parse(body));
  }

  @Post("public/qr/:tableCode/call-waiter")
  async callWaiter(@Param("tableCode") tableCode: string, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.catalogService.registerPublicQrAction(
      tableCode,
      "qr.waiter_requested",
      publicQrActionSchema.parse(body),
    );
  }

  @Post("public/qr/:tableCode/pre-bill")
  async requestPreBill(@Param("tableCode") tableCode: string, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.catalogService.registerPublicQrAction(
      tableCode,
      "qr.pre_bill_requested",
      publicQrActionSchema.parse(body),
    );
  }

  @Get("products/:productId/modifiers")
  async listModifiers(@Param("productId") productId: string, @Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    return {
      data: await this.catalogService.listModifierGroups(context, productId),
    };
  }

  @Post("modifier-groups")
  async createModifierGroup(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "catalog:manage");
    return this.catalogService.createModifierGroup(context, modifierGroupSchema.parse(body));
  }

  @Post("modifier-groups/:groupId/options")
  async createModifierOption(
    @Param("groupId") groupId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, "catalog:manage");
    return this.catalogService.createModifierOption(
      context,
      groupId,
      modifierOptionSchema.parse(body),
    );
  }
}
