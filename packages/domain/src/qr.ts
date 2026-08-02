export type QrCapability =
  | "menu"
  | "order"
  | "review_before_kds"
  | "track_preparation"
  | "view_tab"
  | "call_waiter"
  | "request_pre_bill";

export type QrTableStatus = "active" | "revoked";

export type QrTemplate =
  | "classic"
  | "minimal"
  | "premium"
  | "gastronomia"
  | "bar_noturno"
  | "cafe"
  | "doseclub";

export type QrBranchSettings = {
  branchId: string;
  capabilities: QrCapability[];
  reviewBeforeKds: boolean;
  template: QrTemplate;
  primaryColor: string;
  instruction: string;
  showLogo: boolean;
  welcomeMessage?: string;
  menuHeadline?: string;
  marketingEnabled?: boolean;
};

export type GuestExperienceConfig = QrBranchSettings;

export type GuestExperienceRevision = {
  id: string;
  branchId: string;
  version: number;
  status: "draft" | "published" | "archived";
  config: GuestExperienceConfig;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type ServiceRequest = {
  id: string;
  branchId: string;
  tableId: string;
  orderId: string | null;
  type: "call_waiter" | "request_pre_bill" | "need_help";
  status: "pending" | "acknowledged" | "resolved" | "canceled";
  message: string | null;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type PublicOrderSummary = {
  id: string;
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
  timeline?: PublicOrderTimeline[];
};

export type PublicOrderTimeline = {
  key: "received" | "sent_to_kitchen" | "preparing" | "ready" | "served" | "canceled";
  label: string;
  state: "pending" | "active" | "completed" | "canceled";
  at: string | null;
};

export type FloorPlanRevision = {
  id: string;
  version: number;
  layout: Record<string, unknown>;
  updatedAt: string;
};
