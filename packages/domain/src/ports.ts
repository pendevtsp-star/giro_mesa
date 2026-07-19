export type TenantContext = {
  tenantId: string;
  branchId?: string;
  userId?: string;
  requestId: string;
  permissions: string[];
  mfaRequired?: boolean;
  billing?: {
    status: "healthy" | "trial_ok" | "trial_ending" | "payment_required" | "access_blocked";
    tenantStatus?: "trial" | "active" | "past_due" | "suspended" | "canceled" | null;
    currentPeriodEndsAt?: string | null;
    trialDaysRemaining?: number | null;
  };
};

export type ProviderResult<T> = {
  ok: boolean;
  externalId?: string;
  data?: T;
  errorCode?: string;
  errorMessage?: string;
  retryable?: boolean;
};

export interface PaymentProvider {
  createCheckout(input: {
    tenantId: string;
    customerId: string;
    amountCents: number;
    description: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<ProviderResult<{ checkoutUrl: string }>>;

  refundPayment(input: {
    tenantId: string;
    paymentId: string;
    amountCents?: number;
    reason: string;
  }): Promise<ProviderResult<{ refundId: string }>>;
}

export interface FiscalProvider {
  issueConsumerInvoice(input: {
    tenantId: string;
    orderId: string;
    fiscalDocumentId: string;
    model?: "nfce" | "nfe" | "nfse";
    environment?: "homologation" | "production";
    number?: number | null;
    payload?: Record<string, unknown>;
  }): Promise<ProviderResult<{ accessKey?: string; xmlUrl?: string; danfeUrl?: string }>>;

  cancelDocument(input: {
    tenantId: string;
    fiscalDocumentId: string;
    reason: string;
  }): Promise<ProviderResult<{ canceledAt: string }>>;
}

export interface PrintProvider {
  renderKitchenTicket(input: {
    tenantName?: string;
    stationName: string;
    orderCode: string;
    orderChannel: string;
    tableCode?: string;
    items: Array<{
      name: string;
      quantity: string;
      notes?: string | null;
    }>;
    createdAt: string;
    copies: number;
    charactersPerLine: number;
  }): ProviderResult<{ renderedText: string }>;
}

export interface WhatsAppProvider {
  sendTemplate(input: {
    tenantId: string;
    to: string;
    templateName: string;
    locale: string;
    variables: Record<string, string>;
  }): Promise<ProviderResult<{ messageId: string }>>;
}

export interface EmailProvider {
  send(input: {
    tenantId?: string;
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<ProviderResult<{ messageId: string }>>;
}

export interface StorageProvider {
  createPresignedUpload(input: {
    tenantId: string;
    key: string;
    contentType: string;
  }): Promise<ProviderResult<{ uploadUrl: string; publicUrl?: string }>>;
}

export interface MarketplaceProvider {
  syncOrders(input: {
    tenantId: string;
    accountId: string;
  }): Promise<ProviderResult<{ count: number }>>;
}

export interface ClubWhiskyProvider {
  publishEvent(input: {
    tenantId: string;
    branchId?: string;
    topic:
      | "product.updated"
      | "stock.updated"
      | "order.closed"
      | "payment.confirmed"
      | "customer.updated"
      | "club.stock_movement.created";
    payload: Record<string, unknown>;
    idempotencyKey: string;
  }): Promise<ProviderResult<{ queued: boolean }>>;

  verifyCustomerLink(input: {
    tenantId: string;
    customerId: string;
    externalCustomerId: string;
  }): Promise<ProviderResult<{ linked: boolean }>>;
}

export interface AuditLogger {
  record(event: {
    tenantId?: string;
    branchId?: string;
    userId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
    requestId: string;
  }): Promise<void>;
}
