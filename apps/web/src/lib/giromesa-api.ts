const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export const apiBaseUrl =
  configuredApiBaseUrl ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3333");

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

export type TenantSession = {
  tenantId: string;
  branchId?: string;
  userId?: string;
  requestId: string;
  permissions: string[];
  mfaRequired?: boolean;
};

export type TenantBranding = {
  displayName: string;
  logoUrl: string | null;
  themeMode: "light" | "dark" | "system";
  accentPreset: "emerald" | "blue" | "amber" | "rose" | "violet";
};

export type Product = {
  id: string;
  name: string;
  description: string | null;
  sku?: string | null;
  categoryId: string | null;
  priceCents: number;
  costCents: number;
  imageUrl?: string | null;
  isActive?: boolean;
  isAvailable: boolean;
  isClubEligible?: boolean;
  bottleVolumeMl?: number | null;
  defaultDoseMl?: number;
  spiritType?: string | null;
  channels: string[];
  fiscalNcm?: string | null;
  fiscalCfop?: string | null;
  fiscalCest?: string | null;
  fiscalOrigin?: string | null;
  fiscalCst?: string | null;
  fiscalCsosn?: string | null;
};

export type Category = {
  id: string;
  branchId: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type DiningTable = {
  id: string;
  branchId: string;
  code: string;
  name: string;
  seats: number;
  status: string;
};

export type KdsTicket = {
  id: string;
  branchId: string;
  stationName: string;
  orderId: string;
  orderChannel: string;
  orderStatus: string;
  status: string;
  priority: number;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type KdsStation = {
  id: string;
  branchId: string;
  name: string;
  type: string;
  isActive: boolean;
};

export type OpenOrderResponse = {
  id: string;
  branchId: string;
  tableId: string | null;
  customerId?: string | null;
  channel: string;
  status: string;
  totalCents: number;
  audit: string;
};

export type OrderItemResponse = {
  id: string;
  orderId: string;
  productId: string;
  nameSnapshot: string;
  quantity: string;
  unitPriceCents: number;
  totalCents: number;
  audit: string;
};

export type SendToKitchenResponse = {
  orderId: string;
  status: string;
  ticketsCreated: KdsTicket[];
  audit: string;
};

export type QrPendingOrder = {
  id: string;
  branchId: string;
  tableId: string | null;
  tableCode: string | null;
  tableName: string | null;
  status: string;
  subtotalCents: number;
  totalCents: number;
  openedAt: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    orderId: string;
    nameSnapshot: string;
    quantity: string;
    totalCents: number;
    notes: string | null;
  }>;
};

export type TableHistoryEvent = {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
};

export type Role = {
  id: string;
  code: string;
  name: string;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
};

export type TenantUser = {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  mfaEnabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Array<{
    id: string;
    code: string;
    name: string;
    branchId: string | null;
  }>;
};

export type Invitation = {
  id: string;
  email: string;
  roleId: string | null;
  roleCode: string | null;
  roleName: string | null;
  expiresAt: string;
  acceptedAt?: string | null;
  createdAt?: string;
  status: string;
  delivery?: string;
  acceptUrl?: string;
  tokenReturnedOnce?: string;
};

export type LinkedOauthAccount = {
  id: string;
  provider: string;
  email: string | null;
  lastLoginAt: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  branchId: string | null;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type OutboxEvent = {
  id: string;
  topic: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
  availableAt: string;
  processedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentResponse = {
  id: string;
  amountCents: number;
  method: string;
  orderStatus: "partially_paid" | "paid";
  audit: string;
};

export type OrderPayment = {
  id: string;
  amountCents: number;
  method: string;
  status: string;
  confirmedAt: string | null;
  createdAt: string;
  audit: string;
};

export type CloseOrderResponse = {
  orderId: string;
  status: string;
  fiscalStatus: string;
  fiscalDocumentId?: string;
  fiscalError?: string;
  audit: string;
};

export type FiscalDocument = {
  id: string;
  branchId: string | null;
  orderId: string | null;
  provider: string;
  model: string;
  environment: string;
  series: string | null;
  number: number | null;
  status: string;
  accessKey: string | null;
  xmlUrl: string | null;
  danfeUrl: string | null;
  errorMessage: string | null;
  issuedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  orderTotalCents: number | null;
};

export type InventorySummaryItem = {
  id: string;
  name: string;
  unit: string;
  averageCostCents: number;
  minQuantity: string;
  allowNegative: boolean;
  quantity: string;
};

export type InventoryAlert = Omit<InventorySummaryItem, "quantity" | "minQuantity"> & {
  quantity: number;
  minQuantity: number;
  shortage: number;
  status: "negative" | "below_minimum" | "ok";
};

export type CashSessionSummary = {
  branchId: string;
  session: {
    id: string;
    status: string;
    openingAmountCents: number;
    expectedAmountCents: number;
    countedAmountCents: number | null;
    differenceCents: number | null;
    openedAt: string;
    closedAt: string | null;
  } | null;
  payments: {
    totalCents: number;
    count: number;
    byMethod: Record<string, number>;
    averageTicketCents?: number;
    mix?: Array<{
      method: string;
      totalCents: number;
      count: number;
      sharePercent: number;
    }>;
  };
  openOrders: {
    count: number;
    totalCents: number;
  };
};

export type FinancialReport = {
  branchId: string;
  period: "today" | "week" | "month" | "shift" | "custom";
  dateFrom: string;
  dateTo?: string | null;
  payments: {
    totalCents: number;
    count: number;
    byMethod: Record<string, number>;
    averageTicketCents?: number;
    mix?: Array<{
      method: string;
      totalCents: number;
      count: number;
      sharePercent: number;
    }>;
  };
  channels?: Array<{
    channel: string;
    totalCents: number;
    count: number;
    sharePercent: number;
  }>;
  operators?: Array<{
    operatorId: string;
    operatorName: string;
    paymentsTotalCents: number;
    paymentsCount: number;
    cashSessionCount: number;
  }>;
  cashSessions?: Array<{
    id: string;
    operatorId: string;
    operatorName: string;
    status: string;
    openingAmountCents: number;
    expectedAmountCents: number;
    countedAmountCents: number | null;
    differenceCents: number | null;
    paymentsTotalCents: number;
    paymentsCount: number;
    openedAt: string;
    closedAt: string | null;
  }>;
  cashManagement?: {
    sessionsOpen: number;
    sessionsClosed: number;
    balancedSessions: number;
    divergentSessions: number;
    totalDifferenceCents: number;
    averageDifferenceCents: number;
    conferenceRatePercent: number;
  };
  openOrders: {
    count: number;
    totalCents: number;
  };
  dre: {
    grossRevenueCents: number;
    estimatedCostsCents: number;
    actualRecipeCostsCents?: number;
    operationalMarginCents: number;
    operationalMarginPercent?: number;
  };
  commercial?: {
    averageTicketCents: number;
    openOrdersExposureCents: number;
    receivedVsOpenRatio: number | null;
    previousTotalCents: number;
    previousCount: number;
    deltaCents: number;
    deltaPercent: number | null;
    previousDateFrom: string;
    previousDateTo?: string | null;
    closeReadiness?: "ready" | "monitor" | "attention";
  };
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  birthday: string | null;
  marketingOptIn: boolean;
  lgpdConsentAt: string | null;
  createdAt: string;
};

export type CustomerOrderHistory = {
  id: string;
  status: string;
  channel: string;
  totalCents: number;
  openedAt: string | null;
  closedAt: string | null;
};

export type InventoryMovement = {
  id: string;
  inventoryItemId: string;
  inventoryItemName: string;
  type: "purchase_receipt" | "loss" | "inventory_count" | "manual_adjustment";
  quantity: string;
  unitCostCents: number;
  reason: string | null;
  createdAt: string;
};

export type Supplier = { id: string; name: string; document: string | null; contactName: string | null; phone: string | null; email: string | null; isActive: boolean; };
export type ModifierGroup = { id: string; productId: string; name: string; minChoices: number; maxChoices: number; isRequired: boolean; options: ModifierOption[]; };
export type ModifierOption = { id: string; groupId: string; name: string; priceDeltaCents: number; costDeltaCents: number; isAvailable: boolean; };

export type ProductSalesReport = {
  branchId: string;
  period: FinancialReport["period"];
  dateFrom: string;
  dateTo: string | null;
  totalCents: number;
  products: Array<{
    productId: string;
    name: string;
    quantity: number;
    revenueCents: number;
    averageUnitCents: number;
    orderCount: number;
    sharePercent: number;
  }>;
};

export type PlatformTenant = {
  id: string;
  name: string;
  slug: string;
  document: string | null;
  status: "trial" | "active" | "past_due" | "suspended" | "canceled";
  createdAt: string;
  planCode: string | null;
  planName: string | null;
  priceCents: number | null;
  subscriptionStatus: string | null;
  currentPeriodEndsAt: string | null;
  branchCount: number;
  userCount: number;
  health: number;
  nextAction: string;
  trialDaysRemaining: number | null;
  billingStatus: "healthy" | "trial_ok" | "trial_ending" | "payment_required" | "access_blocked";
  onboardingChecklist: Array<{ key: string; label: string; done: boolean }>;
  asaas: {
    checkoutReady: boolean;
    providerSubscriptionId: string | null;
    nextStep: string;
  };
  support?: {
    priority: "normal" | "high";
    status: "queued" | "in_progress" | "waiting_customer" | "resolved";
    relationshipOwnerName: string;
    nextFollowUpAt: string | null;
    slaTier: "standard" | "priority" | "critical";
    queueLabel: string;
    alertType?: "past_due" | "trial_ending" | "high_priority" | "follow_up" | "none";
  };
};

export type PlatformTenantCreateResponse = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  branch: {
    id: string;
    name: string;
  };
  owner: {
    id: string;
    name: string;
    email: string;
  };
  subscription: unknown;
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    acceptUrl: string;
    delivery: string;
    tokenReturnedOnce: string;
  } | null;
  temporaryPassword: string;
  nextStep: string;
};

export type PlatformTenantDetail = PlatformTenant & {
  branches: Array<{ id: string; name: string; isActive: boolean }>;
  users: Array<{ id: string; name: string; email: string; isActive: boolean }>;
  timeline: Array<{
    id: string;
    action: string;
    entityType: string;
    metadata: Record<string, unknown>;
    createdAt: string;
  }>;
  support: {
    priority: "normal" | "high";
    status: "queued" | "in_progress" | "waiting_customer" | "resolved";
    commercialNotes: string;
    relationshipOwnerName: string;
    relationshipOwnerEmail: string;
    slaTier: "standard" | "priority" | "critical";
    nextFollowUpAt: string | null;
    contactHistory: Array<{
      id: string;
      summary: string;
      createdAt: string;
      createdBy: string | null;
    }>;
  };
};

export type PlatformTenantSupportResponse = {
  tenantId: string;
  support: {
    priority: "normal" | "high";
    status: "queued" | "in_progress" | "waiting_customer" | "resolved";
    commercialNotes: string;
    relationshipOwnerName: string;
    relationshipOwnerEmail: string;
    slaTier: "standard" | "priority" | "critical";
    nextFollowUpAt: string | null;
    contactHistory: Array<{
      id: string;
      summary: string;
      createdAt: string;
      createdBy: string | null;
    }>;
  };
};

export type PlatformTenantCommunicationResponse = {
  tenantId: string;
  type: "trial_ending" | "past_due" | "support_follow_up";
  recipientEmail: string;
  provider: string;
  queued: boolean;
};

export type PlatformCommunicationEvent = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  type: "trial_ending" | "past_due" | "support_follow_up";
  recipientEmail: string;
  provider: string;
  messageId: string;
  createdAt: string;
};

