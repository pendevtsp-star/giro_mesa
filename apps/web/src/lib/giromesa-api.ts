const configuredApiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");

// Browser requests stay same-origin so cookies and CSRF are handled consistently.
// Server-side calls may still use the configured absolute API URL.
export const apiBaseUrl = typeof window === "undefined" ? (configuredApiBaseUrl ?? "") : "";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  keepalive?: boolean;
};

let csrfTokenCache: string | null = null;

export type TenantSession = {
  tenantId: string;
  branchId?: string;
  branchName?: string;
  branches?: Array<{ id: string; name: string }>;
  userId?: string;
  requestId: string;
  permissions: string[];
  isDemo: boolean;
  mfaRequired?: boolean;
  billing?: {
    status: "healthy" | "trial_ok" | "trial_ending" | "payment_required" | "access_blocked";
    tenantStatus?: "trial" | "active" | "past_due" | "suspended" | "canceled" | null;
    currentPeriodEndsAt?: string | null;
    trialDaysRemaining?: number | null;
  };
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
  shape?: "rounded" | "square" | "circle" | "booth";
  areaId?: string | null;
  archivedAt?: string | null;
  activeOrder?: { id: string; status: string; openedAt: string | null } | null;
  reservation?: { id: string; customerName: string; scheduledAt: string; status: string } | null;
  groupId?: string | null;
  reservedName?: string | null;
};

export type QrCapability =
  | "menu"
  | "order"
  | "review_before_kds"
  | "track_preparation"
  | "view_tab"
  | "call_waiter"
  | "request_pre_bill";

export type QrBranchSettings = {
  branchId: string;
  capabilities: QrCapability[];
  reviewBeforeKds: boolean;
  template: "classic" | "minimal" | "premium" | "gastronomia" | "bar_noturno" | "cafe" | "doseclub";
  primaryColor: string;
  instruction: string;
  showLogo: boolean;
  fontPreset?: "system" | "serif" | "display";
  welcomeMessage?: string;
  menuHeadline?: string;
  marketingEnabled?: boolean;
  coverUrl?: string | null;
  language?: "pt-BR" | "en" | "es";
  highlights?: string[];
  campaignMessage?: string;
  houseInfo?: string;
  categoryLabels?: Record<string, string>;
  recommendedProductIds?: string[];
  serviceRequestReasons?: string[];
};

