import { paymentMethods } from "@giromesa/domain";
import { Body, Controller, Get, Headers, Inject, Param, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { AuthService } from "../auth/auth.service";
import { PosService } from "./pos.service";

const openOrderSchema = z.object({
  channel: z.enum(["counter", "table", "tab", "delivery", "qr"]),
  branchId: z.string().min(1),
  tableId: z.string().optional(),
  peopleCount: z.number().int().positive().optional(),
});

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

  @Post("orders/open")
  async openOrder(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers);
    return this.posService.openOrder(context, openOrderSchema.parse(body));
  }

  @Post("orders/:orderId/items")
  async addItem(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.contextWithPermission(headers);
    return this.posService.addItem(context, orderId, addItemSchema.parse(body));
  }

  @Post("orders/:orderId/send-to-kitchen")
  async sendToKitchen(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers);
    return this.posService.sendToKitchen(context, orderId);
  }

  @Post("orders/:orderId/split")
  splitBill(@Param("orderId") orderId: string, @Body() body: unknown) {
    const input = splitSchema.parse(body);
    return this.posService.splitBill(orderId, input.totalCents, input.people);
  }

  @Post("orders/:orderId/payments")
  async registerPayment(
    @Param("orderId") orderId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.contextWithPermission(headers);
    return this.posService.registerPayment(context, orderId, paymentSchema.parse(body));
  }

  @Post("orders/:orderId/close")
  async closeOrder(@Param("orderId") orderId: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers);
    return this.posService.closeOrder(context, orderId);
  }

  @Post("cash-sessions/open")
  async openCashSession(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.openCashSession(context, cashOpenSchema.parse(body));
  }

  @Post("cash-sessions/:cashSessionId/close")
  async closeCashSession(
    @Param("cashSessionId") cashSessionId: string,
    @Body() body: unknown,
    @Headers() headers: HeaderRecord,
  ) {
    const context = await this.contextWithPermission(headers, "cash:manage");
    return this.posService.closeCashSession(context, cashSessionId, cashCloseSchema.parse(body));
  }

  private async contextWithPermission(headers: HeaderRecord, permission = "pos:operate") {
    const context = await this.authService.resolveContext(headers);
    if (!context.permissions.includes(permission)) {
      throw new Error(`Missing permission: ${permission}`);
    }
    return context;
  }
}
