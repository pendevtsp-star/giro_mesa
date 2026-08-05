import { webhookEvents } from "@giromesa/db";
import type { TenantContext } from "@giromesa/domain";
import { BadRequestException, Inject, Injectable, Optional } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { DatabaseService } from "../database/database.service";
import { OrderRepository } from "../pos/order.repository";
import { PaymentsService as PosPaymentsService } from "../pos/payments.service";

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
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Optional()
    @Inject(PosPaymentsService)
    private readonly posPayments?: PosPaymentsService,
  ) {}

  async createPayment(context: TenantContext, input: CreatePaymentInput) {
    if (input.method === "boleto") {
      throw new BadRequestException(
        "Asaas is reserved for platform subscriptions; operational payments must use a manual or external POS method",
      );
    }
    const method = legacyPaymentMethod(input.method);
    return this.canonicalPayments().registerPayment(context, input.orderId, {
      amountCents: input.amountCents,
      method,
      idempotencyKey: input.idempotencyKey,
      registeredVia: "cashier",
      reference: input.description,
      executionMode: "manual",
    });
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
    return this.canonicalPayments().refundPayment(context, paymentId, {
      ...(amountCents === undefined ? {} : { amountCents }),
      ...(reason === undefined ? {} : { reason }),
      idempotencyKey: idempotencyKey ?? `legacy-refund-${paymentId}-${amountCents ?? "full"}`,
    });
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

  private canonicalPayments() {
    return (
      this.posPayments ?? new PosPaymentsService(this.database, new OrderRepository(this.database))
    );
  }
}

function legacyPaymentMethod(method: PaymentMethod) {
  switch (method) {
    case "cash":
      return "cash" as const;
    case "pix":
    case "pix_manual":
      return "pix_manual" as const;
    case "credit_card":
      return "credit_card" as const;
    case "debit_card":
      return "debit_card" as const;
    case "voucher":
      return "voucher" as const;
    case "courtesy":
      return "courtesy" as const;
    case "manual":
    case "other":
      return "internal_credit" as const;
    default:
      throw new BadRequestException("Unsupported operational payment method");
  }
}