export type GuestExperienceRevision = {
  id: string;
  branchId: string;
  version: number;
  status: "draft" | "published" | "archived";
  config: QrBranchSettings & {
    welcomeMessage?: string;
    menuHeadline?: string;
    marketingEnabled?: boolean;
    coverUrl?: string | null;
    language?: "pt-BR" | "en" | "es";
    highlights?: string[];
    campaignMessage?: string;
    houseInfo?: string;
    categoryLabels?: Record<string, string>;
    recommendedProductIds?: string[];
    serviceRequestReasons?: string[];
  };
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type QrAdminTable = {
  id: string;
  code: string;
  name: string;
  seats: number;
  tableStatus: string;
  qrStatus: "active" | "revoked";
  qrTokenVersion: number;
  qrRotatedAt: string | null;
  publicUrl: string;
};

export type QrArtwork = {
  format: "svg" | "png" | "pdf";
  size: "plate_10x15" | "sticker_8x8" | "a4";
  settings: QrBranchSettings;
  branding?: { displayName: string; logoUrl: string | null };
  items: Array<{
    tableId: string;
    tableCode: string;
    tableName: string;
    publicUrl: string;
    svg: string;
    png: string | null;
    fileName: string;
  }>;
  printHtml: string | null;
};

export type ServiceRequest = {
  id: string;
  tableId: string;
  tableCode: string;
  tableName: string;
  orderId: string | null;
  type: "call_waiter" | "request_pre_bill" | "need_help";
  status: "pending" | "acknowledged" | "resolved" | "canceled";
  message: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type KdsTicket = {
  id: string;
  branchId: string;
  stationName: string;
  orderId: string;
  tableCode: string | null;
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
  doseClubConsumption?: Array<{
    id: string;
    productId: string | null;
    productName: string;
    doseMl: number;
    status: "consumed" | "reversed";
    occurredAt: string;
    remainingMl: number | null;
  }>;
  audit?: string;
};

export type OrderItemResponse = {
  id: string;
  orderId: string;
  productId: string;
  nameSnapshot: string;
  quantity: string;
  unitPriceCents: number;
  totalCents: number;
  status?: string;
  notes?: string | null;
  modifiers?: Array<Record<string, unknown>>;
  sentToKitchenAt?: string | null;
  audit: string;
};

export type SendToKitchenResponse = {
  orderId: string;
  status: string;
  ticketsCreated: KdsTicket[];
  audit: string;
};

export type ProductionRoutingPreview = {
  orderId: string;
  destinations: Array<{
    stationId: string;
    stationName: string;
    outputMode: "kds" | "printer" | "hybrid";
    itemIds: string[];
    printers: Array<{ routeId: string; deviceId: string; name: string }>;
  }>;
  unroutedItems: Array<{
    id: string;
    nameSnapshot: string;
    quantity: string;
    categoryId: string | null;
  }>;
};

export type OperationalSessionResponse = {
  branchId: string;
  shift: Record<string, unknown> | null;
  cash: Record<string, unknown> | null;
  order: (OpenOrderResponse & { items: OrderItemResponse[]; payments: OrderPayment[] }) | null;
  settings: Record<string, unknown>;
  latestEventVersion: number;
};

export type QrPendingOrder = {
  id: string;
  branchId: string;
  tableId: string | null;
  tableCode: string | null;
  tableName: string | null;
  guestLabel: string | null;
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
  registeredByUserId: string | null;
  registeredVia: "waiter" | "cashier";
  cashHandoverStatus: "not_required" | "pending" | "received" | "disputed";
  orderStatus: "partially_paid" | "paid";
  audit: string;
};

export type OrderPayment = {
  id: string;
  amountCents: number;
  method: string;
  status: string;
  registeredByUserId: string | null;
  registeredVia: "waiter" | "cashier";
  cashHandoverStatus: "not_required" | "pending" | "received" | "disputed";
  cashHandoverReceivedByUserId: string | null;
  cashHandoverReceivedAt: string | null;
  confirmedAt: string | null;
  createdAt: string;
  audit: string;
};

export type OperationPolicy = {
  id: string;
  branchId: string | null;
  roleId: string | null;
  maxDiscountWithoutApprovalBps: number;
  requireCancellationReason: boolean;
  requireApprovalAfterKitchen: boolean;
  returnStockOnApprovedCancellation: boolean;
};

export type ApprovalRequest = {
  id: string;
  branchId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  requestedByUserId: string;
  requestedValueCents: number | null;
  reason: string | null;
  decisionReason: string | null;
  status: "pending" | "approved" | "rejected" | "expired";
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type FloorArea = {
  id: string;
  branchId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  layout: Record<string, unknown>;
};

export type FloorReservation = {
  id: string;
  tableId: string | null;
  tableIds?: string[];
  customerName: string;
  customerPhone: string | null;
  partySize: number;
  scheduledAt: string;
  status: "booked" | "arrived" | "seated" | "no_show" | "canceled";
  notes: string | null;
};

export type WaitlistEntry = {
  id: string;
  tableId: string | null;
  customerName: string;
  customerPhone: string | null;
  partySize: number;
  quotedWaitMinutes: number | null;
  status: "waiting" | "notified" | "seated" | "left" | "canceled";
  notes: string | null;
  createdAt: string;
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
    pendingCount?: number;
    pendingAmountCents?: number;
    receivedAmountCents?: number;
    disputedAmountCents?: number;
    pendingHandovers?: Array<{
      id: string;
      amountCents: number;
      registeredByUserId: string | null;
      createdAt: string;
    }>;
    averageTicketCents?: number;
    mix?: Array<{
      method: string;
      totalCents: number;
      count: number;
      sharePercent: number;
    }>;
  };
  movements: Array<{
    id: string;
    type: "supply" | "withdrawal" | "adjustment";
    amountCents: number;
    reason: string;
    createdAt: string;
  }>;
  openOrders: {
    count: number;
    totalCents: number;
  };
};

export type OperationalShift = {
  id: string;
  tenantId: string;
  branchId: string;
  openedByUserId: string;
  closedByUserId: string | null;
  status: "open" | "closed" | "canceled";
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  audit?: string;
};

export type CurrentShiftResponse = {
  branchId: string;
  shift: OperationalShift | null;
};

export type BusinessHourInterval = {
  opensAt: string;
  closesAt: string;
};

export type WeeklyBusinessHour = BusinessHourInterval & {
  weekday: number;
  sortOrder: number;
};

export type BusinessHourException = {
  date: string;
  isClosed: boolean;
  intervals: BusinessHourInterval[];
  reason?: string | null;
};

export type BusinessHoursResponse = {
  branchId: string;
  weekly: WeeklyBusinessHour[];
  exceptions: BusinessHourException[];
};

export type BranchOperationalSettings = {
  branchId: string;
  cleaningMode: "manual" | "automatic";
  allowWaiterPayments: boolean;
  defaultTheme: "light" | "dark" | "system";
  defaultKdsInputMode: "touch" | "keyboard" | "hybrid" | "printer";
  kdsShortcuts: Record<string, string>;
};

export type DashboardSummary = {
  salesToday: number;
  activeOrders: number;
  occupiedTables: string;
  cashBalance: number;
  shiftOpen: boolean;
  cashOpen: boolean;
  inventoryAlerts: number;
};

export type SalesByPeriodResponse = {
  branchId: string;
  dateFrom: string;
  dateTo: string | null;
  groupBy: string;
  summary: {
    totalCents: number;
    totalOrders: number;
    averageTicketCents: number;
  };
  periods: Array<{
    period: string;
    totalCents: number;
    orderCount: number;
    averageTicketCents: number;
  }>;
  topProducts: Array<{
    productId: string | null;
    name: string | null;
    quantity: number;
    revenueCents: number;
  }>;
};

export type OnboardingStepStatus = "pending" | "in_progress" | "completed" | "skipped" | "blocked";

export type OnboardingStatus = {
  tenantId: string;
  branchId: string;
  readiness: "ready" | "blocked" | "in_progress";
  progressPercent: number;
  completedSteps: number;
  totalSteps: number;
  counts: {
    branches: number;
    tables: number;
    products: number;
    categories: number;
    users: number;
    roles: number;
    printers: number;
    openCashSessions: number;
  };
  blockers: Array<{ key: string; label: string }>;
  nextStep: OnboardingStep | null;
  steps: OnboardingStep[];
};

export type OnboardingStep = {
  key: string;
  title: string;
  description: string;
  href: string;
  skippable: boolean;
  status: OnboardingStepStatus;
  updatedAt: string | null;
  blockedReason: string | null;
  metadata: Record<string, unknown>;
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

export type Supplier = {
  id: string;
  name: string;
  document: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  isActive: boolean;
};
export type ModifierGroup = {
  id: string;
  productId: string;
  name: string;
  minChoices: number;
  maxChoices: number;
  isRequired: boolean;
  options: ModifierOption[];
};
export type ModifierOption = {
  id: string;
  groupId: string;
  name: string;
  priceDeltaCents: number;
  costDeltaCents: number;
  isAvailable: boolean;
};

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
    > & {
      modifierGroupCount?: number;
      recommended?: boolean;
    }
  >;
};

export type PublicModifierGroup = {
  id: string;
  name: string;
  minChoices: number;
  maxChoices: number;
  isRequired: boolean;
  options: Array<{
    id: string;
    groupId: string;
    name: string;
    priceDeltaCents: number;
  }>;
};

export type PublicQrSettings = {
  template: "classic" | "minimal" | "premium" | "gastronomia" | "bar_noturno" | "cafe" | "doseclub";
  primaryColor: string;
  instruction: string;
  showLogo: boolean;
  fontPreset?: "system" | "serif" | "display";
  welcomeMessage?: string;
  menuHeadline?: string;
  marketingEnabled?: boolean;
  coverUrl?: string | null;
  language?: "pt-BR" | "en" | "es";
  highlights?: string[];
  campaignMessage?: string;
  houseInfo?: string;
  serviceRequestReasons?: string[];
};

export type PublicPartnerAttribution = {
  product: "doseclub";
  label: "DoseClub, por GiroMesa";
  href: "https://doseclube.giromesa.com.br";
};

export type PublicQrResponse = {
  tenant: { id: string; name: string; slug: string; branding?: TenantBranding };
  table: {
    id: string;
    branchId: string;
    code: string;
    name: string;
    status: string;
    active?: boolean;
  };
  capabilities?: QrCapability[];
  reviewBeforeKds?: boolean;
  qrSettings?: PublicQrSettings;
  partnerAttribution?: PublicPartnerAttribution;
};

export type SecurePublicQrContext = {
  tenant: {
    name: string;
    branding: TenantBranding;
  };
  branchId: string;
  table: {
    id: string;
    code: string;
    name: string;
    status: string;
    active: boolean;
  };
  capabilities: QrCapability[];
  reviewBeforeKds: boolean;
  qrSettings?: PublicQrSettings;
  partnerAttribution?: PublicPartnerAttribution;
  categories: Category[];
  products: Array<{
    id: string;
    name: string;
    description: string | null;
    categoryId: string | null;
    priceCents: number;
    imageUrl: string | null;
    channels: string[];
    recommended?: boolean;
  }>;
};

export type SecurePublicOrderSummary = {
  order: {
    id: string;
    guestLabel?: string | null;
    status: string;
    items: Array<{
      name: string;
      quantity: number;
      unitPriceCents: number;
      totalCents: number;
      status: string;
    }>;
    subtotalCents: number;
    discountCents: number;
    serviceChargeCents: number;
    totalCents: number;
    receivedCents?: number;
    remainingCents?: number;
    payments?: Array<{ amountCents: number; method: string; status: string }>;
    timeline?: Array<{
      key: string;
      label: string;
      state: "pending" | "active" | "completed" | "canceled";
      at: string | null;
    }>;
  } | null;
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

export type DeliveryStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "ready_for_pickup"
  | "out_for_delivery"
  | "delivered"
  | "canceled";

export type DeliveryOrder = {
  id: string;
  orderId: string;
  channel: "own_app" | "ifood" | "rappi" | "phone";
  status: DeliveryStatus;
  customerName: string | null;
  customerPhone: string | null;
  deliveryAddress: string | null;
  deliveryFee: number;
  estimatedMinutes: number | null;
  riderName: string | null;
  riderPhone: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  orderStatus: string;
  totalCents: number;
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
  remoteClientId?: string | null;
  scopes: string[];
  webhookUrl?: string | null;
  contractVersion?: string | null;
  inventoryAuthority?: "giromesa" | string;
  apiKeyLastFour?: string | null;
  apiKeyCreatedAt?: string | null;
  hasApiKey: boolean;
  lastSyncAt?: string | null;
};

export type ClubWhiskyConfigureResponse = ClubWhiskyIntegrationConfig & {
  apiKey?: string;
  apiKeyReturnedOnce: boolean;
};

export type EcosystemEntitlement =
  | "giromesa.subscription"
  | "doseclub.subscription"
  | "bundle"
  | "integration.shared_inventory";

export type FederationHandoff = {
  token: string;
  expiresAt: string;
  targetUrl: string;
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

export function isUnauthorized(error: unknown) {
  return error instanceof ApiError && error.status === 401;
}

export function isApiUnavailable(error: unknown) {
  if (error instanceof ApiError) {
    return error.status >= 500 || error.status === 0;
  }
  return error instanceof TypeError;
}

export function getErrorMessage(
  error: unknown,
  fallback = "Não foi possível concluir a solicitação agora.",
) {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallback;
  }
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  return fallback;
}

export function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  let response = await fetch(`${apiBaseUrl}${path}`, await buildRequestInit(path, method, options));
  let payload = await readPayload(response);

  if (!response.ok && isCsrfInvalid(response.status, payload) && options.body !== undefined) {
    csrfTokenCache = null;
    response = await fetch(`${apiBaseUrl}${path}`, await buildRequestInit(path, method, options));
    payload = await readPayload(response);
  }

  if (!response.ok) {
    throw new ApiError(response.status, payload);
  }

  return payload as T;
}

async function buildRequestInit(path: string, method: string, options: RequestOptions) {
  const requestInit: RequestInit = {
    method,
    credentials: "include",
    ...(options.keepalive !== undefined ? { keepalive: options.keepalive } : {}),
  };
  const activeBranchId =
    typeof window !== "undefined" ? window.localStorage.getItem("gm_active_branch_id") : null;
  const baseHeaders = {
    ...(activeBranchId ? { "x-branch-id": activeBranchId } : {}),
    ...options.headers,
  };
  if (Object.keys(baseHeaders).length > 0) requestInit.headers = baseHeaders;

  if (options.body !== undefined) {
    const headers: Record<string, string> = {
      ...baseHeaders,
      "content-type": "application/json",
    };
    const csrfToken = await csrfTokenForRequest(path, method);
    if (csrfToken) {
      headers["x-csrf-token"] = csrfToken;
    }
    requestInit.headers = headers;
    requestInit.body = JSON.stringify(options.body);
  }

  return requestInit;
}

function isCsrfInvalid(status: number, payload: unknown) {
  return (
    status === 403 &&
    payload !== null &&
    typeof payload === "object" &&
    "error" in payload &&
    (payload as { error?: unknown }).error === "csrf_invalid"
  );
}

export async function login(email: string, password: string, mfaCode?: string) {
  csrfTokenCache = null;
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

export async function logout() {
  try {
    return await apiRequest<{ revoked: boolean }>("/api/v1/auth/logout", {
      method: "POST",
      body: {},
    });
  } finally {
    csrfTokenCache = null;
  }
}

export async function startTrial(input: {
  establishmentName: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  phone?: string;
  document?: string;
  branchName?: string;
  planCode?: "starter" | "professional" | "premium";
}) {
  csrfTokenCache = null;
  return apiRequest<{
    user: {
      id: string;
      tenantId: string | null;
      email: string;
      name: string;
      isPlatformUser: boolean;
      permissions: string[];
    };
    tenant: {
      id: string;
      name: string;
      slug: string;
      status: "trial" | "active" | "past_due" | "suspended" | "canceled";
    };
    subscription: {
      status: "trial" | "active" | "past_due" | "suspended" | "canceled";
      trialDays: number;
      currentPeriodEndsAt: string;
    };
    session: {
      tokenType: string;
      expiresInSeconds: number;
      mfaRequired: boolean;
    };
  }>("/api/v1/auth/trial", {
    method: "POST",
    body: input,
  });
}

export async function requestSubscriptionActivation(input: {
  planCode: "starter" | "professional" | "premium";
  paymentMethod?: "pix" | "credit_card" | "boleto" | "commercial_contact";
  billingDocument?: string;
  billingEmail?: string;
  notes?: string;
}) {
  return apiRequest<{
    status: "queued";
    planCode: "starter" | "professional" | "premium";
    planName: string;
    priceCents: number;
    checkoutReady: boolean;
    nextStep: "asaas_checkout_pending" | "commercial_follow_up";
    message: string;
  }>("/api/v1/auth/subscription/activation", {
    method: "POST",
    body: input,
  });
}

async function csrfTokenForRequest(path: string, method: string) {
  if (
    method === "GET" ||
    path === "/api/v1/auth/login" ||
    path === "/api/v1/auth/trial" ||
    path.startsWith("/api/v1/catalog/public/")
  ) {
    return null;
  }
  if (csrfTokenCache) {
    return csrfTokenCache;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/auth/csrf`, {
      credentials: "include",
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as { csrfToken?: unknown };
    csrfTokenCache = typeof payload.csrfToken === "string" ? payload.csrfToken : null;
    return csrfTokenCache;
  } catch {
    return null;
  }
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
  try {
    const result = await apiRequest<{ context: TenantSession }>("/api/v1/auth/me");
    return result.context;
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && typeof window !== "undefined") {
      const activeBranchId = window.localStorage.getItem("gm_active_branch_id");
      if (activeBranchId) {
        window.localStorage.removeItem("gm_active_branch_id");
        const result = await apiRequest<{ context: TenantSession }>("/api/v1/auth/me");
        return result.context;
      }
    }
    throw error;
  }
}

export function getTenantBranding() {
  return apiRequest<TenantBranding>("/api/v1/tenants/branding");
}

export function getQrSettings() {
  return apiRequest<QrBranchSettings>("/api/v1/qr/settings");
}

export function updateQrSettings(input: Partial<Omit<QrBranchSettings, "branchId">>) {
  return apiRequest<QrBranchSettings>("/api/v1/qr/settings", {
    method: "PATCH",
    body: input,
  });
}

export function getQrExperience() {
  return apiRequest<{
    draft: GuestExperienceRevision | null;
    published: GuestExperienceRevision | null;
    history: GuestExperienceRevision[];
  }>("/api/v1/qr/experience");
}

export function createQrExperienceDraft(
  input: Partial<Omit<GuestExperienceRevision["config"], "branchId">> & {
    scheduledAt?: string | null;
  },
) {
  return apiRequest<GuestExperienceRevision>("/api/v1/qr/experience/draft", {
    method: "POST",
    body: input,
  });
}

export function scheduleQrExperience(revisionId: string, scheduledAt: string) {
  return apiRequest<GuestExperienceRevision>(
    `/api/v1/qr/experience/${encodeURIComponent(revisionId)}/schedule`,
    {
      method: "POST",
      body: { scheduledAt },
    },
  );
}

export function publishQrExperience(revisionId: string) {
  return apiRequest<GuestExperienceRevision>(
    `/api/v1/qr/experience/${encodeURIComponent(revisionId)}/publish`,
    { method: "POST" },
  );
}

export function rollbackQrExperience(revisionId: string) {
  return apiRequest<GuestExperienceRevision>("/api/v1/qr/experience/rollback", {
    method: "POST",
    body: { revisionId },
  });
}

export async function listQrTables() {
  const response = await apiRequest<{ data: QrAdminTable[] }>("/api/v1/qr/tables");
  return response.data;
}

export function rotateQrTable(tableId: string) {
  return apiRequest<{ tableId: string; version: number; publicUrl: string }>(
    `/api/v1/qr/tables/${encodeURIComponent(tableId)}/rotate`,
    { method: "POST" },
  );
}

export function createQrArtwork(input: {
  tableIds: string[];
  format: "svg" | "png" | "pdf";
  size: "plate_10x15" | "sticker_8x8" | "a4";
}) {
  return apiRequest<QrArtwork>("/api/v1/qr/artwork", {
    method: "POST",
    body: input,
  });
}

export async function listServiceRequests(
  status?: "pending" | "acknowledged" | "resolved" | "canceled",
) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const response = await apiRequest<{ data: ServiceRequest[] }>(
    `/api/v1/qr/service-requests${query}`,
  );
  return response.data;
}

export function acknowledgeServiceRequest(id: string) {
  return apiRequest<ServiceRequest>(
    `/api/v1/qr/service-requests/${encodeURIComponent(id)}/acknowledge`,
    { method: "POST" },
  );
}

export function resolveServiceRequest(id: string) {
  return apiRequest<ServiceRequest>(
    `/api/v1/qr/service-requests/${encodeURIComponent(id)}/resolve`,
    { method: "POST" },
  );
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

export function getPublicMenu(tenantSlug: string) {
  return apiRequest<PublicMenuResponse>(`/api/v1/catalog/public/menu/${tenantSlug}`);
}

export function getPublicQr(tableCode: string) {
  return apiRequest<PublicQrResponse>(`/api/v1/catalog/public/qr/${encodeURIComponent(tableCode)}`);
}

export function createPublicQrOrder(
  tableCode: string,
  input: {
    items: {
      productId: string;
      quantity: number;
      notes?: string;
      modifiers?: { optionId: string }[];
    }[];
  },
) {
  return apiRequest<{ orderId: string; status: string }>(
    `/api/v1/catalog/public/qr/${encodeURIComponent(tableCode)}/orders`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function requestPublicQrAction(
  tableCode: string,
  action: "call-waiter" | "pre-bill",
  input: { message?: string } = {},
) {
  return apiRequest<{ ok: boolean; action: string }>(
    `/api/v1/catalog/public/qr/${encodeURIComponent(tableCode)}/${action}`,
    {
      method: "POST",
      body: input,
    },
  );
}

export function getSecurePublicQrContext(token: string) {
  return apiRequest<SecurePublicQrContext>(
    `/api/v1/qr/public/${encodeURIComponent(token)}/context`,
  );
}

export function getSecurePublicOrder(token: string) {
  return apiRequest<SecurePublicOrderSummary>(
    `/api/v1/qr/public/${encodeURIComponent(token)}/order`,
  );
}

export function buildSecurePublicOrderEventsUrl(token: string) {
  return `${apiBaseUrl}/api/v1/qr/public/${encodeURIComponent(token)}/events`;
}

export function createSecurePublicOrder(
  token: string,
  idempotencyKey: string,
  input: {
    guestLabel?: string;
    items: {
      productId: string;
      quantity: number;
      notes?: string;
      modifiers?: { optionId: string }[];
    }[];
  },
) {
  return apiRequest<{
    orderId: string;
    status: string;
    requiresReview: boolean;
    itemCount: number;
  }>(`/api/v1/qr/public/${encodeURIComponent(token)}/orders`, {
    method: "POST",
    headers: { "x-idempotency-key": idempotencyKey },
    body: input,
  });
}

export function createSecureServiceRequest(
  token: string,
  idempotencyKey: string,
  input: {
    type: "call_waiter" | "request_pre_bill" | "need_help";
    message?: string;
  },
) {
  return apiRequest<{ id: string; status: string; type: string }>(
    `/api/v1/qr/public/${encodeURIComponent(token)}/service-requests`,
    {
      method: "POST",
      headers: { "x-idempotency-key": idempotencyKey },
      body: input,
    },
  );
}

export function recordSecureQrAttribution(token: string, destination: "giromesa" | "doseclub") {
  return apiRequest<{ recorded: true }>(
    `/api/v1/qr/public/${encodeURIComponent(token)}/attribution`,
    { method: "POST", body: { destination }, keepalive: true },
  );
}

export function getSecureServiceRequest(token: string, requestId: string) {
  return apiRequest<{
    id: string;
    type: "call_waiter" | "request_pre_bill" | "need_help";
    status: "pending" | "acknowledged" | "resolved" | "canceled";
    message: string | null;
    acknowledgedAt: string | null;
    resolvedAt: string | null;
    createdAt: string;
  }>(
    `/api/v1/qr/public/${encodeURIComponent(token)}/service-requests/${encodeURIComponent(requestId)}`,
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

export function buildRealtimeEventsUrl(branchId: string) {
  return `${apiBaseUrl}/api/v1/realtime/events?branchId=${encodeURIComponent(branchId)}`;
}

export async function listKdsTickets() {
  const result = await apiRequest<{ data: KdsTicket[] }>("/api/v1/kds/tickets");
  return result.data;
}

export async function listKdsStations() {
  const result = await apiRequest<{ data: KdsStation[] }>("/api/v1/kds/stations");
  return result.data;
}
export function createDiningTable(input: {
  branchId: string;
  code: string;
  name: string;
  seats: number;
  shape?: "rounded" | "square" | "circle" | "booth";
  areaId?: string | null;
}) {
  return apiRequest<DiningTable>("/api/v1/pos/tables", { method: "POST", body: input });
}

export function getFloorPlan(branchId: string) {
  return apiRequest<{
    id: string | null;
    branchId: string;
    name: string;
    layout: Record<string, { x: number; y: number }>;
    version: number;
  }>(`/api/v1/pos/floor-plan?branchId=${encodeURIComponent(branchId)}`);
}

export function saveFloorPlan(
  branchId: string,
  layout: Record<string, { x: number; y: number }>,
  expectedVersion: number,
) {
  return apiRequest<{
    id: string;
    branchId: string;
    layout: Record<string, { x: number; y: number }>;
    version: number;
  }>("/api/v1/pos/floor-plan", {
    method: "PATCH",
    body: { branchId, layout, expectedVersion },
  });
}

export function mergeTables(branchId: string, tableIds: string[]) {
  return apiRequest<{ data: DiningTable[] }>("/api/v1/pos/merge-tables", {
    method: "POST",
    body: { branchId, tableIds },
  });
}

export function unmergeTables(tableId: string) {
  return apiRequest<{ data: DiningTable[] }>(
    `/api/v1/pos/unmerge-tables/${encodeURIComponent(tableId)}`,
    { method: "DELETE" },
  );
}

export function updateTable(
  tableId: string,
  data: {
    status?: string;
    reservedName?: string | null;
    seats?: number;
    shape?: "rounded" | "square" | "circle" | "booth";
    areaId?: string | null;
    archived?: boolean;
    expectedVersion?: number;
  },
) {
  return apiRequest<{ data: DiningTable }>(`/api/v1/pos/tables/${encodeURIComponent(tableId)}`, {
    method: "PATCH",
    body: data,
  });
}

export async function getPublicProductModifiers(productId: string) {
  const result = await apiRequest<{ data: PublicModifierGroup[] }>(
    `/api/v1/catalog/public/products/${encodeURIComponent(productId)}/modifiers`,
  );
  return result.data;
}

export async function listProductModifiers(productId: string) {
  const result = await apiRequest<{ data: ModifierGroup[] }>(
    `/api/v1/catalog/products/${productId}/modifiers`,
  );
  return result.data;
}
export function createModifierGroup(input: {
  productId: string;
  name: string;
  minChoices?: number;
  maxChoices?: number;
  isRequired?: boolean;
}) {
  return apiRequest<ModifierGroup>("/api/v1/catalog/modifier-groups", {
    method: "POST",
    body: input,
  });
}
export function createModifierOption(
  groupId: string,
  input: { name: string; priceDeltaCents?: number; costDeltaCents?: number; isAvailable?: boolean },
) {
  return apiRequest<ModifierOption>(`/api/v1/catalog/modifier-groups/${groupId}/options`, {
    method: "POST",
    body: input,
  });
}

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

export function updateKdsTicketItem(
  ticketId: string,
  itemId: string,
  status: "preparing" | "ready" | "served",
) {
  return apiRequest<KdsTicket & { audit: string }>(
    `/api/v1/kds/tickets/${encodeURIComponent(ticketId)}/items/${encodeURIComponent(itemId)}`,
    { method: "PATCH", body: { status } },
  );
}

export function openOrder(
  branchId: string,
  tableId?: string,
  peopleCount = 2,
  customerId?: string,
) {
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

export async function getActiveOrder(branchId: string, tableId: string) {
  const query = new URLSearchParams({ branchId, tableId });
  const result = await apiRequest<{
    data: (OpenOrderResponse & { items: OrderItemResponse[]; payments: OrderPayment[] }) | null;
  }>(`/api/v1/pos/orders/active?${query.toString()}`);
  return result.data;
}

export function getActiveOrderById(branchId: string, orderId: string) {
  const query = new URLSearchParams({ branchId, orderId });
  return apiRequest<{
    data: (OpenOrderResponse & { items: OrderItemResponse[]; payments: OrderPayment[] }) | null;
  }>(`/api/v1/pos/orders/active?${query.toString()}`).then((result) => result.data);
}

export function getOperationalSession(
  branchId: string,
  input: { tableId?: string; orderId?: string } = {},
) {
  const query = new URLSearchParams({ branchId, ...input });
  return apiRequest<OperationalSessionResponse>(`/api/v1/pos/session?${query.toString()}`);
}

export function setOperatorPin(branchId: string, pin: string) {
  return apiRequest<{ branchId: string; configured: boolean }>("/api/v1/pos/operator-pin", {
    method: "POST",
    body: { branchId, pin },
  });
}

export function verifyOperatorPin(branchId: string, pin: string) {
  return apiRequest<{ valid: boolean; branchId: string }>("/api/v1/pos/operator-pin/verify", {
    method: "POST",
    body: { branchId, pin },
  });
}

export function registerOperationalDevice(input: {
  branchId: string;
  name: string;
  kind: string;
  theme: "light" | "dark" | "system";
  kdsInput: "touch" | "keyboard" | "hybrid";
}) {
  return apiRequest<{
    id: string;
    branchId: string;
    name: string;
    kind: string;
    status: string;
    theme: string;
    kdsInput: string;
    token: string;
  }>("/api/v1/pos/devices", {
    method: "POST",
    body: input,
  });
}

export async function listOperationalDevices(branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  const result = await apiRequest<{
    data: Array<{
      id: string;
      branchId: string;
      name: string;
      kind: string;
      status: string;
      theme: string;
      kdsInput: string;
      lastSeenAt: string | null;
      createdAt: string;
    }>;
  }>(`/api/v1/pos/devices${query}`);
  return result.data;
}

export function revokeOperationalDevice(deviceId: string) {
  return apiRequest<{ id: string; branchId: string; status: string }>(
    `/api/v1/pos/devices/${encodeURIComponent(deviceId)}/revoke`,
    { method: "POST" },
  );
}

export function addOrderItem(
  orderId: string,
  productId: string,
  modifiers: Array<{ optionId: string }> = [],
  notes = "Lançado pelo painel GiroMesa",
  quantity = 1,
) {
  return apiRequest<OrderItemResponse>(`/api/v1/pos/orders/${orderId}/items`, {
    method: "POST",
    body: {
      productId,
      quantity,
      notes,
      modifiers,
    },
  });
}

export function sendOrderToKitchen(orderId: string) {
  return apiRequest<SendToKitchenResponse>(`/api/v1/pos/orders/${orderId}/send-to-kitchen`, {
    method: "POST",
  });
}

export function getProductionRoutingPreview(orderId: string) {
  return apiRequest<ProductionRoutingPreview>(
    `/api/v1/pos/orders/${encodeURIComponent(orderId)}/production-routing-preview`,
  );
}

export function requestOrderDiscount(
  orderId: string,
  input: { amountCents: number; reason: string },
) {
  return apiRequest<{
    orderId: string;
    amountCents: number;
    status: "pending_approval" | "applied";
    approval?: ApprovalRequest;
    order?: OpenOrderResponse;
  }>(`/api/v1/pos/orders/${encodeURIComponent(orderId)}/discounts`, {
    method: "POST",
    body: input,
  });
}

export function requestItemCancellation(orderId: string, itemId: string, reason: string) {
  return apiRequest<{
    orderId: string;
    itemId: string;
    status: "pending_approval" | "canceled";
    approval?: ApprovalRequest;
    order?: OpenOrderResponse;
  }>(
    `/api/v1/pos/orders/${encodeURIComponent(orderId)}/items/${encodeURIComponent(itemId)}/cancel-requests`,
    { method: "POST", body: { reason } },
  );
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
    registeredVia?: "waiter" | "cashier";
    reference?: string;
  },
) {
  return apiRequest<PaymentResponse>(`/api/v1/pos/orders/${orderId}/payments`, {
    method: "POST",
    body: {
      amountCents,
      method: input?.method ?? "pix_manual",
      idempotencyKey:
        input?.idempotencyKey ?? `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      registeredVia: input?.registeredVia ?? "cashier",
      ...(input?.reference ? { reference: input.reference } : {}),
    },
  });
}

export function splitOrderBill(orderId: string, people: number) {
  return apiRequest<{
    orderId: string;
    totalCents: number;
    parts: Array<{ person: number; amountCents: number }>;
  }>(`/api/v1/pos/orders/${encodeURIComponent(orderId)}/split`, {
    method: "POST",
    body: { people },
  });
}

export function receiveCashHandover(paymentId: string) {
  return apiRequest<PaymentResponse>(`/api/v1/pos/payments/${paymentId}/cash-handover/receive`, {
    method: "POST",
    body: {},
  });
}

export async function listOrderPayments(orderId: string) {
  const result = await apiRequest<{ data: OrderPayment[] }>(
    `/api/v1/pos/orders/${orderId}/payments`,
  );
  return result.data;
}

export function getOperationPolicy() {
  return apiRequest<OperationPolicy>("/api/v1/operation/policies");
}

export function updateOperationPolicy(
  input: Omit<OperationPolicy, "id" | "branchId" | "roleId"> & { managerPin?: string },
) {
  return apiRequest<OperationPolicy>("/api/v1/operation/policies", {
    method: "PATCH",
    body: input,
  });
}

export async function listApprovalRequests(status = "pending") {
  const result = await apiRequest<{ data: ApprovalRequest[] }>(
    `/api/v1/approvals?status=${encodeURIComponent(status)}`,
  );
  return result.data;
}

export function decideApprovalRequest(
  approvalId: string,
  decision: "approve" | "reject",
  input: { managerPin: string; reason?: string },
) {
  return apiRequest<ApprovalRequest>(`/api/v1/approvals/${approvalId}/${decision}`, {
    method: "POST",
    body: input,
  });
}

export async function listFloorAreas() {
  const result = await apiRequest<{ data: FloorArea[] }>("/api/v1/floor/areas");
  return result.data;
}

export function createFloorArea(input: { name: string; sortOrder?: number }) {
  return apiRequest<FloorArea>("/api/v1/floor/areas", { method: "POST", body: input });
}

export function updateFloorArea(
  areaId: string,
  input: { name?: string; sortOrder?: number; isActive?: boolean },
) {
  return apiRequest<FloorArea>(`/api/v1/floor/areas/${encodeURIComponent(areaId)}`, {
    method: "PATCH",
    body: input,
  });
}

export async function listFloorReservations(status?: FloorReservation["status"]) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const result = await apiRequest<{ data: FloorReservation[] }>(
    `/api/v1/floor/reservations${query}`,
  );
  return result.data;
}

