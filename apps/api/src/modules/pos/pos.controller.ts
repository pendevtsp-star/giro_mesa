import { paymentMethods, tableStatuses } from "@giromesa/domain";
import {
  BadRequestException,
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
  Sse,
} from "@nestjs/common";
import { distinctUntilChanged, from, interval, map, startWith, switchMap } from "rxjs";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { PosService } from "./pos.service";

const openOrderSchema = z.object({
  channel: z.enum(["counter", "table", "tab", "delivery", "qr"]),
  branchId: z.string().min(1),
  tableId: z.string().optional(),
  customerId: z.string().optional(),
  peopleCount: z.number().int().positive().optional(),
});
const assignCustomerSchema = z.object({ customerId: z.string().min(1) });

const addItemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  notes: z.string().optional(),
  modifiers: z.array(z.record(z.string(), z.unknown())).optional(),
});

const paymentSchema = z.object({
  amountCents: z.number().int().positive(),
  method: z.enum(paymentMethods),
  idempotencyKey: z.string().min(8),
  registeredVia: z.enum(["waiter", "cashier"]).default("cashier"),
  reference: z.string().max(120).optional(),
});

const splitSchema = z.object({
  people: z.number().int().positive(),
});

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const businessIntervalSchema = z.object({ opensAt: timeSchema, closesAt: timeSchema });
const businessHoursSchema = z.object({
  weekly: z.array(
    businessIntervalSchema.extend({
      weekday: z.number().int().min(0).max(6),
      sortOrder: z.number().int().nonnegative(),
    }),
  ),
  exceptions: z.array(
    z.object({
      date: z.string().date(),
      isClosed: z.boolean(),
      intervals: z.array(businessIntervalSchema),
      reason: z.string().max(160).nullable().optional(),
    }),
  ),
});
const operationalSettingsSchema = z
  .object({
    cleaningMode: z.enum(["manual", "automatic"]).optional(),
    allowWaiterPayments: z.boolean().optional(),
    defaultTheme: z.enum(["light", "dark", "system"]).optional(),
    defaultKdsInputMode: z.enum(["touch", "keyboard", "hybrid", "printer"]).optional(),
  })
  .refine((input) => Object.keys(input).length > 0, "At least one setting is required");
const preferencesSchema = z.object({
  branchId: z.string().uuid(),
  theme: z.enum(["light", "dark", "system"]),
  kdsInput: z.enum(["touch", "keyboard", "hybrid", "printer"]),
});
const deviceSchema = preferencesSchema.extend({
  name: z.string().min(2).max(120),
  kind: z.enum(["pos", "salon", "waiter", "kds", "expedition", "cashier"]),
});

const cashOpenSchema = z.object({
  branchId: z.string().min(1),
  openingAmountCents: z.number().int().nonnegative(),
});

const shiftSchema = z.object({
  branchId: z.string().min(1),
  notes: z.string().max(500).optional(),
  idempotencyKey: z.string().min(8).max(180).optional(),
});

const cashMovementSchema = z.object({
  branchId: z.string().min(1),
  amountCents: z.number().int().positive(),
  reason: z.string().min(3).max(240),
});

const cashCloseSchema = z.object({
  countedAmountCents: z.number().int().nonnegative(),
  idempotencyKey: z.string().min(8).max(120).optional(),
});
const floorLayoutSchema = z.object({
  branchId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
  layout: z.record(
    z.string(),
    z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }),
  ),
});
const createTableSchema = z.object({
  branchId: z.string().min(1),
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  seats: z.number().int().min(1).max(40),
});

const mergeTablesSchema = z.object({
  branchId: z.string().min(1),
  tableIds: z.array(z.string().min(1)).min(2).max(8),
});

const qrOrderItemUpdateSchema = z.object({
  quantity: z.number().positive().max(99),
  notes: z.string().max(240).optional(),
});

const qrOrderRejectSchema = z.object({
  reason: z.string().min(3).max(240),
});

