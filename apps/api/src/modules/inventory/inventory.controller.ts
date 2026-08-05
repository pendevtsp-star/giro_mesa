import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
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

const supplierSchema = z.object({
  name: z.string().min(2).max(160),
  document: z.string().max(32).optional(),
  contactName: z.string().max(160).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().max(255).optional(),
});

const adjustStockSchema = z.object({
  branchId: z.string().min(1),
  inventoryItemId: z.string().min(1),
  stockLocationId: z.string().optional(),
  supplierId: z.string().optional(),
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

const locationSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(2).max(120),
  type: z.enum(["salon", "production", "stock"]),
});
const transferSchema = z.object({
  branchId: z.string().uuid(),
  originLocationId: z.string().uuid(),
  destinationLocationId: z.string().uuid(),
  reason: z.string().min(5).max(500),
  idempotencyKey: z.string().min(8).max(160),
  submit: z.boolean().optional(),
  lines: z
    .array(
      z.object({ inventoryItemId: z.string().uuid(), quantity: z.string().regex(/^\d+(\.\d+)?$/) }),
    )
    .min(1),
});
const receiveTransferSchema = z.object({
  expectedVersion: z.number().int().positive(),
  lines: z
    .array(
      z.object({
        id: z.string().uuid(),
        quantityReceived: z.string().regex(/^\d+(\.\d+)?$/),
        divergenceReason: z.string().max(500).optional(),
      }),
    )
    .min(1),
});
const settingsSchema = z.object({
  branchId: z.string().uuid(),
  transferMode: z.enum(["immediate", "awaiting_receipt"]),
  managerApprovalThreshold: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .refine((value) => Number(value) <= 100, "Limite deve estar entre 0 e 100%"),
  consumptionLocationId: z.string().uuid(),
});
const returnableMappingSchema = z.object({
  productId: z.string().uuid(),
  fullInventoryItemId: z.string().uuid(),
  emptyInventoryItemId: z.string().uuid(),
});
const returnableEventSchema = z
  .object({
    branchId: z.string().uuid(),
    stockLocationId: z.string().uuid(),
    mappingId: z.string().uuid(),
    quantity: z.string().regex(/^\d+(\.\d+)?$/),
    type: z.enum(["supplier_exchange", "breakage", "loss"]),
    reason: z.string().min(5).max(500),
    idempotencyKey: z.string().min(8).max(180),
    supplierId: z.string().uuid().optional(),
  })
  .superRefine((input, context) => {
    if (input.type === "supplier_exchange" && !input.supplierId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["supplierId"],
        message: "Fornecedor é obrigatório para troca",
      });
    }
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

  @Get("location-balances")
  async listLocationBalances(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    const context = await this.context(headers, "inventory:manage");
    return { data: await this.inventoryService.listLocationBalances(context, branchId) };
  }

  @Post("locations")
  async createLocation(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.inventoryService.createLocation(
      await this.context(headers, "inventory:manage"),
      locationSchema.parse(body),
    );
  }

  @Patch("locations/:locationId")
  async renameLocation(
    @Headers() headers: HeaderRecord,
    @Param("locationId") locationId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.inventoryService.renameLocation(
      await this.context(headers, "inventory:manage"),
      z.string().uuid().parse(locationId),
      z.object({ name: z.string().min(2).max(120) }).parse(body).name,
    );
  }

  @Post("locations/:locationId/archive")
  async archiveLocation(@Headers() headers: HeaderRecord, @Param("locationId") locationId: string) {
    return this.inventoryService.archiveLocation(
      await this.context(headers, "inventory:manage"),
      z.string().uuid().parse(locationId),
    );
  }

  @Post("settings")
  async saveSettings(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.inventoryService.saveSettings(
      await this.context(headers, "inventory:manage"),
      settingsSchema.parse(body),
    );
  }

  @Get("settings")
  async getSettings(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    return this.inventoryService.getSettings(
      await this.context(headers, "inventory:manage"),
      z.string().uuid().parse(branchId),
    );
  }

  @Get("suppliers")
  async listSuppliers(@Headers() headers: HeaderRecord) {
    const context = await this.context(headers, "inventory:manage");
    return { data: await this.inventoryService.listSuppliers(context) };
  }

  @Post("suppliers")
  async createSupplier(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.context(headers, "inventory:manage");
    return this.inventoryService.createSupplier(context, supplierSchema.parse(body));
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

  @Post("transfers")
  async createTransfer(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.inventoryService.createTransfer(
      await this.context(headers, "inventory:manage"),
      transferSchema.parse(body),
    );
  }

  @Get("transfers")
  async listTransfers(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("status") status?: string,
  ) {
    const parsedStatus = status
      ? z.enum(["draft", "awaiting_receipt", "completed", "cancelled"]).parse(status)
      : undefined;
    return {
      data: await this.inventoryService.listTransfers(
        await this.context(headers, "inventory:manage"),
        z.string().uuid().parse(branchId),
        parsedStatus,
      ),
    };
  }

  @Post("transfers/:transferId/receive")
  async receiveTransfer(
    @Headers() headers: HeaderRecord,
    @Param("transferId") transferId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    return this.inventoryService.receiveTransfer(
      await this.context(headers, "inventory:manage"),
      z.string().uuid().parse(transferId),
      receiveTransferSchema.parse(body),
    );
  }

  @Post("transfers/:transferId/dispatch")
  async dispatchTransfer(
    @Headers() headers: HeaderRecord,
    @Param("transferId") transferId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const { expectedVersion } = z
      .object({ expectedVersion: z.number().int().positive() })
      .parse(body);
    return this.inventoryService.dispatchDraftTransfer(
      await this.context(headers, "inventory:manage"),
      z.string().uuid().parse(transferId),
      expectedVersion,
    );
  }

  @Post("transfers/:transferId/cancel")
  async cancelTransfer(
    @Headers() headers: HeaderRecord,
    @Param("transferId") transferId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const { expectedVersion } = z
      .object({ expectedVersion: z.number().int().positive() })
      .parse(body);
    return this.inventoryService.cancelTransfer(
      await this.context(headers, "inventory:manage"),
      z.string().uuid().parse(transferId),
      expectedVersion,
    );
  }

  @Post("transfers/:transferId/reverse")
  async reverseTransfer(
    @Headers() headers: HeaderRecord,
    @Param("transferId") transferId: string,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const { expectedVersion, reason } = z
      .object({ expectedVersion: z.number().int().positive(), reason: z.string().min(5).max(500) })
      .parse(body);
    return this.inventoryService.reverseTransfer(
      await this.context(headers, "inventory:manage"),
      z.string().uuid().parse(transferId),
      expectedVersion,
      reason,
    );
  }

  @Post("returnables/mappings")
  async upsertReturnableMapping(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.inventoryService.upsertReturnableMapping(
      await this.context(headers, "inventory:manage"),
      returnableMappingSchema.parse(body),
    );
  }

  @Get("returnables/mappings")
  async listReturnableMappings(@Headers() headers: HeaderRecord) {
    return {
      data: await this.inventoryService.listReturnableMappings(
        await this.context(headers, "inventory:manage"),
      ),
    };
  }

  @Post("returnables/events")
  async recordReturnableEvent(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    return this.inventoryService.recordReturnableEvent(
      await this.context(headers, "inventory:manage"),
      returnableEventSchema.parse(body),
    );
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
