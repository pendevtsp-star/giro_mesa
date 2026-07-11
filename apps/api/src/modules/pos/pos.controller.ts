import { paymentMethods } from "@giromesa/domain";
import {
  BadRequestException,
  Body,
  Controller,
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
});

const splitSchema = z.object({
  totalCents: z.number().int().positive(),
  people: z.number().int().positive(),
});

const cashOpenSchema = z.object({
  branchId: z.string().min(1),
  openingAmountCents: z.number().int().nonnegative(),
});

const cashCloseSchema = z.object({
  countedAmountCents: z.number().int().nonnegative(),
});
const floorLayoutSchema = z.object({
  branchId: z.string().min(1),
  layout: z.record(z.string(), z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) })),
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

  @Get("floor-plan")
  async getFloorPlan(@Headers() headers: HeaderRecord, @Query("branchId") branchId: string) {
    const context = await this.contextWithPermission(headers);
    return this.posService.getFloorPlan(context, branchId);
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

  @Patch("orders/:orderId/customer")
  async assignCustomer(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    return this.posService.assignCustomer(context, orderId, assignCustomerSchema.parse(body).customerId);
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

  @Post("orders/:orderId/send-to-kitchen")
  async sendToKitchen(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "pos:kds_send");
    return this.posService.sendToKitchen(context, orderId);
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
    await this.contextWithPermission(headers);
    const input = splitSchema.parse(body);
    return this.posService.splitBill(orderId, input.totalCents, input.people);
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