export function createFloorReservation(input: {
  tableId?: string | null;
  tableIds?: string[];
  customerName: string;
  customerPhone?: string;
  partySize: number;
  scheduledAt: string;
  notes?: string;
}) {
  return apiRequest<FloorReservation>("/api/v1/floor/reservations", {
    method: "POST",
    body: input,
  });
}

export function updateFloorReservation(
  reservationId: string,
  input: {
    status?: FloorReservation["status"];
    tableId?: string | null;
    tableIds?: string[];
    notes?: string | null;
    expectedVersion?: number;
  },
) {
  return apiRequest<FloorReservation & { tableIds?: string[] }>(
    `/api/v1/floor/reservations/${encodeURIComponent(reservationId)}`,
    { method: "PATCH", body: input },
  );
}

export async function listWaitlistEntries(status?: WaitlistEntry["status"]) {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const result = await apiRequest<{ data: WaitlistEntry[] }>(`/api/v1/floor/waitlist${query}`);
  return result.data;
}

export function createWaitlistEntry(input: {
  customerName: string;
  customerPhone?: string;
  partySize: number;
  quotedWaitMinutes?: number;
  notes?: string;
}) {
  return apiRequest<WaitlistEntry>("/api/v1/floor/waitlist", {
    method: "POST",
    body: input,
  });
}