const qrOrderItemCancelSchema = z.object({
  reason: z.string().min(3).max(240),
});

const discountSchema = z.object({
  amountCents: z.number().int().positive(),
  reason: z.string().min(3).max(240),
});

const itemCancellationSchema = z.object({
  reason: z.string().min(3).max(240),
});

@Controller("pos")
export class PosController {
  constructor(
    @Inject(PosService)
    private readonly posService: PosService,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Get("tables")
  async listTables(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.posService.listTables(context, branchId),
    };
  }

  @Post("tables")
  async createTable(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.posService.createTable(context, createTableSchema.parse(body));
  }

  @Patch("tables/:tableId")
  async updateTable(
    @Param("tableId") tableId: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    const parsed = z
      .object({
        status: z.enum(tableStatuses).optional(),
        reservedName: z.string().max(120).nullable().optional(),
      })
      .parse(body);
    const updates = {
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
      ...(parsed.reservedName !== undefined ? { reservedName: parsed.reservedName } : {}),
    };
    return { data: await this.posService.updateTable(context, tableId, updates) };
  }

  @Post("merge-tables")
  async mergeTables(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    const input = mergeTablesSchema.parse(body);
    return { data: await this.posService.mergeTables(context, input.branchId, input.tableIds) };
  }

  @Delete("unmerge-tables/:tableId")
  async unmergeTables(@Param("tableId") tableId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "pos:operate");
    return { data: await this.posService.unmergeTables(context, tableId) };
  }

  @Get("floor-plan")
  async getFloorPlan(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.contextWithPermission(headers);
    return this.posService.getFloorPlan(context, branchId);
  }

  @Get("dashboard/summary")
  async getDashboardSummary(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId?: string,
  ) {
    const context = await this.contextWithPermission(headers);
    const resolvedBranchId = branchId ?? context.branchId;
    if (!resolvedBranchId) {
      return {
        salesToday: 0,
        activeOrders: 0,
        occupiedTables: "0/0",
        cashBalance: 0,
        shiftOpen: false,
        cashOpen: false,
        inventoryAlerts: 0,
      };
    }
    return this.posService.getDashboardSummary(context, resolvedBranchId);
  }

  @Patch("floor-plan")
  async saveFloorPlan(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.posService.saveFloorPlan(context, floorLayoutSchema.parse(body));
  }

  @Get("orders/qr-pending")
  async listQrPendingOrders(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.posService.listQrPendingOrders(context, branchId),
    };
  }

  @Sse("events")
  events(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    if (!branchId) {
      throw new BadRequestException("branchId is required");
    }

    return from(this.contextWithPermission(headers)).pipe(
      switchMap((context) =>
        interval(5000).pipe(
          startWith(0),
          switchMap(() => from(this.posService.getOperationalEventSnapshot(context, branchId))),
          distinctUntilChanged((previous, current) => previous.signature === current.signature),
          map((snapshot) => ({
            type: "pos.changed",
            data: snapshot,
          })),
        ),
      ),
    );
  }

  @Get("events/history")
  async listOperationalEvents(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("afterVersion") afterVersion = "0",
    @Query("limit") limit = "100",
  ) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.posService.listOperationalEvents(
        context,
        z.string().uuid().parse(branchId),
        z.coerce.number().int().nonnegative().parse(afterVersion),
        z.coerce.number().int().min(1).max(200).parse(limit),
      ),
    };
  }

  @Get("session")
  async getOperationalSession(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("tableId") tableId?: string,
    @Query("orderId") orderId?: string,
  ) {
    const context = await this.contextWithPermission(headers);
    return this.posService.getOperationalSession(context, {
      branchId: z.string().uuid().parse(branchId),
      ...(tableId ? { tableId: z.string().uuid().parse(tableId) } : {}),
      ...(orderId ? { orderId: z.string().uuid().parse(orderId) } : {}),
    });
  }

  @Get("branches/:branchId/operational-settings")
  async getOperationalSettings(
    @Param("branchId") branchId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.contextWithPermission(headers);
    return this.posService.getOperationalSettings(context, z.string().uuid().parse(branchId));
  }

  @Patch("branches/:branchId/operational-settings")
  async updateOperationalSettings(
    @Param("branchId") branchId: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    return this.posService.updateOperationalSettings(
      context,
      z.string().uuid().parse(branchId),
      operationalSettingsSchema.parse(body),
    );
  }

  @Get("branches/:branchId/business-hours")
  async getBusinessHours(@Param("branchId") branchId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers);
    return this.posService.getBusinessHours(context, z.string().uuid().parse(branchId));
  }

  @Patch("branches/:branchId/business-hours")
  async replaceBusinessHours(
    @Param("branchId") branchId: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    return this.posService.replaceBusinessHours(
      context,
      z.string().uuid().parse(branchId),
      businessHoursSchema.parse(body),
    );
  }

  @Patch("preferences")
  async saveOperationalPreferences(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    const input = preferencesSchema.parse(body);
    return this.posService.saveOperationalPreferences(context, input.branchId, {
      theme: input.theme,
      kdsInput: input.kdsInput,
    });
  }

  @Post("operator-pin")
  async setPersonalPin(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    const input = z
      .object({ branchId: z.string().uuid(), pin: z.string().regex(/^\d{4,8}$/) })
      .parse(body);
    return this.posService.setPersonalPin(context, input.branchId, input.pin);
  }

  @Post("devices")
  async registerOperationalDevice(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "tenant:manage");
    return this.posService.registerOperationalDevice(context, deviceSchema.parse(body));
  }

  @Get("tables/:tableId/history")
  async listTableHistory(
    @Param("tableId") tableId: string,
    @Headers() headers: HeaderRecord,
    @Query("limit") limit?: string,
  ) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.posService.listTableHistory(
        context,
        tableId,
        limit ? Number(limit) : undefined,
      ),
    };
  }

  @Post("orders/open")
  async openOrder(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    return this.posService.openOrder(context, openOrderSchema.parse(body));
  }

  @Get("orders/active")
  async getActiveOrder(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("tableId") tableId?: string,
    @Query("orderId") orderId?: string,
  ) {
    const context = await this.contextWithPermission(headers);
    return {
      data: await this.posService.getActiveOrder(context, {
        branchId: z.string().uuid().parse(branchId),
        ...(tableId ? { tableId: z.string().uuid().parse(tableId) } : {}),
        ...(orderId ? { orderId: z.string().uuid().parse(orderId) } : {}),
      }),
    };
  }

  @Patch("orders/:orderId/customer")
  async assignCustomer(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    return this.posService.assignCustomer(
      context,
      orderId,
      assignCustomerSchema.parse(body).customerId,
    );
  }

  @Post("orders/:orderId/items")
  async addItem(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    return this.posService.addItem(context, orderId, addItemSchema.parse(body));
  }

  @Post("orders/:orderId/discounts")
  async requestDiscount(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.posService.requestDiscount(
      context,
      z.string().uuid().parse(orderId),
      discountSchema.parse(body),
    );
  }

  @Post("orders/:orderId/items/:itemId/cancel-requests")
  async requestItemCancellation(
    @Param("orderId") orderId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.posService.requestItemCancellation(
      context,
      z.string().uuid().parse(orderId),
      z.string().uuid().parse(itemId),
      itemCancellationSchema.parse(body),
    );
  }

  @Post("orders/:orderId/send-to-kitchen")
  async sendToKitchen(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "pos:kds_send");
    return this.posService.sendToKitchen(context, orderId);
  }

  @Get("orders/:orderId/production-routing-preview")
  async getProductionRoutingPreview(
    @Param("orderId") orderId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.contextWithPermission(headers, "pos:kds_send");
    return this.posService.getProductionRoutingPreview(context, z.string().uuid().parse(orderId));
  }

  @Patch("orders/:orderId/qr-items/:itemId")
  async updateQrOrderItem(
    @Param("orderId") orderId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:qr_review");
    return this.posService.updateQrOrderItem(
      context,
      orderId,
      itemId,
      qrOrderItemUpdateSchema.parse(body),
    );
  }

  @Post("orders/:orderId/qr-items/:itemId/cancel")
  async cancelQrOrderItem(
    @Param("orderId") orderId: string,
    @Param("itemId") itemId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:qr_review");
    return this.posService.cancelQrOrderItem(
      context,
      orderId,
      itemId,
      qrOrderItemCancelSchema.parse(body),
    );
  }

  @Post("orders/:orderId/qr-reject")
  async rejectQrOrder(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:qr_review");
    return this.posService.rejectQrOrder(context, orderId, qrOrderRejectSchema.parse(body));
  }

  @Post("orders/:orderId/split")
  async splitBill(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    const input = splitSchema.parse(body);
    return this.posService.splitBill(context, z.string().uuid().parse(orderId), input.people);
  }

  @Post("orders/:orderId/payments")
  async registerPayment(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return this.posService.registerPayment(context, orderId, paymentSchema.parse(body));
  }

  @Get("orders/:orderId/payments")
  async listOrderPayments(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "pos:payment_manage");
    return {
      data: await this.posService.listOrderPayments(context, orderId),
    };
  }

  @Post("payments/:paymentId/cash-handover/receive")
  async receiveCashHandover(
    @Param("paymentId") paymentId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    z.object({}).parse(body);
    return this.posService.receiveCashHandover(context, z.string().uuid().parse(paymentId));
  }

  @Post("orders/:orderId/close")
  async closeOrder(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "pos:close_order");
    return this.posService.closeOrder(context, orderId);
  }

  @Post("orders/:orderId/print-bill-preview")
  async printBillPreview(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "print:operate");
    return this.posService.printBillPreview(context, orderId);
  }

  @Post("orders/:orderId/print-payment-receipt")
  async printPaymentReceipt(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "print:operate");
    return this.posService.printPaymentReceipt(context, orderId);
  }

  @Post("cash-sessions/open")
  async openCashSession(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.openCashSession(context, cashOpenSchema.parse(body));
  }

  @Get("shift/current")
  async getCurrentShift(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.posService.getCurrentShift(context, branchId);
  }

  @Post("shift/open")
  async openShift(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "pos:operate");
    return this.posService.openShift(context, shiftSchema.parse(body));
  }

  @Post("shift/close")
  async closeShift(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.closeShift(context, shiftSchema.parse(body));
  }

  @Get("cash/current")
  async getCurrentCashSession(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.getCurrentCashSession(context, branchId);
  }

  @Post("cash/open")
  async openCash(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.openCashSession(context, cashOpenSchema.parse(body));
  }

  @Post("cash/supply")
  async supplyCash(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.registerCashMovement(context, "supply", cashMovementSchema.parse(body));
  }

  @Post("cash/withdrawal")
  async withdrawCash(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.registerCashMovement(
      context,
      "withdrawal",
      cashMovementSchema.parse(body),
    );
  }

  @Get("cash-sessions/summary")
  async getCashSessionSummary(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
  ) {
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.getCashSessionSummary(context, branchId);
  }

  @Post("cash-sessions/:cashSessionId/close")
  async closeCashSession(
    @Param("cashSessionId") cashSessionId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.closeCashSession(context, cashSessionId, cashCloseSchema.parse(body));
  }

  @Post("cash-sessions/:cashSessionId/print-summary")
  async printCashSummary(
    @Param("cashSessionId") cashSessionId: string,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.contextWithPermission(headers, "print:operate");
    return this.posService.printCashSummary(context, cashSessionId);
  }

  private async contextWithPermission(headers: HeaderRecord, permission = "pos:operate") {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }
}
