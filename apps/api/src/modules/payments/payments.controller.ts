import { Body, Controller, Headers, Inject, Post } from "@nestjs/common";
import { z } from "zod";
import type { HeaderRecord } from "../../common/http";
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

  private async context(headers: HeaderRecord, permission: string) {
    const context = await this.authService.resolveContext(headers);
    requirePermission(context, permission);
    return context;
  }
}
