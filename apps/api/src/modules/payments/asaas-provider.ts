import { loadEnv } from "@giromesa/config";
import type { PaymentProvider, ProviderResult } from "@giromesa/domain";
import { BadRequestException, Injectable, Logger } from "@nestjs/common";

type AsaasPaymentMethod = "PIX" | "BOLETO" | "CREDIT_CARD";

@Injectable()
export class AsaasProvider implements PaymentProvider {
  private readonly logger = new Logger(AsaasProvider.name);

  private getConfig() {
    const env = loadEnv();
    return {
      apiKey: env.ASAAS_API_KEY,
      baseUrl: env.ASAAS_ENV === "production" ? env.ASAAS_PRODUCTION_URL : env.ASAAS_SANDBOX_URL,
      environment: env.ASAAS_ENV,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const config = this.getConfig();

    if (!config.apiKey) {
      throw new BadRequestException("Asaas API key is not configured");
    }

    const response = await fetch(`${config.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": `GiroMesa/0.1 (${config.environment})`,
        access_token: config.apiKey,
      },
      body: body ? JSON.stringify(body) : null,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(
        `Asaas API error: ${method} ${path} returned ${response.status}: ${errorBody.slice(0, 500)}`,
      );
      throw new BadRequestException(
        `Asaas API error: ${response.status} - ${errorBody.slice(0, 200)}`,
      );
    }

    return response.json() as Promise<T>;
  }

  async createCheckout(input: {
    tenantId: string;
    customerId: string;
    amountCents: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<ProviderResult<{ checkoutUrl: string }>> {
    try {
      const response = await this.request<{
        checkoutId: string;
        checkoutUrl: string;
      }>("POST", "/checkouts", {
        billingTypes: ["PIX", "BOLETO", "CREDIT_CARD"],
        chargeTypes: ["ONLINE"],
        externalReference: `gm-pay-${input.tenantId}-${input.customerId}-${Date.now()}`,
        name: input.description,
        items: [
          {
            name: input.description,
            quantity: 1,
            value: Number((input.amountCents / 100).toFixed(2)),
          },
        ],
        callback: {
          successUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          autoRedirect: true,
        },
      });

      return {
        ok: true,
        externalId: response.checkoutId,
        data: { checkoutUrl: response.checkoutUrl },
      };
    } catch (error) {
      this.logger.error("Failed to create Asaas checkout", error);
      return {
        ok: false,
        errorCode: "ASAAS_CHECKOUT_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  }

  async refundPayment(input: {
    tenantId: string;
    paymentId: string;
    amountCents?: number;
    reason: string;
  }): Promise<ProviderResult<{ refundId: string }>> {
    try {
      const response = await this.request<{ id: string }>(
        "POST",
        `/payments/${input.paymentId}/refund`,
        {
          description: input.reason,
          value: input.amountCents ? Number((input.amountCents / 100).toFixed(2)) : undefined,
        },
      );

      return {
        ok: true,
        externalId: response.id,
        data: { refundId: response.id },
      };
    } catch (error) {
      this.logger.error(`Failed to refund Asaas payment ${input.paymentId}`, error);
      return {
        ok: false,
        errorCode: "ASAAS_REFUND_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        retryable: false,
      };
    }
  }

  async createPayment(input: {
    tenantId: string;
    orderId: string;
    amountCents: number;
    method: AsaasPaymentMethod;
    description: string;
    externalReference: string;
    customer?: {
      name?: string;
      email?: string;
      phone?: string;
      cpfCnpj?: string;
    };
    dueDate?: string;
  }): Promise<
    ProviderResult<{
      paymentId: string;
      paymentUrl?: string;
      pixPayload?: string;
      boletoUrl?: string;
    }>
  > {
    try {
      const config = this.getConfig();
      if (!config.apiKey) {
        throw new BadRequestException("Asaas API key is not configured");
      }

      const response = await this.request<{
        id: string;
        invoiceUrl?: string;
        bankSlipUrl?: string;
        transactionReceiptUrl?: string;
        pixCopyAndPaste?: string;
        paymentDate?: string;
        status: string;
      }>("POST", "/payments", {
        billingType: input.method,
        customer: input.customer?.cpfCnpj
          ? await this.findOrCreateCustomer(input.customer)
          : undefined,
        dueDate: input.dueDate || new Date().toISOString().split("T")[0],
        value: Number((input.amountCents / 100).toFixed(2)),
        description: input.description,
        externalReference: input.externalReference,
      });

      const result: {
        paymentId: string;
        paymentUrl?: string;
        pixPayload?: string;
        boletoUrl?: string;
      } = {
        paymentId: response.id,
      };

      const paymentUrl = response.invoiceUrl || response.transactionReceiptUrl;
      if (paymentUrl) {
        result.paymentUrl = paymentUrl;
      }
      if (response.pixCopyAndPaste) {
        result.pixPayload = response.pixCopyAndPaste;
      }
      if (response.bankSlipUrl) {
        result.boletoUrl = response.bankSlipUrl;
      }

      const returnData: {
        ok: true;
        externalId?: string;
        data: {
          paymentId: string;
          paymentUrl?: string;
          pixPayload?: string;
          boletoUrl?: string;
        };
      } = {
        ok: true,
        data: result,
      };

      if (response.id) {
        returnData.externalId = response.id;
      }

      return returnData;
    } catch (error) {
      this.logger.error("Failed to create Asaas payment", error);
      return {
        ok: false,
        errorCode: "ASAAS_PAYMENT_FAILED",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  }

  private async findOrCreateCustomer(customer: {
    name?: string;
    email?: string;
    phone?: string;
    cpfCnpj?: string;
  }): Promise<string> {
    if (!customer.cpfCnpj) {
      throw new BadRequestException("Customer CPF/CNPJ is required for Asaas payments");
    }

    try {
      const existing = await this.request<{ data: Array<{ id: string }> }>(
        "GET",
        `/customers?cpfCnpj=${customer.cpfCnpj}`,
      );

      if (existing.data && existing.data.length > 0 && existing.data[0]) {
        return existing.data[0].id;
      }
    } catch {
      // Customer doesn't exist, create new one
    }

    const newCustomer = await this.request<{ id: string }>("POST", "/customers", {
      name: customer.name || "Cliente",
      email: customer.email,
      phone: customer.phone,
      cpfCnpj: customer.cpfCnpj,
      type: customer.cpfCnpj.length <= 11 ? "FISICA" : "JURIDICA",
    });

    return newCustomer.id;
  }
}
