import { loadEnv } from "@giromesa/config";
import { Body, Controller, Headers, Inject, Post, UnauthorizedException } from "@nestjs/common";
import { z } from "zod";
import { firstHeader, type HeaderRecord } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit";
import { requirePermission } from "../../common/security";
import { AuthService } from "../auth/auth.service";
import { PaymentsService } from "./payments.service";

const createPaymentSchema = z.object({
  orderId: z.string().min(1),
  method: z.enum([
    "manual",
    "cash",
    "pix",
    "pix_manual",
    "credit_card",
    "debit_card",
    "voucher",
    "courtesy",
    "other",
    "boleto",
  ]),
  amountCents: z.number().int().positive(),
  description: z.string().optional(),
  idempotencyKey: z.string().min(8),
  customer: z
    .object({
      name: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      cpfCnpj: z.string().optional(),
    })
    .optional(),
});

const refundPaymentSchema = z.object({
  paymentId: z.string().min(1),
  amountCents: z.number().int().positive().optional(),
  reason: z.string().optional(),
  idempotencyKey: z.string().min(8).optional(),
});

@Controller("payments")
export class PaymentsController {
  constructor(
    @Inject(PaymentsService) private readonly paymentsService: PaymentsService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(RateLimitService) private readonly rateLimitService: RateLimitService,
  ) {}

  @Post()
  async createPayment(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    const context = await this.context(headers, "payment:create");
    const parsed = createPaymentSchema.parse(body);
    const input: {
      orderId: string;
      method:
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
      amountCents: number;
      description?: string;
      idempotencyKey: string;
      customer?: {
        name?: string;
        email?: string;
        phone?: string;
        cpfCnpj?: string;
      };
    } = {
      orderId: parsed.orderId,
      method: parsed.method,
      amountCents: parsed.amountCents,
      idempotencyKey: parsed.idempotencyKey,
    };

    if (parsed.description !== undefined) {
      input.description = parsed.description;
    }
    if (parsed.customer != null) {
      const customer: {
        name?: string;
        email?: string;
        phone?: string;
        cpfCnpj?: string;
      } = {};
      if (parsed.customer.name !== undefined) customer.name = parsed.customer.name;
      if (parsed.customer.email !== undefined) customer.email = parsed.customer.email;
      if (parsed.customer.phone !== undefined) customer.phone = parsed.customer.phone;
      if (parsed.customer.cpfCnpj !== undefined) customer.cpfCnpj = parsed.customer.cpfCnpj;
      input.customer = customer;
    }

    return this.paymentsService.createPayment(context, input);
  }

  @Post("refund")
  async refundPayment(@Headers() headers: HeaderRecord, @Body() body: unknown) {
    const context = await this.context(headers, "payment:refund");
    const input = refundPaymentSchema.parse(body);
    return this.paymentsService.refundPayment(
      context,
      input.paymentId,
      input.amountCents,
      input.reason,
      input.idempotencyKey,
    );
  }

  @Post("webhooks/asaas")
  async receiveAsaasWebhook(@Body() body: unknown, @Headers() headers: HeaderRecord) {
    const env = loadEnv();
    this.rateLimitService.assertAllowed(headers, {
      namespace: "asaas_payment_webhook",
      limit: 300,
      windowMs: 60_000,
    });

    if (env.NODE_ENV === "production" && !env.ASAAS_WEBHOOK_SECRET) {
      throw new UnauthorizedException("Webhook authentication is not configured");
    }

    const receivedSecret =
      firstHeader(headers["asaas-access-token"]) ??
      firstHeader(headers["x-asaas-webhook-secret"]) ??
      firstHeader(headers["asaas-webhook-secret"]);
    if (env.ASAAS_WEBHOOK_SECRET && receivedSecret !== env.ASAAS_WEBHOOK_SECRET) {
      throw new UnauthorizedException("Invalid webhook authentication");
    }

    const payload =
      body && typeof body === "object" && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};

    const externalEventId =
      firstHeader(headers["x-webhook-id"]) ??
      firstHeader(headers["x-event-id"]) ??
      (typeof payload.id === "string" ? payload.id : `asaas-${Date.now()}`);

    return this.paymentsService.handleWebhook({
      provider: "asaas",
      externalEventId,
      payload,
    });
  }

  private async context(headers: HeaderRecord, permission: string) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }
}
