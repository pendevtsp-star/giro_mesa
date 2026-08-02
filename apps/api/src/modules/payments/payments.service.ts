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

type PaymentMethod =
  | "manual"
  | "cash"
  | "pix"
  | "pix_manual"
  | "credit_card"
  | "debit_card"
  | "voucher"
  | "courtesy"
  | "other"
  | "boleto";

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
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

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

    if (input.method === "boleto") {
      throw new BadRequestException(
        "Asaas is reserved for platform subscriptions; operational payments must use a manual or external POS method",
      );
    }

    return this.createManualPayment(context, order, input);
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
        method: input.method,
        status: "confirmed",
        amountCents: input.amountCents,
        idempotencyKey: input.idempotencyKey,
        metadata: {
          paymentMode: "external",
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
        method: input.method,
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
      await this.markWebhookProcessed(event.id, "ignored");
      return {
        accepted: true,
        duplicate: false,
        webhookEventId: event.id,
        provider: input.provider,
        ignored: true,
        reason: "Asaas webhooks are reserved for platform billing",
      };
    }

    return { accepted: true, duplicate: false, webhookEventId: event.id };
  }

  async refundPayment(
    context: TenantContext,
    paymentId: string,
    amountCents?: number,
    reason?: string,
    idempotencyKey?: string,
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
      return this.refundManualPayment(context, payment, amountCents, reason, idempotencyKey);
    }

    if (payment.provider === "asaas") {
      throw new BadRequestException(
        "Asaas is reserved for platform subscriptions; operational payments cannot be refunded through Asaas",
      );
    }

    throw new BadRequestException(
      `Operational refund provider "${payment.provider}" is not enabled for this account`,
    );
  }

  private async refundManualPayment(
    context: TenantContext,
    payment: { id: string; orderId: string | null; amountCents: number },
    amountCents?: number,
    reason?: string,
    idempotencyKey?: string,
  ) {
    const refundAmount = amountCents || payment.amountCents;
    const refundKey =
      idempotencyKey ?? `refund-${payment.id}-${refundAmount}-${reason?.trim() || "refund"}`;
    const [existingRefund] = await this.database.db
      .select()
      .from(payments)
      .where(and(eq(payments.tenantId, context.tenantId), eq(payments.idempotencyKey, refundKey)))
      .limit(1);

    if (existingRefund) {
      return {
        accepted: true,
        duplicate: true,
        refundId: existingRefund.id,
        amountCents: Math.abs(existingRefund.amountCents),
      };
    }

    const [refund] = await this.database.db
      .insert(payments)
      .values({
        tenantId: context.tenantId,
        orderId: payment.orderId,
        provider: "manual",
        method: "manual",
        status: "refunded",
        amountCents: -refundAmount,
        idempotencyKey: refundKey,
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
      duplicate: false,
      refundId: refund.id,
      amountCents: refundAmount,
    };
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
