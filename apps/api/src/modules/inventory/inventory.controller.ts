import { Body, Controller, Get, Headers, Inject, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { InventoryService } from "./inventory.service";

const createItemSchema = z.object({
  name: z.string().min(2),
  unit: z.string().min(1),
  averageCostCents: z.number().int().nonnegative().optional(),
  minQuantity: z.string().optional(),
  allowNegative: z.boolean().optional(),
});

const adjustStockSchema = z.object({
  branchId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  stockLocationId: z.string().optional(),
  type: z
    .enum(["purchase_receipt", "loss", "inventory_count", "manual_adjustment"])
    .default("manual_adjustment"),
  quantity: z.string().regex(/^-?\d+(\.\d+)?$/, "Quantidade inválida"),
  unitCostCents: z.number().int().nonnegative().optional(),
  reason: z.string().min(5),
});

const recipeSchema = z.object({
  productId: z.string().min(1),
  yieldQuantity: z.string().optional(),
  technicalLossRate: z.string().optional(),
  items: z.array(
    z.object({
      inventoryItemId: z.string().min(1),
      quantity: z.string().min(1),
      unit: z.string().min(1),
    }),
  ),
});

@Controller("inventory")
export class InventoryController {
  constructor(
    @Inject(InventoryService) private readonly inventoryService: InventoryService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get("summary")
  async listSummary(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.context(headers, "inventory:manage");
    return { data: await this.inventoryService.listSummary(context, branchId) };
  }

  @Get("alerts")
  async listAlerts(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.context(headers, "inventory:manage");
    return { data: await this.inventoryService.listAlerts(context, branchId) };
  }

  @Get("locations")
  async listLocations(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.context(headers, "inventory:manage");
    return { data: await this.inventoryService.listLocations(context, branchId) };
  }

  @Get("movements")
  async listMovements(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("limit") limit?: string,
  ) {
    const context = await this.context(headers, "inventory:manage");
    return {
      data: await this.inventoryService.listMovements(context, branchId, Number(limit) || 50),
    };
  }

  @Post("items")
  async createItem(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "inventory:manage");
    return this.inventoryService.createItem(context, createItemSchema.parse(body));
  }

  @Post("adjustments")
  async adjustStock(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "inventory:manage");
    return this.inventoryService.adjustStock(context, adjustStockSchema.parse(body));
  }

  @Post("recipes")
  async upsertRecipe(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "inventory:manage");
    return this.inventoryService.upsertRecipe(context, recipeSchema.parse(body));
  }

  private async context(headers: HeaderRecord, permission: string) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }
}
