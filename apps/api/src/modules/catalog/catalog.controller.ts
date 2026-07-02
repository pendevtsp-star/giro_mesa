import { Body, Controller, Get, Headers, Inject, Param, Post } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { AuthService } from "../auth/auth.service";
import { CatalogService } from "./catalog.service";

const createCategorySchema = z.object({
  branchId: z.string().optional(),
  name: z.string().min(2),
  sortOrder: z.number().int().optional(),
});

const createProductSchema = z.object({
  categoryId: z.string().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
  priceCents: z.number().int().nonnegative(),
  costCents: z.number().int().nonnegative().optional(),
  channels: z.array(z.string()).optional(),
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

  @Post("categories")
  async createCategory(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    if (!context.permissions.includes("catalog:manage")) {
      return { error: "forbidden", requiredPermission: "catalog:manage" };
    }

    return this.catalogService.createCategory(context, createCategorySchema.parse(body));
  }

  @Post("products")
  async createProduct(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    if (!context.permissions.includes("catalog:manage")) {
      return { error: "forbidden", requiredPermission: "catalog:manage" };
    }

    return this.catalogService.createProduct(context, createProductSchema.parse(body));
  }

  @Get("products/:productId/modifiers")
  async listModifiers(@Param("productId") productId: string, @Headers() headers: HeaderRecord) {
    const context = await this.authService.resolveContext(headers);
    return {
      data: await this.catalogService.listModifierGroups(context, productId),
    };
  }
}