export function updateFloorWaitlist(
  entryId: string,
  input: {
    status?: WaitlistEntry["status"];
    tableId?: string | null;
    notes?: string | null;
  },
) {
  return apiRequest<WaitlistEntry>(`/api/v1/floor/waitlist/${encodeURIComponent(entryId)}`, {
    method: "PATCH",
    body: input,
  });
}

export function seatFloorReservation(reservationId: string, tableIds: string[] | string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/floor/reservations/${reservationId}/seat`, {
    method: "POST",
    body: Array.isArray(tableIds) ? { tableIds } : { tableId: tableIds },
  });
}

export function transferDiningTable(sourceTableId: string, targetTableId: string) {
  return apiRequest<Record<string, unknown>>(`/api/v1/floor/tables/${sourceTableId}/transfer`, {
    method: "POST",
    body: { targetTableId },
  });
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

export function getDashboardSummary(branchId: string) {
  return apiRequest<DashboardSummary>(
    `/api/v1/pos/dashboard/summary?branchId=${encodeURIComponent(branchId)}`,
  );
}

export function getOnboardingStatus(branchId?: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return apiRequest<OnboardingStatus>(`/api/v1/onboarding/status${query}`);
}

export function startOnboardingStep(stepKey: string, metadata?: Record<string, unknown>) {
  return apiRequest<OnboardingStatus>("/api/v1/onboarding/steps/start", {
    method: "POST",
    body: { stepKey, metadata },
  });
}

export function completeOnboardingStep(stepKey: string, metadata?: Record<string, unknown>) {
  return apiRequest<OnboardingStatus>("/api/v1/onboarding/steps/complete", {
    method: "POST",
    body: { stepKey, metadata },
  });
}

export function skipOnboardingStep(stepKey: string, metadata?: Record<string, unknown>) {
  return apiRequest<OnboardingStatus>("/api/v1/onboarding/steps/skip", {
    method: "POST",
    body: { stepKey, metadata },
  });
}

export function recalculateOnboardingReadiness(branchId?: string) {
  return apiRequest<OnboardingStatus>("/api/v1/onboarding/readiness/recalculate", {
    method: "POST",
    body: branchId ? { branchId } : {},
  });
}

export function getCurrentShift(branchId: string) {
  return apiRequest<CurrentShiftResponse>(
    `/api/v1/pos/shift/current?branchId=${encodeURIComponent(branchId)}`,
  );
}

export function getBusinessHours(branchId: string) {
  return apiRequest<BusinessHoursResponse>(
    `/api/v1/pos/branches/${encodeURIComponent(branchId)}/business-hours`,
  );
}

export function replaceBusinessHours(
  branchId: string,
  input: Pick<BusinessHoursResponse, "weekly" | "exceptions">,
) {
  return apiRequest<BusinessHoursResponse>(
    `/api/v1/pos/branches/${encodeURIComponent(branchId)}/business-hours`,
    { method: "PATCH", body: input },
  );
}

export function getBranchOperationalSettings(branchId: string) {
  return apiRequest<BranchOperationalSettings>(
    `/api/v1/pos/branches/${encodeURIComponent(branchId)}/operational-settings`,
  );
}

export function updateBranchOperationalSettings(
  branchId: string,
  input: Partial<
    Pick<
      BranchOperationalSettings,
      | "cleaningMode"
      | "allowWaiterPayments"
      | "defaultTheme"
      | "defaultKdsInputMode"
      | "kdsShortcuts"
    >
  >,
) {
  return apiRequest<BranchOperationalSettings>(
    `/api/v1/pos/branches/${encodeURIComponent(branchId)}/operational-settings`,
    { method: "PATCH", body: input },
  );
}

export function openShift(branchId: string, notes?: string) {
  return apiRequest<OperationalShift>("/api/v1/pos/shift/open", {
    method: "POST",
    body: { branchId, notes },
  });
}

export function closeShift(branchId: string, notes?: string) {
  return apiRequest<OperationalShift>("/api/v1/pos/shift/close", {
    method: "POST",
    body: { branchId, notes },
  });
}

export function registerCashSupply(branchId: string, amountCents: number, reason: string) {
  return apiRequest<Record<string, unknown>>("/api/v1/pos/cash/supply", {
    method: "POST",
    body: { branchId, amountCents, reason },
  });
}

export function registerCashWithdrawal(branchId: string, amountCents: number, reason: string) {
  return apiRequest<Record<string, unknown>>("/api/v1/pos/cash/withdrawal", {
    method: "POST",
    body: { branchId, amountCents, reason },
  });
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
  return apiRequest<OpenOrderResponse>(`/api/v1/pos/orders/${orderId}/customer`, {
    method: "PATCH",
    body: { customerId },
  });
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

export function getSalesByPeriod(input: {
  branchId?: string;
  startDate: string;
  endDate: string;
  groupBy?: "day" | "week" | "month";
}) {
  const params = new URLSearchParams();
  if (input.branchId) params.set("branchId", input.branchId);
  params.set("startDate", input.startDate);
  params.set("endDate", input.endDate);
  if (input.groupBy) params.set("groupBy", input.groupBy);
  return apiRequest<SalesByPeriodResponse>(`/api/v1/reports/sales-by-period?${params.toString()}`);
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

export function upsertRecipe(input: {
  productId: string;
  yieldQuantity?: string;
  technicalLossRate?: string;
  items: Array<{ inventoryItemId: string; quantity: string; unit: string }>;
}) {
  return apiRequest<Record<string, unknown>>("/api/v1/inventory/recipes", {
    method: "POST",
    body: input,
  });
}

export async function listSuppliers() {
  const result = await apiRequest<{ data: Supplier[] }>("/api/v1/inventory/suppliers");
  return result.data;
}
export function createSupplier(input: {
  name: string;
  document?: string;
  contactName?: string;
  phone?: string;
  email?: string;
}) {
  return apiRequest<Supplier>("/api/v1/inventory/suppliers", { method: "POST", body: input });
}

export async function listInventoryMovements(branchId: string, limit = 50) {
  const result = await apiRequest<{ data: InventoryMovement[] }>(
    `/api/v1/inventory/movements?branchId=${encodeURIComponent(branchId)}&limit=${limit}`,
  );
  return result.data;
}

export async function listDeliveries(branchId: string, status?: DeliveryStatus) {
  const params = new URLSearchParams({ branchId });
  if (status) params.set("status", status);
  const result = await apiRequest<{ data: DeliveryOrder[] }>(
    `/api/v1/deliveries?${params.toString()}`,
  );
  return result.data;
}

export function createDelivery(input: {
  orderId: string;
  channel: "own_app" | "phone";
  customerName?: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryFee?: number;
  estimatedMinutes?: number;
  notes?: string;
}) {
  return apiRequest<DeliveryOrder>("/api/v1/deliveries", {
    method: "POST",
    body: input,
  });
}

export function updateDeliveryStatus(id: string, status: DeliveryStatus) {
  return apiRequest<DeliveryOrder>(`/api/v1/deliveries/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export function cancelDelivery(id: string, reason: string) {
  return apiRequest<DeliveryOrder>(`/api/v1/deliveries/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: { reason },
  });
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

export function testPrinterDevice(deviceId: string) {
  return apiRequest<{ deviceId: string; ok: boolean; error?: string }>(
    `/api/v1/printing/devices/${deviceId}/test`,
    { method: "POST" },
  );
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

export function configureClubWhiskyIntegration(input?: {
  branchId?: string;
  remoteClientId?: string;
  webhookUrl?: string;
  rotateKey?: boolean;
}) {
  return apiRequest<ClubWhiskyConfigureResponse>("/api/v1/integrations/club-whisky/configure", {
    method: "POST",
    body: {
      ...input,
      rotateKey: input?.rotateKey ?? false,
    },
  });
}

export async function getEcosystemEntitlements() {
  const result = await apiRequest<{ data: EcosystemEntitlement[] }>(
    "/api/v1/ecosystem/entitlements",
  );
  return result.data;
}

export function createDoseClubHandoff(returnTo = "/") {
  return apiRequest<FederationHandoff>("/api/v1/auth/federation/handoff", {
    method: "POST",
    body: { targetProduct: "doseclub", returnTo },
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

  return `Nao foi possivel concluir a solicitacao agora. Codigo ${status}.`;
}