export type PlatformCommercialSummary = {
  overview: {
    totalTenants: number;
    active: number;
    trials: number;
    pastDue: number;
    suspended: number;
    risks: number;
    supportQueue: number;
    trialEnding: number;
    followUpsDue: number;
    overdueFollowUps: number;
    trialsWithoutOwner: number;
    staleTrials7d: number;
    highTouchAccounts: number;
    mrrActiveCents: number;
    pastDueMrrCents: number;
    communicationsLast7Days: number;
  };
  pipeline: {
    active: number;
    trial: number;
    pastDue: number;
    onboardingRisk: number;
  };
  support: {
    openCount: number;
    highPriorityCount: number;
    countsByStatus: {
      queued: number;
      inProgress: number;
      waitingCustomer: number;
      resolved: number;
    };
    items: Array<{
      tenantId: string;
      tenantName: string;
      tenantSlug: string;
      priority: "normal" | "high";
      status: "queued" | "in_progress" | "waiting_customer" | "resolved";
      slaTier: "standard" | "priority" | "critical";
      queueLabel: string;
      relationshipOwnerName: string;
      alertType: "past_due" | "trial_ending" | "high_priority" | "follow_up" | "none";
    }>;
  };
  agenda: {
    countsByAlertType: {
      pastDue: number;
      trialEnding: number;
      highPriority: number;
      followUp: number;
    };
    items: Array<{
      tenantId: string;
      tenantName: string;
      tenantSlug: string;
      status: PlatformTenant["status"];
      queueLabel: string;
      nextAction: string;
      alertType: "past_due" | "trial_ending" | "high_priority" | "follow_up" | "none";
    }>;
  };
  watchlist: {
    overdueFollowUpsCount: number;
    trialsWithoutOwnerCount: number;
    staleTrials7dCount: number;
  };
  communications: {
    recent: PlatformCommunicationEvent[];
    countsByType: {
      trialEnding: number;
      pastDue: number;
      supportFollowUp: number;
    };
  };
};

