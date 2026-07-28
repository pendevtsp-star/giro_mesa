import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
import { rejectTenantOverride, requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { DeliveryService } from "./delivery.service";

const createDeliverySchema = z.object({
  orderId: z.string().min(1),
  channel: z.enum(["own_app", "ifood", "rappi", "phone"]),
  customerName: z.string().max(160).optional(),
  customerPhone: z.string().max(40).optional(),
  deliveryAddress: z.string().optional(),
  deliveryFee: z.number().int().nonnegative().optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  riderName: z.string().max(120).optional(),
  riderPhone: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    "pending",
    "confirmed",
    "preparing",
    "ready_for_pickup",
    "out_for_delivery",
    "delivered",
    "canceled",
  ]),
});

const cancelDeliverySchema = z.object({
  reason: z.string().min(3).max(240),
});

@Controller("deliveries")
export class DeliveryController {
  constructor(
    @Inject(DeliveryService)
    private readonly deliveryService: DeliveryService,
    @Inject(AuthService)
    private readonly authService: AuthService,
  ) {}

  @Post()
  async createDelivery(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    return this.deliveryService.createDelivery(context, createDeliverySchema.parse(body));
  }

  @Get()
  async listDeliveries(
    @Headers() headers: HeaderRecord,
    @Query("branchId") branchId: string,
    @Query("status") status?: string,
  ) {
    const context = await this.contextWithPermission(headers);
    const parsedStatus =
      status === undefined ? undefined : updateStatusSchema.shape.status.parse(status);
    return {
      data: await this.deliveryService.listDeliveries(context, branchId, parsedStatus),
    };
  }

  @Get(":id")
  async getDelivery(@Param("id") id: string, @Headers() headers: HeaderRecord) {
    const context = await this.contextWithPermission(headers);
    return this.deliveryService.getDelivery(context, id);
  }

  @Patch(":id/status")
  async updateStatus(
    @Param("id") id: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    const { status } = updateStatusSchema.parse(body);
    return this.deliveryService.updateDeliveryStatus(context, id, status);
  }

  @Post(":id/cancel")
  async cancelDelivery(
    @Param("id") id: string,
    @Headers() headers: HeaderRecord,
    @Body() body: unknown,
  ) {
    rejectTenantOverride(body);
    const context = await this.contextWithPermission(headers);
    const { reason } = cancelDeliverySchema.parse(body);
    return this.deliveryService.cancelDelivery(context, id, reason);
  }

  private async contextWithPermission(headers: HeaderRecord, permission = "delivery:manage") {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }
}
