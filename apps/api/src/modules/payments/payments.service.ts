import { auditLogs, orders, payments, webhookEvents } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { AsaasProvider } from "./asaas-provider";

type PaymentMethod = "manual" | "pix" | "boleto" | "credit_card";

type CreatePaymentInput = {
  orderId: string;
  method: PaymentMethod;
  amountCents: number;
  description?: string;
  idempotencyKey: string;
  customer?: {
    name?: string;
    email?: string;
    phone?: string;
    cpfCnpj?: string;
  };
};

type ProcessWebhookInput = {
  provider: string;
  externalEventId: string;
  payload: Record<string, unknown>;
};

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(AsaasProvider) private readonly asaasProvider: AsaasProvider,
  ) {}

  async createPayment(context: TenantContext, input: CreatePaymentInput) {
    const [order] = await this.database.db
      .select()
      .from(orders)
      .where(and(eq(orders.tenantId, context.tenantId), eq(orders.id, input.orderId)))
      .limit(1);

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (context.branchId && order.branchId !== context.branchId) {
      throw new ForbiddenException("Order does not belong to this branch");
    }

    const [existingPayment] = await this.database.db
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.tenantId, context.tenantId),
          eq(payments.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1);

    if (existingPayment) {
      return {
        accepted: true,
        duplicate: true,
        paymentId: existingPayment.id,
        status: existingPayment.status,
      };
    }

    if (input.method === "manual") {
      return this.createManualPayment(context, order, input);
    }

    return this.createAsaasPayment(context, order, input);
  }

  private async createManualPayment(
    context: TenantContext,
    order: { id: string; tenantId: string; totalCents: number },
    input: CreatePaymentInput,
  ) {
    const [payment] = await this.database.db
      .insert(payments)
      .values({
        tenantId: context.tenantId,
        orderId: order.id,
        provider: "manual",
        method: "manual",
        status: "confirmed",
        amountCents: input.amountCents,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          description: input.description,
        },
        confirmedAt: new Date(),
      })
      .returning();

    if (!payment) {
      throw new BadRequestException("Failed to create payment");
    }

    await this.database.db
      .update(orders)
      .set({ status: "paid", updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await this.audit(context, {
      branchId: context.branchId,
      action: "payment.created",
      entityType: "payment",
      entityId: payment.id,
      metadata: {
        orderId: order.id,
        method: "manual",
        amountCents: input.amountCents,
      },
    });

    return {
      accepted: true,
      duplicate: false,
      paymentId: payment.id,
      status: "confirmed",
    };
  }

  private async createAsaasPayment(
    context: TenantContext,
    order: { id: string; tenantId: string; totalCents: number; branchId: string },
    input: CreatePaymentInput,
  ) {
    const asaasMethod = this.mapPaymentMethod(input.method);

    const asaasInput: Parameters<AsaasProvider["createPayment"]>[0] = {
      tenantId: context.tenantId,
      orderId: order.id,
      amountCents: input.amountCents,
      method: asaasMethod,
      description: input.description || `Pedido ${order.id.slice(0, 8)}`,
      externalReference: `gm-order-${context.tenantId}-${order.id}-${Date.now()}`,
    };

    if (input.customer) {
      asaasInput.customer = input.customer;
    }

    const result = await this.asaasProvider.createPayment(asaasInput);

    if (!result.ok) {
      throw new BadRequestException(`Payment creation failed: ${result.errorMessage}`);
    }

    const [payment] = await this.database.db
      .insert(payments)
      .values({
        tenantId: context.tenantId,
        orderId: order.id,
        provider: "asaas",
        method: input.method,
        status: "pending",
        amountCents: input.amountCents,
        externalId: result.externalId,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          asaasPaymentId: result.data?.paymentId,
          paymentUrl: result.data?.paymentUrl,
          pixPayload: result.data?.pixPayload,
          boletoUrl: result.data?.boletoUrl,
          description: input.description,
        },
      })
      .returning();

    if (!payment) {
      throw new BadRequestException("Failed to create payment");
    }

    await this.database.db
      .update(orders)
      .set({ status: "waiting_payment", updatedAt: new Date() })
      .where(eq(orders.id, order.id));

    await this.audit(context, {
      branchId: context.branchId,
      action: "payment.created",
      entityType: "payment",
      entityId: payment.id,
      metadata: {
        orderId: order.id,
        provider: "asaas",
        method: input.method,
        amountCents: input.amountCents,
        externalId: result.externalId,
      },
    });

    return {
      accepted: true,
      duplicate: false,
      paymentId: payment.id,
      status: "pending",
      paymentUrl: result.data?.paymentUrl,
      pixPayload: result.data?.pixPayload,
      boletoUrl: result.data?.boletoUrl,
    };
  }

  async handleWebhook(input: ProcessWebhookInput) {
    const [event] = await this.database.db
      .insert(webhookEvents)
      .values({
        provider: input.provider,
        externalEventId: input.externalEventId,
        payload: input.payload,
        status: "received",
      })
      .onConflictDoNothing()
      .returning();

    if (!event) {
      return { accepted: true, duplicate: true };
    }

    if (input.provider === "asaas") {
      await this.processAsaasWebhook(event.id, input.payload);
    }

    return { accepted: true, duplicate: false, webhookEventId: event.id };
  }

  private async processAsaasWebhook(webhookEventId: string, payload: Record<string, unknown>) {
    const eventName = this.readEventName(payload);
    const paymentId = this.readPaymentId(payload);

    if (!eventName || !paymentId) {
      await this.markWebhookProcessed(webhookEventId, "ignored");
      return;
    }

    const [payment] = await this.database.db
      .select()
      .from(payments)
      .where(eq(payments.externalId, paymentId))
      .limit(1);

    if (!payment) {
      await this.markWebhookProcessed(webhookEventId, "ignored");
      return;
    }

    const nextStatus = this.mapAsaasEventToPaymentStatus(eventName);
    if (!nextStatus) {
      await this.markWebhookProcessed(webhookEventId, "processed");
      return;
    }

    await this.database.db
      .update(payments)
      .set({
        status: nextStatus,
        metadata: {
          ...payment.metadata,
          lastWebhookEvent: eventName,
          lastWebhookAt: new Date().toISOString(),
        },
        confirmedAt: nextStatus === "confirmed" ? new Date() : payment.confirmedAt,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id));

    if (nextStatus === "confirmed" && payment.orderId) {
      await this.database.db
        .update(orders)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(orders.id, payment.orderId));
    }

    if (nextStatus === "refunded" && payment.orderId) {
      await this.database.db
        .update(orders)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(orders.id, payment.orderId));
    }

    await this.markWebhookProcessed(webhookEventId, "processed");
  }

  async refundPayment(
    context: TenantContext,
    paymentId: string,
    amountCents?: number,
    reason?: string,
  ) {
    const [payment] = await this.database.db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, context.tenantId), eq(payments.id, paymentId)))
      .limit(1);

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    if (payment.status !== "confirmed") {
      throw new BadRequestException("Can only refund confirmed payments");
    }

    if (payment.provider === "manual") {
      return this.refundManualPayment(context, payment, amountCents, reason);
    }

    return this.refundAsaasPayment(
      context,
      { ...payment, method: payment.method },
      amountCents,
      reason,
    );
  }

  private async refundManualPayment(
    context: TenantContext,
    payment: { id: string; orderId: string | null; amountCents: number },
    amountCents?: number,
    reason?: string,
  ) {
    const refundAmount = amountCents || payment.amountCents;

    const [refund] = await this.database.db
      .insert(payments)
      .values({
        tenantId: context.tenantId,
        orderId: payment.orderId,
        provider: "manual",
        method: "manual",
        status: "refunded",
        amountCents: -refundAmount,
        idempotencyKey: `refund-${payment.id}-${Date.now()}`,
        metadata: {
          originalPaymentId: payment.id,
          reason: reason || "Refund",
        },
        confirmedAt: new Date(),
      })
      .returning();

    if (!refund) {
      throw new BadRequestException("Failed to create refund");
    }

    if (payment.orderId) {
      await this.database.db
        .update(orders)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(orders.id, payment.orderId));
    }

    await this.audit(context, {
      branchId: context.branchId,
      action: "payment.refunded",
      entityType: "payment",
      entityId: refund.id,
      metadata: {
        originalPaymentId: payment.id,
        amountCents: refundAmount,
        reason,
      },
    });

    return {
      accepted: true,
      refundId: refund.id,
      amountCents: refundAmount,
    };
  }

  private async refundAsaasPayment(
    context: TenantContext,
    payment: {
      id: string;
      externalId: string | null;
      orderId: string | null;
      amountCents: number;
      method: string;
    },
    amountCents?: number,
    reason?: string,
  ) {
    if (!payment.externalId) {
      throw new BadRequestException("Payment has no external ID for refund");
    }

    const result = await this.asaasProvider.refundPayment({
      tenantId: context.tenantId,
      paymentId: payment.externalId,
      ...(amountCents != null ? { amountCents } : {}),
      reason: reason || "Refund requested",
    });

    if (!result.ok) {
      throw new BadRequestException(`Refund failed: ${result.errorMessage}`);
    }

    const refundAmount = amountCents || payment.amountCents;

    const [refund] = await this.database.db
      .insert(payments)
      .values({
        tenantId: context.tenantId,
        orderId: payment.orderId,
        provider: "asaas",
        method: payment.method,
        status: "refunded",
        amountCents: -refundAmount,
        externalId: result.data?.refundId,
        idempotencyKey: `refund-${payment.id}-${Date.now()}`,
        metadata: {
          originalPaymentId: payment.id,
          asaasRefundId: result.data?.refundId,
          reason: reason || "Refund requested",
        },
        confirmedAt: new Date(),
      })
      .returning();

    if (!refund) {
      throw new BadRequestException("Failed to create refund");
    }

    if (payment.orderId) {
      await this.database.db
        .update(orders)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(orders.id, payment.orderId));
    }

    await this.audit(context, {
      branchId: context.branchId,
      action: "payment.refunded",
      entityType: "payment",
      entityId: refund.id,
      metadata: {
        originalPaymentId: payment.id,
        asaasRefundId: result.data?.refundId,
        amountCents: refundAmount,
        reason,
      },
    });

    return {
      accepted: true,
      refundId: refund.id,
      asaasRefundId: result.data?.refundId,
      amountCents: refundAmount,
    };
  }

  private mapPaymentMethod(method: PaymentMethod): "PIX" | "BOLETO" | "CREDIT_CARD" {
    const mapping: Record<string, "PIX" | "BOLETO" | "CREDIT_CARD"> = {
      pix: "PIX",
      boleto: "BOLETO",
      credit_card: "CREDIT_CARD",
    };

    const mapped = mapping[method];
    if (!mapped) {
      throw new BadRequestException(`Unsupported Asaas payment method: ${method}`);
    }

    return mapped;
  }

  private mapAsaasEventToPaymentStatus(eventName: string) {
    if (eventName === "PAYMENT_CONFIRMED" || eventName === "PAYMENT_RECEIVED") {
      return "confirmed";
    }
    if (eventName === "PAYMENT_OVERDUE" || eventName === "PAYMENT_FAILED") {
      return "failed";
    }
    if (eventName === "PAYMENT_DELETED" || eventName === "PAYMENT_REFUNDED") {
      return "refunded";
    }
    return null;
  }

  private readEventName(payload: Record<string, unknown>) {
    const value = payload.event;
    return typeof value === "string" ? value.toUpperCase() : null;
  }

  private readPaymentId(payload: Record<string, unknown>) {
    const payment = payload.payment;
    if (payment && typeof payment === "object" && !Array.isArray(payment)) {
      const id = (payment as Record<string, unknown>).id;
      if (typeof id === "string") {
        return id;
      }
    }
    return null;
  }

  private async markWebhookProcessed(webhookEventId: string, status: "processed" | "ignored") {
    await this.database.db
      .update(webhookEvents)
      .set({
        status,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(webhookEvents.id, webhookEventId));
  }

  private async audit(
    context: TenantContext,
    input: {
      branchId: string | undefined;
      action: string;
      entityType: string;
      entityId: string | undefined;
      metadata: Record<string, unknown> | undefined;
    },
  ) {
    await this.database.db.insert(auditLogs).values({
      tenantId: context.tenantId,
      branchId: input.branchId,
      userId: context.userId,
      requestId: context.requestId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata ?? {},
    });
  }
}