export type PublicMenuResponse = {
  tenant: { id: string; name: string; slug: string; branding?: TenantBranding };
  categories: Category[];
  products: Array<
    Pick<
      Product,
      | "id"
      | "name"
      | "description"
      | "categoryId"
      | "priceCents"
      | "imageUrl"
      | "isAvailable"
      | "channels"
      | "isClubEligible"
      | "bottleVolumeMl"
      | "defaultDoseMl"
      | "spiritType"
    >
  >;
};

export type PublicQrResponse = {
  tenant: { id: string; name: string; slug: string; branding?: TenantBranding };
  table: { id: string; branchId: string; code: string; name: string; status: string };
};

export type PrinterDevice = {
  id: string;
  branchId: string;
  name: string;
  role: string;
  connectionType: string;
  address: string | null;
  port: number | null;
  paperWidth: number;
  charactersPerLine: number;
  isActive: boolean;
  config?: Record<string, unknown>;
};

export type PrintRoute = {
  id: string;
  branchId: string;
  name: string;
  trigger: string;
  targetType: string;
  stationId: string | null;
  stationName: string | null;
  printerDeviceId: string;
  printerName: string;
  copies: number;
  isActive: boolean;
  config?: Record<string, unknown>;
};

export type PrintJob = {
  id: string;
  branchId: string;
  printerDeviceId: string | null;
  printerName: string | null;
  orderId: string | null;
  kdsTicketId: string | null;
  kind: string;
  status: string;
  copies: number;
  attemptCount: number;
  maxAttempts: number;
  renderedText: string;
  errorMessage: string | null;
  printedAt: string | null;
  createdAt: string;
  payload: Record<string, unknown>;
  printerAddress?: string | null;
  printerPort?: number | null;
  printerConfig?: Record<string, unknown> | null;
};

export type PrinterConnectorConfig = {
  id?: string;
  provider: "local_printer_connector";
  status: string;
  branchId: string | null;
  scopes: string[];
  apiKeyLastFour?: string | null;
  apiKeyCreatedAt?: string | null;
  hasApiKey: boolean;
  lastSyncAt?: string | null;
  heartbeat?: Record<string, unknown>;
  online?: boolean;
};

export type PrinterConnectorConfigureResponse = PrinterConnectorConfig & {
  apiKey?: string;
  apiKeyReturnedOnce: boolean;
};

export type ClubWhiskyIntegrationConfig = {
  id?: string;
  provider: "club_whisky";
  status: string;
  branchId?: string | null;
  scopes: string[];
  webhookUrl?: string | null;
  apiKeyLastFour?: string | null;
  apiKeyCreatedAt?: string | null;
  hasApiKey: boolean;
  lastSyncAt?: string | null;
};

export type ClubWhiskyConfigureResponse = ClubWhiskyIntegrationConfig & {
  apiKey?: string;
  apiKeyReturnedOnce: boolean;
};

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(status: number, payload: unknown) {
    super(readErrorMessage(payload, status));
    this.status = status;
    this.payload = payload;
  }
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    credentials: "include",
  };

  if (options.body !== undefined) {
    requestInit.headers = {
      "content-type": "application/json",
    };
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(`${apiBaseUrl}${path}`, requestInit);

  const payload = await readPayload(response);
  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }

  return payload as T;
}

export async function login(email: string, password: string, mfaCode?: string) {
  return apiRequest<{
    user: {
      id: string;
      tenantId: string | null;
      email: string;
      name: string;
      isPlatformUser: boolean;
      permissions: string[];
    };
    session: {
      tokenType: string;
      expiresInSeconds: number;
      mfaRequired: boolean;
    };
  }>("/api/v1/auth/login", {
    method: "POST",
    body: { email, password, ...(mfaCode ? { mfaCode } : {}) },
  });
}

export function completeGoogleMfa(input: { challengeToken: string; code: string }) {
  return apiRequest<{
    redirectTo: string;
    session: {
      tokenType: string;
      expiresInSeconds: number;
    };
  }>("/api/v1/auth/google/mfa/complete", {
    method: "POST",
    body: input,
  });
}

export async function listLinkedOauthAccounts() {
  const result = await apiRequest<{ data: LinkedOauthAccount[] }>("/api/v1/auth/oauth/accounts");
  return result.data;
}

export function unlinkGoogleAccount() {
  return apiRequest<{ unlinked: boolean }>("/api/v1/auth/oauth/google/unlink", {
    method: "POST",
  });
}

export async function getSession() {
  const result = await apiRequest<{ context: TenantSession }>("/api/v1/auth/me");
  return result.context;
}

export function getTenantBranding() {
  return apiRequest<TenantBranding>("/api/v1/tenants/branding");
}

export function updateTenantBranding(input: Partial<TenantBranding>) {
  return apiRequest<TenantBranding>("/api/v1/tenants/branding", {
    method: "PATCH",
    body: input,
  });
}

export function uploadTenantLogo(input: { fileName: string; dataUrl: string }) {
  return apiRequest<{ logoUrl: string; branding: TenantBranding }>(
    "/api/v1/tenants/branding/logo",
    {
      method: "POST",
      body: input,
    },
  );
}

export function removeTenantLogo() {
  return apiRequest<{ removed: boolean; branding: TenantBranding }>(
    "/api/v1/tenants/branding/logo",
    {
      method: "DELETE",
    },
  );
}

export async function listRoles() {
  const result = await apiRequest<{ data: Role[] }>("/api/v1/auth/roles");
  return result.data;
}

export async function listUsers() {
  const result = await apiRequest<{ data: TenantUser[] }>("/api/v1/auth/users");
  return result.data;
}

export async function listInvitations() {
  const result = await apiRequest<{ data: Invitation[] }>("/api/v1/auth/invitations");
  return result.data;
}

export function createInvitation(input: { email: string; roleId?: string; branchId?: string }) {
  return apiRequest<Invitation>("/api/v1/auth/invitations", {
    method: "POST",
    body: input,
  });
}

export function resendInvitation(invitationId: string) {
  return apiRequest<Invitation>(`/api/v1/auth/invitations/${invitationId}/resend`, {
    method: "POST",
  });
}

export function cancelInvitation(invitationId: string) {
  return apiRequest<Invitation>(`/api/v1/auth/invitations/${invitationId}/cancel`, {
    method: "POST",
  });
}

export function acceptInvitation(input: { token: string; name?: string; password: string }) {
  return apiRequest<{
    user: {
      id: string;
      tenantId: string | null;
      email: string;
      name: string;
      permissions: string[];
    };
    session: {
      tokenType: string;
      expiresInSeconds: number;
      mfaRequired: boolean;
    };
  }>("/api/v1/auth/invitations/accept", {
    method: "POST",
    body: input,
  });
}

export function assignUserRole(userId: string, input: { roleId: string; branchId?: string }) {
  return apiRequest<{ userId: string; email: string; name: string; role: Role }>(
    `/api/v1/auth/users/${userId}/roles`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return apiRequest<{ changed: boolean }>("/api/v1/auth/password/change", {
    method: "POST",
    body: input,
  });
}

export function requestPasswordReset(email: string) {
  return apiRequest<{
    requested: boolean;
    delivery: string;
    resetUrl?: string;
    tokenReturnedOnce?: string;
  }>("/api/v1/auth/password/reset/request", {
    method: "POST",
    body: { email },
  });
}

export function resetPassword(input: { token: string; password: string }) {
  return apiRequest<{ reset: boolean }>("/api/v1/auth/password/reset/complete", {
    method: "POST",
    body: input,
  });
}

export function configureMfa(enabled: boolean) {
  return apiRequest<{ enabled: boolean; provider: "totp" }>("/api/v1/auth/mfa/configure", {
    method: "POST",
    body: { enabled },
  });
}

export function setupMfa() {
  return apiRequest<{
    enabled: boolean;
    provider: "totp";
    manualKey: string;
    otpauthUrl: string;
    qrCodeDataUrl: string;
  }>("/api/v1/auth/mfa/setup", {
    method: "POST",
  });
}

export function verifyMfa(code: string) {
  return apiRequest<{ enabled: boolean; provider: "totp"; recoveryCodes: string[] }>(
    "/api/v1/auth/mfa/verify",
    {
      method: "POST",
      body: { code },
    },
  );
}

export function regenerateMfaRecoveryCodes(code: string) {
  return apiRequest<{ recoveryCodes: string[] }>("/api/v1/auth/mfa/recovery-codes/regenerate", {
    method: "POST",
    body: { code },
  });
}

export function updateRole(roleId: string, input: { name?: string; permissions?: string[] }) {
  return apiRequest<Role>(`/api/v1/auth/roles/${roleId}`, {
    method: "PATCH",
    body: input,
  });
}

export async function listProducts() {
  const result = await apiRequest<{ data: Product[] }>("/api/v1/catalog/products");
  return result.data;
}

export async function listCategories() {
  const result = await apiRequest<{ data: Category[] }>("/api/v1/catalog/categories");
  return result.data;
}

export function createCategory(input: { branchId?: string; name: string; sortOrder?: number }) {
  return apiRequest<Category>("/api/v1/catalog/categories", {
    method: "POST",
    body: input,
  });
}

export function createProduct(input: {
  categoryId?: string;
  name: string;
  description?: string;
  sku?: string;
  priceCents: number;
  costCents?: number;
  imageUrl?: string;
  isAvailable?: boolean;
  isClubEligible?: boolean;
  bottleVolumeMl?: number;
  defaultDoseMl?: number;
  spiritType?: string;
  channels?: string[];
  fiscalNcm?: string;
  fiscalCfop?: string;
  fiscalCest?: string;
  fiscalOrigin?: string;
  fiscalCst?: string;
  fiscalCsosn?: string;
}) {
  return apiRequest<Product>("/api/v1/catalog/products", {
    method: "POST",
    body: input,
  });
}

export function updateProduct(
  productId: string,
  input: Partial<Parameters<typeof createProduct>[0]>,
) {
  return apiRequest<Product>(`/api/v1/catalog/products/${productId}`, {
    method: "PATCH",
    body: input,
  });
}

export function getPublicMenu(tenantSlug = "bar-aurora-demo") {
  return apiRequest<PublicMenuResponse>(`/api/v1/catalog/public/menu/${tenantSlug}`);
}

export function getPublicQr(tableCode: string, tenantSlug = "bar-aurora-demo") {
  return apiRequest<PublicQrResponse>(
    `/api/v1/catalog/public/qr/${encodeURIComponent(tableCode)}?tenantSlug=${encodeURIComponent(
      tenantSlug,
    )}`,
  );
}

export function createPublicQrOrder(
  tableCode: string,
  input: {
    tenantSlug?: string;
    items: { productId: string; quantity: number; notes?: string }[];
  },
) {
  return apiRequest<{ orderId: string; status: string }>(
    `/api/v1/catalog/public/qr/${encodeURIComponent(tableCode)}/orders`,
    {
      method: "POST",
      body: { tenantSlug: "bar-aurora-demo", ...input },
    },
  );
}

export function requestPublicQrAction(
  tableCode: string,
  action: "call-waiter" | "pre-bill",
  input: { tenantSlug?: string; message?: string } = {},
) {
  return apiRequest<{ ok: boolean; action: string }>(
    `/api/v1/catalog/public/qr/${encodeURIComponent(tableCode)}/${action}`,
    {
      method: "POST",
      body: { tenantSlug: "bar-aurora-demo", ...input },
    },
  );
}

export async function listTables(branchId: string) {
  const result = await apiRequest<{ data: DiningTable[] }>(
    `/api/v1/pos/tables?branchId=${encodeURIComponent(branchId)}`,
  );
  return result.data;
}

export async function listQrPendingOrders(branchId: string) {
  const result = await apiRequest<{ data: QrPendingOrder[] }>(
    `/api/v1/pos/orders/qr-pending?branchId=${encodeURIComponent(branchId)}`,
  );
  return result.data;
}

export function buildPosEventsUrl(branchId: string) {
  return `${apiBaseUrl}/api/v1/pos/events?branchId=${encodeURIComponent(branchId)}`;
}

export async function listKdsTickets() {
  const result = await apiRequest<{ data: KdsTicket[] }>("/api/v1/kds/tickets");
  return result.data;
}

export async function listKdsStations() {
  const result = await apiRequest<{ data: KdsStation[] }>("/api/v1/kds/stations");
  return result.data;
}
export function createDiningTable(input: { branchId: string; code: string; name: string; seats: number }) { return apiRequest<DiningTable>("/api/v1/pos/tables", { method: "POST", body: input }); }

export function getFloorPlan(branchId: string) { return apiRequest<{ id: string | null; branchId: string; name: string; layout: Record<string, { x: number; y: number }> }>(`/api/v1/pos/floor-plan?branchId=${encodeURIComponent(branchId)}`); }
export function saveFloorPlan(branchId: string, layout: Record<string, { x: number; y: number }>) { return apiRequest<Record<string, unknown>>("/api/v1/pos/floor-plan", { method: "PATCH", body: { branchId, layout } }); }

export async function listProductModifiers(productId: string) {
  const result = await apiRequest<{ data: ModifierGroup[] }>(`/api/v1/catalog/products/${productId}/modifiers`);
  return result.data;
}
export function createModifierGroup(input: { productId: string; name: string; minChoices?: number; maxChoices?: number; isRequired?: boolean }) { return apiRequest<ModifierGroup>("/api/v1/catalog/modifier-groups", { method: "POST", body: input }); }
export function createModifierOption(groupId: string, input: { name: string; priceDeltaCents?: number; costDeltaCents?: number; isAvailable?: boolean }) { return apiRequest<ModifierOption>(`/api/v1/catalog/modifier-groups/${groupId}/options`, { method: "POST", body: input }); }

export async function listCustomers(search?: string) {
  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : "";
  const result = await apiRequest<{ data: Customer[] }>(`/api/v1/customers${query}`);
  return result.data;
}

export function createCustomer(input: {
  name: string;
  phone?: string;
  email?: string;
  birthday?: string;
  marketingOptIn?: boolean;
}) {
  return apiRequest<Customer>("/api/v1/customers", { method: "POST", body: input });
}

export async function getCustomerHistory(customerId: string) {
  const result = await apiRequest<{ data: CustomerOrderHistory[] }>(
    `/api/v1/customers/${customerId}/history`,
  );
  return result.data;
}

export function updateKdsTicket(ticketId: string, status: "preparing" | "ready" | "served") {
  return apiRequest<KdsTicket & { audit: string }>(`/api/v1/kds/tickets/${ticketId}`, {
    method: "PATCH",
    body: { status },
  });
}

export function openOrder(branchId: string, tableId?: string, peopleCount = 2, customerId?: string) {
  return apiRequest<OpenOrderResponse>("/api/v1/pos/orders/open", {
    method: "POST",
    body: {
      channel: tableId ? "table" : "counter",
      branchId,
      tableId,
      ...(customerId ? { customerId } : {}),
      peopleCount,
    },
  });
}

export function addOrderItem(orderId: string, productId: string, modifiers: Array<{ optionId: string }> = []) {
  return apiRequest<OrderItemResponse>(`/api/v1/pos/orders/${orderId}/items`, {
    method: "POST",
    body: {
      productId,
      quantity: 1,
      notes: "Lancado pelo painel demo",
      modifiers,
    },
  });
}

export function sendOrderToKitchen(orderId: string) {
  return apiRequest<SendToKitchenResponse>(`/api/v1/pos/orders/${orderId}/send-to-kitchen`, {
    method: "POST",
  });
}

export function updateQrOrderItem(
  orderId: string,
  itemId: string,
  input: { quantity: number; notes?: string },
) {
  return apiRequest<{
    audit: string;
    order: QrPendingOrder;
    item: QrPendingOrder["items"][number];
  }>(`/api/v1/pos/orders/${orderId}/qr-items/${itemId}`, {
    method: "PATCH",
    body: input,
  });
}

export function cancelQrOrderItem(orderId: string, itemId: string, reason: string) {
  return apiRequest<{
    audit: string;
    order: QrPendingOrder;
    item: QrPendingOrder["items"][number];
  }>(`/api/v1/pos/orders/${orderId}/qr-items/${itemId}/cancel`, {
    method: "POST",
    body: { reason },
  });
}

export function rejectQrOrder(orderId: string, reason: string) {
  return apiRequest<{ audit: string; order: QrPendingOrder }>(
    `/api/v1/pos/orders/${orderId}/qr-reject`,
    {
      method: "POST",
      body: { reason },
    },
  );
}

export async function listTableHistory(tableId: string, limit = 24) {
  const result = await apiRequest<{ data: TableHistoryEvent[] }>(
    `/api/v1/pos/tables/${tableId}/history?limit=${encodeURIComponent(String(limit))}`,
  );
  return result.data;
}

export function registerManualPayment(
  orderId: string,
  amountCents: number,
  input?: {
    method?: string;
    idempotencyKey?: string;
  },
) {
  return apiRequest<PaymentResponse>(`/api/v1/pos/orders/${orderId}/payments`, {
    method: "POST",
    body: {
      amountCents,
      method: input?.method ?? "pix_manual",
      idempotencyKey:
        input?.idempotencyKey ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
}

export async function listOrderPayments(orderId: string) {
  const result = await apiRequest<{ data: OrderPayment[] }>(
    `/api/v1/pos/orders/${orderId}/payments`,
  );
  return result.data;
}

export function closeOrder(orderId: string) {
  return apiRequest<CloseOrderResponse>(`/api/v1/pos/orders/${orderId}/close`, {
    method: "POST",
  });
}

export function printBillPreview(orderId: string) {
  return apiRequest<PrintJob>(`/api/v1/pos/orders/${orderId}/print-bill-preview`, {
    method: "POST",
  });
}

export function getCashSessionSummary(branchId: string) {
  return apiRequest<CashSessionSummary>(
    `/api/v1/pos/cash-sessions/summary?branchId=${encodeURIComponent(branchId)}`,
  );
}

export function printCashSessionSummary(cashSessionId: string) {
  return apiRequest<PrintJob>(`/api/v1/pos/cash-sessions/${cashSessionId}/print-summary`, {
    method: "POST",
  });
}

export function closeCashSession(cashSessionId: string, countedAmountCents: number) {
  return apiRequest<{
    id: string;
    status: string;
    openingAmountCents: number;
    expectedAmountCents: number;
    countedAmountCents: number | null;
    differenceCents: number;
    closedAt: string | null;
    audit: string;
  }>(`/api/v1/pos/cash-sessions/${cashSessionId}/close`, {
    method: "POST",
    body: { countedAmountCents },
  });
}

export function printPaymentReceipt(orderId: string) {
  return apiRequest<PrintJob>(`/api/v1/pos/orders/${orderId}/print-payment-receipt`, {
    method: "POST",
  });
}

export function getFinancialReport(input: {
  branchId?: string;
  period?: FinancialReport["period"];
  dateFrom?: string;
  dateTo?: string;
  cashSessionId?: string;
  paymentMethod?: string;
  variance?: "all" | "divergent" | "balanced";
  cashSessionStatus?: "open" | "closed" | "reconciled" | "disputed";
}) {
  const params = new URLSearchParams();
  if (input.branchId) {
    params.set("branchId", input.branchId);
  }
  if (input.period) {
    params.set("period", input.period);
  }
  if (input.dateFrom) {
    params.set("dateFrom", input.dateFrom);
  }
  if (input.dateTo) {
    params.set("dateTo", input.dateTo);
  }
  if (input.cashSessionId) {
    params.set("cashSessionId", input.cashSessionId);
  }
  if (input.paymentMethod) {
    params.set("paymentMethod", input.paymentMethod);
  }
  if (input.variance) {
    params.set("variance", input.variance);
  }
  if (input.cashSessionStatus) {
    params.set("cashSessionStatus", input.cashSessionStatus);
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return apiRequest<FinancialReport>(`/api/v1/reports/financial${query}`);
}

export function assignOrderCustomer(orderId: string, customerId: string) {
  return apiRequest<OpenOrderResponse>(`/api/v1/pos/orders/${orderId}/customer`, { method: "PATCH", body: { customerId } });
}

export function openCashSession(branchId: string, openingAmountCents: number) {
  return apiRequest<CashSessionSummary["session"]>("/api/v1/pos/cash-sessions/open", {
    method: "POST",
    body: { branchId, openingAmountCents },
  });
}

export function getProductSalesReport(input: {
  branchId?: string;
  period?: FinancialReport["period"];
  dateFrom?: string;
  dateTo?: string;
}) {
  const params = new URLSearchParams();
  if (input.branchId) params.set("branchId", input.branchId);
  if (input.period) params.set("period", input.period);
  if (input.dateFrom) params.set("dateFrom", input.dateFrom);
  if (input.dateTo) params.set("dateTo", input.dateTo);
  return apiRequest<ProductSalesReport>(`/api/v1/reports/products?${params.toString()}`);
}

export async function listFiscalDocuments(branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const result = await apiRequest<{ data: FiscalDocument[] }>(`/api/v1/fiscal/documents${query}`);
  return result.data;
}

export function issueFiscalDocument(orderId: string) {
  return apiRequest<FiscalDocument & { queued: boolean }>(
    `/api/v1/fiscal/orders/${orderId}/issue`,
    {
      method: "POST",
      body: { model: "nfce" },
    },
  );
}

export function cancelFiscalDocument(documentId: string) {
  return apiRequest<FiscalDocument>(`/api/v1/fiscal/documents/${documentId}/cancel`, {
    method: "POST",
  });
}

export function retryFiscalDocument(documentId: string) {
  return apiRequest<FiscalDocument>(`/api/v1/fiscal/documents/${documentId}/retry`, {
    method: "POST",
  });
}

export async function listInventorySummary(branchId: string) {
  const result = await apiRequest<{ data: InventorySummaryItem[] }>(
    `/api/v1/inventory/summary?branchId=${encodeURIComponent(branchId)}`,
  );
  return result.data;
}

export async function listInventoryAlerts(branchId: string) {
  const result = await apiRequest<{ data: InventoryAlert[] }>(
    `/api/v1/inventory/alerts?branchId=${encodeURIComponent(branchId)}`,
  );
  return result.data;
}

export function createInventoryItem(input: {
  name: string;
  unit: string;
  averageCostCents?: number;
  minQuantity?: string;
  allowNegative?: boolean;
}) {
  return apiRequest<InventorySummaryItem>("/api/v1/inventory/items", {
    method: "POST",
    body: input,
  });
}

export function adjustInventoryStock(input: {
  branchId: string;
  inventoryItemId: string;
  type?: InventoryMovement["type"];
  supplierId?: string;
  quantity: string;
  unitCostCents?: number;
  reason: string;
}) {
  return apiRequest<Record<string, unknown>>("/api/v1/inventory/adjustments", {
    method: "POST",
    body: input,
  });
}

export function upsertRecipe(input: { productId: string; yieldQuantity?: string; technicalLossRate?: string; items: Array<{ inventoryItemId: string; quantity: string; unit: string }> }) {
  return apiRequest<Record<string, unknown>>("/api/v1/inventory/recipes", { method: "POST", body: input });
}

export async function listSuppliers() { const result = await apiRequest<{ data: Supplier[] }>("/api/v1/inventory/suppliers"); return result.data; }
export function createSupplier(input: { name: string; document?: string; contactName?: string; phone?: string; email?: string }) { return apiRequest<Supplier>("/api/v1/inventory/suppliers", { method: "POST", body: input }); }

export async function listInventoryMovements(branchId: string, limit = 50) {
  const result = await apiRequest<{ data: InventoryMovement[] }>(
    `/api/v1/inventory/movements?branchId=${encodeURIComponent(branchId)}&limit=${limit}`,
  );
  return result.data;
}

export async function listPrinterDevices(branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const result = await apiRequest<{ data: PrinterDevice[] }>(`/api/v1/printing/devices${query}`);
  return result.data;
}

export function createPrinterDevice(input: {
  branchId: string;
  name: string;
  role: string;
  connectionType: string;
  address?: string;
  port?: number;
  paperWidth?: 58 | 80;
  charactersPerLine?: number;
  config?: Record<string, unknown>;
}) {
  return apiRequest<PrinterDevice>("/api/v1/printing/devices", {
    method: "POST",
    body: input,
  });
}

export async function listPrintRoutes(branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const result = await apiRequest<{ data: PrintRoute[] }>(`/api/v1/printing/routes${query}`);
  return result.data;
}

export function createPrintRoute(input: {
  branchId: string;
  name: string;
  trigger: string;
  targetType: string;
  stationId?: string;
  printerDeviceId: string;
  copies?: number;
  config?: Record<string, unknown>;
}) {
  return apiRequest<PrintRoute>("/api/v1/printing/routes", {
    method: "POST",
    body: input,
  });
}

export async function listPrintJobs(branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const result = await apiRequest<{ data: PrintJob[] }>(`/api/v1/printing/jobs${query}`);
  return result.data;
}

export function retryPrintJob(jobId: string) {
  return apiRequest<PrintJob>(`/api/v1/printing/jobs/${jobId}/retry`, {
    method: "POST",
  });
}

export function reprintPrintJob(jobId: string, reason: string) {
  return apiRequest<PrintJob>(`/api/v1/printing/jobs/${jobId}/reprint`, {
    method: "POST",
    body: { reason },
  });
}

export function getPrinterConnectorConfig() {
  return apiRequest<PrinterConnectorConfig>("/api/v1/printing/connectors/config");
}

export function configurePrinterConnector(branchId: string, rotateKey = false) {
  return apiRequest<PrinterConnectorConfigureResponse>("/api/v1/printing/connectors/configure", {
    method: "POST",
    body: { branchId, rotateKey },
  });
}

export function revokePrinterConnector() {
  return apiRequest<PrinterConnectorConfig>("/api/v1/printing/connectors/revoke", {
    method: "POST",
  });
}

export function getClubWhiskyConfig() {
  return apiRequest<ClubWhiskyIntegrationConfig>("/api/v1/integrations/club-whisky/config");
}

export function configureClubWhiskyIntegration(branchId?: string, rotateKey = false) {
  return apiRequest<ClubWhiskyConfigureResponse>("/api/v1/integrations/club-whisky/configure", {
    method: "POST",
    body: {
      branchId,
      rotateKey,
    },
  });
}

export async function listOutboxEvents(status?: string) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const result = await apiRequest<{ data: OutboxEvent[] }>(`/api/v1/integrations/outbox${query}`);
  return result.data;
}

export async function listPlatformTenants() {
  const result = await apiRequest<{ data: PlatformTenant[] }>("/api/v1/platform/tenants");
  return result.data;
}

export function getPlatformSummary() {
  return apiRequest<PlatformCommercialSummary>("/api/v1/platform/summary");
}

export async function listPlatformCommunications(
  filters: { tenantId?: string; type?: PlatformCommunicationEvent["type"]; limit?: number } = {},
) {
  const params = new URLSearchParams();
  if (filters.tenantId) {
    params.set("tenantId", filters.tenantId);
  }
  if (filters.type) {
    params.set("type", filters.type);
  }
  if (filters.limit) {
    params.set("limit", String(filters.limit));
  }
  const query = params.size ? `?${params.toString()}` : "";
  const result = await apiRequest<{ data: PlatformCommunicationEvent[] }>(
    `/api/v1/platform/communications${query}`,
  );
  return result.data;
}

export function getPlatformTenant(tenantId: string) {
  return apiRequest<PlatformTenantDetail>(`/api/v1/platform/tenants/${tenantId}`);
}

export function createPlatformTenant(input: {
  name: string;
  ownerName: string;
  ownerEmail: string;
  planCode: "starter" | "professional" | "premium";
  document?: string;
  branchName?: string;
}) {
  return apiRequest<PlatformTenantCreateResponse>("/api/v1/platform/tenants", {
    method: "POST",
    body: input,
  });
}

export function updatePlatformTenantStatus(tenantId: string, status: PlatformTenant["status"]) {
  return apiRequest<PlatformTenant>(`/api/v1/platform/tenants/${tenantId}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export function preparePlatformTenantAsaasCheckout(tenantId: string) {
  return apiRequest<{
    provider: "asaas";
    environment: "sandbox" | "production";
    tenantId: string;
    checkoutUrl: string;
    reference: string;
    providerCheckoutId?: string | null;
    nextStep: string;
  }>(`/api/v1/platform/tenants/${tenantId}/asaas/checkout`, {
    method: "POST",
  });
}

export function updatePlatformTenantSupport(
  tenantId: string,
  input: {
    priority: "normal" | "high";
    supportStatus: "queued" | "in_progress" | "waiting_customer" | "resolved";
    commercialNotes: string;
    relationshipOwnerName?: string;
    relationshipOwnerEmail?: string;
    slaTier: "standard" | "priority" | "critical";
    nextFollowUpAt?: string | null;
    contactSummary?: string;
  },
) {
  return apiRequest<PlatformTenantSupportResponse>(`/api/v1/platform/tenants/${tenantId}/support`, {
    method: "PATCH",
    body: input,
  });
}

export function sendPlatformTenantCommunication(
  tenantId: string,
  type: "trial_ending" | "past_due" | "support_follow_up",
) {
  return apiRequest<PlatformTenantCommunicationResponse>(
    `/api/v1/platform/tenants/${tenantId}/communications`,
    {
      method: "POST",
      body: { type },
    },
  );
}

export function simulatePlatformTenantPastDue(tenantId: string) {
  return apiRequest<PlatformTenant>(
    `/api/v1/platform/tenants/${tenantId}/asaas/simulate-past-due`,
    {
      method: "POST",
    },
  );
}

export async function listAuditEvents(
  filters: {
    action?: string;
    userId?: string;
    entityType?: string;
    dateFrom?: string;
    dateTo?: string;
  } = {},
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const result = await apiRequest<{ data: AuditEvent[] }>(`/api/v1/audit/events${query}`);
  return result.data;
}

async function readPayload(response: Response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function readErrorMessage(payload: unknown, status: number) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message: unknown }).message;
    return Array.isArray(message) ? message.join(", ") : String(message);
  }

  if (payload && typeof payload === "object" && "error" in payload) {
    return String((payload as { error: unknown }).error);
  }

  return `API request failed with status ${status}`;
}
