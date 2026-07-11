"use client";

import { escapeHtml, renderBrandedPrintDocument } from "@giromesa/domain";
import {
  BadgeDollarSign,
  Banknote,
  Bell,
  ChefHat,
  ClipboardList,
  Copy,
  CreditCard,
  FileCheck2,
  FileText,
  Gauge,
  KeyRound,
  LayoutDashboard,
  MapPinned,
  PackageOpen,
  Palette,
  Printer,
  QrCode,
  ReceiptText,
  Rocket,
  RotateCw,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Users,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type ApiError,
  type AuditEvent,
  addOrderItem,
  assignOrderCustomer,
  adjustInventoryStock,
  assignUserRole,
  buildPosEventsUrl,
  type CashSessionSummary,
  type Category,
  type Customer,
  type ClubWhiskyIntegrationConfig,
  cancelFiscalDocument,
  cancelQrOrderItem,
  closeCashSession,
  closeOrder,
  configureClubWhiskyIntegration,
  configurePrinterConnector,
  createCategory,
  createInventoryItem,
  createInvitation,
  createPrinterDevice,
  createPrintRoute,
  createProduct,
  type DiningTable,
  type FiscalDocument,
  formatMoney,
  getCashSessionSummary,
  getClubWhiskyConfig,
  getPrinterConnectorConfig,
  getSession,
  getTenantBranding,
  type InventoryAlert,
  type InventorySummaryItem,
  type Invitation,
  issueFiscalDocument,
  type KdsStation,
  type KdsTicket,
  listAuditEvents,
  listCategories,
  listCustomers,
  listFiscalDocuments,
  listInventoryAlerts,
  listInventorySummary,
  listInvitations,
  listKdsStations,
  listKdsTickets,
  listOrderPayments,
  listOutboxEvents,
  listPrinterDevices,
  listPrintJobs,
  listPrintRoutes,
  listProducts,
  listQrPendingOrders,
  listRoles,
  listTableHistory,
  listTables,
  listUsers,
  type OpenOrderResponse,
  type OrderItemResponse,
  type OrderPayment,
  type OutboxEvent,
  openOrder,
  type PaymentResponse,
  type PrinterConnectorConfig,
  type PrinterDevice,
  type PrintJob,
  type PrintRoute,
  type Product,
  printBillPreview,
  printCashSessionSummary,
  printPaymentReceipt,
  type QrPendingOrder,
  type Role,
  registerManualPayment,
  rejectQrOrder,
  reprintPrintJob,
  retryFiscalDocument,
  retryPrintJob,
  revokePrinterConnector,
  sendOrderToKitchen,
  type TableHistoryEvent,
  type TenantBranding,
  type TenantSession,
  type TenantUser,
  updateQrOrderItem,
  updateRole,
} from "../../lib/giromesa-api";

function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger" | "info";
}) {
  return <span className={`gm-badge gm-badge-${tone}`}>{children}</span>;
}

type AppStatus = "loading" | "ready" | "unauthenticated" | "offline";
type RealtimeStatus = "offline" | "connecting" | "live";
type HistoryFilter = "all" | "qr" | "kds" | "payments" | "ops";
type OutboxStatusFilter = "all" | "pending" | "processed" | "failed";

const nav = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/app", permissions: [] },
  { icon: Rocket, label: "Implantação", href: "/app/onboarding", permissions: ["tenant:manage"] },
  { icon: ClipboardList, label: "PDV", href: "/app?view=pos", permissions: ["pos:operate"] },
  { icon: MapPinned, label: "Salão", href: "/app/salon", permissions: ["pos:operate"] },
  { icon: Users, label: "Garçom", href: "/app/waiter", permissions: ["pos:operate"] },
  { icon: Users, label: "Clientes", href: "/app/customers", permissions: ["pos:operate"] },
  { icon: ChefHat, label: "KDS", href: "/app/kds", permissions: ["pos:kds_send", "kds:operate"] },
  { icon: PackageOpen, label: "Estoque", href: "/app/inventory", permissions: ["inventory:manage"] },
  { icon: Banknote, label: "Caixa", href: "/app/cash", permissions: ["pos:payment_manage"] },
  { icon: CreditCard, label: "Relatórios", href: "/app/reports", permissions: ["reports:read"] },
  { icon: Printer, label: "Impressão", href: "/app/printing", permissions: ["hardware:manage"] },
  {
    icon: QrCode,
    label: "Cardápio",
    href: "/app/catalog",
    permissions: ["catalog:manage", "pos:qr_review"],
  },
  {
    icon: Settings,
    label: "Configurações",
    href: "/app/settings/branding",
    permissions: ["tenant:manage"],
  },
] as const;

const demoTables: DiningTable[] = [
  { id: "demo-m01", branchId: "demo", code: "M01", name: "Mesa 1", seats: 4, status: "free" },
  { id: "demo-m02", branchId: "demo", code: "M02", name: "Mesa 2", seats: 2, status: "occupied" },
  { id: "demo-m03", branchId: "demo", code: "M03", name: "Mesa 3", seats: 4, status: "preparing" },
  {
    id: "demo-m04",
    branchId: "demo",
    code: "M04",
    name: "Mesa 4",
    seats: 4,
    status: "waiting_payment",
  },
  { id: "demo-m05", branchId: "demo", code: "M05", name: "Mesa 5", seats: 6, status: "reserved" },
  { id: "demo-m06", branchId: "demo", code: "M06", name: "Mesa 6", seats: 5, status: "served" },
  { id: "demo-m07", branchId: "demo", code: "M07", name: "Mesa 7", seats: 2, status: "free" },
  {
    id: "demo-m08",
    branchId: "demo",
    code: "M08",
    name: "Mesa 8",
    seats: 2,
    status: "order_sent",
  },
];

const demoProducts: Product[] = [
  {
    id: "demo-burger",
    name: "Burger Classico",
    description: "Blend da casa, queijo, molho especial e pao brioche.",
    categoryId: "hamburgueres",
    priceCents: 3200,
    costCents: 1150,
    isAvailable: true,
    channels: ["pos", "qr"],
  },
  {
    id: "demo-pizza",
    name: "Pizza meia lua",
    description: "Mussarela, tomate confit, manjericao e borda crocante.",
    categoryId: "pizzas",
    priceCents: 5800,
    costCents: 1850,
    isAvailable: true,
    channels: ["pos", "qr"],
  },
  {
    id: "demo-chopp",
    name: "Chopp Pilsen 400ml",
    description: "Tirado na hora, gelado e com colarinho cremoso.",
    categoryId: "bebidas",
    priceCents: 1400,
    costCents: 420,
    isAvailable: true,
    channels: ["pos", "qr"],
  },
  {
    id: "demo-brownie",
    name: "Brownie da casa",
    description: "Chocolate intenso, sorvete e calda quente.",
    categoryId: "sobremesas",
    priceCents: 2200,
    costCents: 620,
    isAvailable: true,
    channels: ["pos", "qr"],
  },
];

const demoTickets: KdsTicket[] = [
  {
    id: "demo-kds-1",
    branchId: "demo",
    stationName: "Chapa",
    orderId: "M03",
    orderChannel: "table",
    orderStatus: "sent_to_kitchen",
    status: "preparing",
    priority: 1,
    payload: { tableId: "M03", summary: "2 burgers" },
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-kds-2",
    branchId: "demo",
    stationName: "Cozinha",
    orderId: "C07",
    orderChannel: "tab",
    orderStatus: "ready",
    status: "ready",
    priority: 0,
    payload: { tableId: "C07", summary: "Pizza meia lua" },
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-kds-3",
    branchId: "demo",
    stationName: "Bar",
    orderId: "M12",
    orderChannel: "table",
    orderStatus: "sent_to_kitchen",
    status: "sent",
    priority: 0,
    payload: { tableId: "M12", summary: "3 chopps" },
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-kds-4",
    branchId: "demo",
    stationName: "Expedicao",
    orderId: "Balcao 03",
    orderChannel: "counter",
    orderStatus: "waiting_payment",
    status: "served",
    priority: 0,
    payload: { tableId: "Balcao 03", summary: "Combo executivo" },
    createdAt: new Date().toISOString(),
  },
];

const demoKdsStations: KdsStation[] = [
  { id: "demo-kitchen", branchId: "demo", name: "Cozinha", type: "kitchen", isActive: true },
  { id: "demo-bar", branchId: "demo", name: "Bar", type: "bar", isActive: true },
];

const demoPrinterDevices: PrinterDevice[] = [
  {
    id: "demo-printer-kitchen",
    branchId: "demo",
    name: "Termica Cozinha",
    role: "kitchen",
    connectionType: "network",
    address: "192.168.15.41",
    port: 9100,
    paperWidth: 80,
    charactersPerLine: 48,
    isActive: true,
  },
  {
    id: "demo-printer-bar",
    branchId: "demo",
    name: "Termica Bar",
    role: "bar",
    connectionType: "network",
    address: "192.168.15.42",
    port: 9100,
    paperWidth: 80,
    charactersPerLine: 48,
    isActive: true,
  },
];

const demoPrintRoutes: PrintRoute[] = [
  {
    id: "demo-route-kitchen",
    branchId: "demo",
    name: "Cozinha recebe pedidos do KDS",
    trigger: "kds_ticket_created",
    targetType: "kitchen_ticket",
    stationId: "demo-kitchen",
    stationName: "Cozinha",
    printerDeviceId: "demo-printer-kitchen",
    printerName: "Termica Cozinha",
    copies: 1,
    isActive: true,
  },
  {
    id: "demo-route-bar",
    branchId: "demo",
    name: "Bar recebe bebidas do KDS",
    trigger: "kds_ticket_created",
    targetType: "bar_ticket",
    stationId: "demo-bar",
    stationName: "Bar",
    printerDeviceId: "demo-printer-bar",
    printerName: "Termica Bar",
    copies: 1,
    isActive: true,
  },
];

const demoPrintJobs: PrintJob[] = [
  {
    id: "demo-print-1",
    branchId: "demo",
    printerDeviceId: "demo-printer-kitchen",
    printerName: "Termica Cozinha",
    orderId: "demo-order",
    kdsTicketId: "demo-kds-1",
    kind: "kitchen_ticket",
    status: "pending",
    copies: 1,
    attemptCount: 0,
    maxAttempts: 3,
    renderedText: "GIROMESA\nCOZINHA\n2x Burger Classico\n\n",
    errorMessage: null,
    printedAt: null,
    createdAt: new Date().toISOString(),
    payload: { source: "demo" },
  },
];

const demoPrinterConnectorConfig: PrinterConnectorConfig = {
  provider: "local_printer_connector",
  status: "not_configured",
  branchId: null,
  scopes: [],
  hasApiKey: false,
};

const demoBranding: TenantBranding = {
  displayName: "Bar Aurora",
  logoUrl: null,
  themeMode: "light",
  accentPreset: "emerald",
};

const demoRoles: Role[] = [
  {
    id: "demo-owner-role",
    code: "owner",
    name: "Dono / administrador",
    permissions: [
      "tenant:manage",
      "catalog:manage",
      "pos:operate",
      "pos:kds_send",
      "pos:qr_review",
      "pos:payment_manage",
      "pos:close_order",
      "inventory:manage",
      "reports:read",
      "fiscal:manage",
      "printing:manage",
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-operator-role",
    code: "operator",
    name: "Operacao de salao",
    permissions: ["pos:operate", "pos:kds_send", "pos:qr_review", "pos:payment_manage"],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const demoOutboxEvents: OutboxEvent[] = [
  {
    id: "demo-outbox-payment",
    topic: "payment.confirmed",
    payload: { orderId: "demo-order", amountCents: 7400, method: "pix_manual" },
    status: "pending",
    attempts: 0,
    availableAt: new Date().toISOString(),
    processedAt: null,
    errorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-outbox-stock",
    topic: "stock.updated",
    payload: { source: "demo" },
    status: "processed",
    attempts: 1,
    availableAt: new Date().toISOString(),
    processedAt: new Date().toISOString(),
    errorMessage: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const demoUsers: TenantUser[] = [
  {
    id: "demo-user-owner",
    email: "dono@giromesa.demo",
    name: "Dono Operador",
    isActive: true,
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    roles: [
      {
        id: "demo-owner-role",
        code: "owner",
        name: "Dono / administrador",
        branchId: null,
      },
    ],
  },
  {
    id: "demo-user-salon",
    email: "salao@giromesa.demo",
    name: "Equipe Salao",
    isActive: true,
    mfaEnabled: false,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    roles: [
      {
        id: "demo-operator-role",
        code: "operator",
        name: "Operacao de salao",
        branchId: null,
      },
    ],
  },
];

const demoInvitations: Invitation[] = [
  {
    id: "demo-invite",
    email: "gerente@bar.demo",
    roleId: "demo-owner-role",
    roleCode: "owner",
    roleName: "Dono / administrador",
    status: "pending",
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
    createdAt: new Date().toISOString(),
    delivery: "email_provider_mock",
  },
];

const demoAuditEvents: AuditEvent[] = [
  {
    id: "demo-audit-payment",
    branchId: null,
    userId: "demo-user-owner",
    userName: "Dono Operador",
    userEmail: "dono@giromesa.demo",
    action: "payment.confirmed",
    entityType: "order",
    entityId: "demo-order",
    metadata: { amountCents: 7400, method: "pix_manual", orderStatus: "paid" },
    createdAt: new Date().toISOString(),
  },
  {
    id: "demo-audit-role",
    branchId: null,
    userId: "demo-user-owner",
    userName: "Dono Operador",
    userEmail: "dono@giromesa.demo",
    action: "role.updated",
    entityType: "role",
    entityId: "demo-owner-role",
    metadata: { code: "owner" },
    createdAt: new Date().toISOString(),
  },
];

const permissionGroups = [
  {
    title: "Administracao",
    items: [
      ["tenant:manage", "Gerenciar tenant, cargos e integracoes"],
      ["reports:read", "Acessar relatorios"],
    ],
  },
  {
    title: "Operacao",
    items: [
      ["pos:operate", "Operar PDV e mesas"],
      ["pos:kds_send", "Enviar pedidos ao KDS"],
      ["pos:qr_review", "Conferir pedidos QR"],
      ["pos:payment_manage", "Receber pagamentos"],
      ["pos:close_order", "Fechar contas"],
    ],
  },
  {
    title: "Retaguarda",
    items: [
      ["catalog:manage", "Gerenciar cardapio e produtos"],
      ["inventory:manage", "Gerenciar estoque"],
      ["fiscal:manage", "Gerenciar fiscal"],
      ["printing:manage", "Gerenciar impressao"],
    ],
  },
] as const;

const defaultPrinterForm = {
  name: "Termica Cozinha",
  role: "kitchen",
  connectionType: "network",
  address: "192.168.15.41",
  port: "9100",
  paperWidth: "80",
  charactersPerLine: "48",
  codepage: "cp850",
  cutMode: "partial",
  boldHeader: true,
  beep: false,
  openDrawer: false,
};

const defaultPrintRouteForm = {
  name: "Rota Cozinha",
  targetType: "kitchen_ticket",
  stationId: "",
  printerDeviceId: "",
  copies: "1",
};

const defaultCategoryForm = {
  name: "Drinks autorais",
  sortOrder: "6",
};

const defaultProductForm = {
  name: "Old Fashioned da casa",
  description: "Whisky, bitter aromatico e finalizacao citrica.",
  categoryId: "",
  price: "42,00",
  cost: "16,00",
  channels: ["pos", "qr"],
  isClubEligible: false,
  bottleVolumeMl: "1000",
  defaultDoseMl: "50",
  spiritType: "whisky",
  fiscalNcm: "22083020",
  fiscalCfop: "5102",
  fiscalOrigin: "0",
  fiscalCsosn: "102",
};

const defaultInventoryForm = {
  name: "Whisky base",
  unit: "ml",
  averageCost: "0,18",
  minQuantity: "1500",
  allowNegative: false,
};

const defaultStockAdjustmentForm = {
  inventoryItemId: "",
  quantity: "1000",
  reason: "Entrada manual conferida",
};

const defaultInvitationForm = {
  email: "gerente@bar.demo",
  roleId: "",
};

const defaultUserRoleForm = {
  userId: "",
  roleId: "",
};

const defaultAuditFilters = {
  action: "",
  userId: "",
  entityType: "",
  dateFrom: "",
  dateTo: "",
};

const paymentMethodOptions = [
  ["pix_manual", "Pix manual"],
  ["cash", "Dinheiro"],
  ["credit_card", "Credito"],
  ["debit_card", "Debito"],
] as const;

export default function AppDashboardPage() {
  const [isPosWorkspace, setIsPosWorkspace] = useState(false);
  const [status, setStatus] = useState<AppStatus>("loading");
  const [session, setSession] = useState<TenantSession | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>(demoProducts);
  const [inventorySummary, setInventorySummary] = useState<InventorySummaryItem[]>([]);
  const [inventoryAlerts, setInventoryAlerts] = useState<InventoryAlert[]>([]);
  const [cashSummary, setCashSummary] = useState<CashSessionSummary | null>(null);
  const [tables, setTables] = useState<DiningTable[]>(demoTables);
  const [tickets, setTickets] = useState<KdsTicket[]>(demoTickets);
  const [selectedTableId, setSelectedTableId] = useState(demoTables[2]?.id ?? "");
  const [selectedProductId, setSelectedProductId] = useState(demoProducts[0]?.id ?? "");
  const [currentOrder, setCurrentOrder] = useState<OpenOrderResponse | null>(null);
  const [posCustomers, setPosCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [ticketItems, setTicketItems] = useState<OrderItemResponse[]>([]);
  const [lastPaymentReceipt, setLastPaymentReceipt] = useState<PaymentResponse | null>(null);
  const [orderPayments, setOrderPayments] = useState<OrderPayment[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<(typeof paymentMethodOptions)[number][0]>("pix_manual");
  const [paymentAmountMode, setPaymentAmountMode] = useState<"remaining" | "half" | "custom">(
    "remaining",
  );
  const [customPaymentAmount, setCustomPaymentAmount] = useState("");
  const [countedCashAmount, setCountedCashAmount] = useState("");
  const [orderStatus, setOrderStatus] = useState("sem pedido aberto");
  const [actionStatus, setActionStatus] = useState("Entre no demo para acionar o PDV real.");
  const [branding, setBranding] = useState<TenantBranding>(demoBranding);
  const [clubConfig, setClubConfig] = useState<ClubWhiskyIntegrationConfig | null>(null);
  const [generatedClubKey, setGeneratedClubKey] = useState<string | null>(null);
  const [fiscalDocuments, setFiscalDocuments] = useState<FiscalDocument[]>([]);
  const [roles, setRoles] = useState<Role[]>(demoRoles);
  const [selectedRoleId, setSelectedRoleId] = useState(demoRoles[0]?.id ?? "");
  const [users, setUsers] = useState<TenantUser[]>(demoUsers);
  const [invitations, setInvitations] = useState<Invitation[]>(demoInvitations);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(demoAuditEvents);
  const [outboxEvents, setOutboxEvents] = useState<OutboxEvent[]>(demoOutboxEvents);
  const [outboxStatusFilter, setOutboxStatusFilter] = useState<OutboxStatusFilter>("all");
  const [kdsStations, setKdsStations] = useState<KdsStation[]>(demoKdsStations);
  const [qrPendingOrders, setQrPendingOrders] = useState<QrPendingOrder[]>([]);
  const [selectedQrOrderId, setSelectedQrOrderId] = useState<string | null>(null);
  const [qrItemDrafts, setQrItemDrafts] = useState<
    Record<string, { quantity: string; notes: string }>
  >({});
  const [qrRejectReason, setQrRejectReason] = useState("Solicitacao recusada pela operacao.");
  const [qrAlert, setQrAlert] = useState<string | null>(null);
  const [lastQrOrderCount, setLastQrOrderCount] = useState(0);
  const [tableHistory, setTableHistory] = useState<TableHistoryEvent[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("offline");
  const [printerDevices, setPrinterDevices] = useState<PrinterDevice[]>(demoPrinterDevices);
  const [printRoutes, setPrintRoutes] = useState<PrintRoute[]>(demoPrintRoutes);
  const [printJobs, setPrintJobs] = useState<PrintJob[]>(demoPrintJobs);
  const [printerConnectorConfig, setPrinterConnectorConfig] = useState<PrinterConnectorConfig>(
    demoPrinterConnectorConfig,
  );
  const [generatedPrinterConnectorKey, setGeneratedPrinterConnectorKey] = useState<string | null>(
    null,
  );
  const [printerForm, setPrinterForm] = useState(defaultPrinterForm);
  const [printRouteForm, setPrintRouteForm] = useState(defaultPrintRouteForm);
  const [categoryForm, setCategoryForm] = useState(defaultCategoryForm);
  const [productForm, setProductForm] = useState(defaultProductForm);
  const [inventoryForm, setInventoryForm] = useState(defaultInventoryForm);
  const [stockAdjustmentForm, setStockAdjustmentForm] = useState(defaultStockAdjustmentForm);
  const [invitationForm, setInvitationForm] = useState(defaultInvitationForm);
  const [userRoleForm, setUserRoleForm] = useState(defaultUserRoleForm);
  const [auditFilters, setAuditFilters] = useState(defaultAuditFilters);
  const [isBusy, setIsBusy] = useState(false);

  const branchId = session?.branchId;
  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? tables[0];
  const selectedProduct =
    products.find((product) => product.id === selectedProductId) ?? products[0] ?? demoProducts[0];
  const selectedQrOrder =
    qrPendingOrders.find((order) => order.id === selectedQrOrderId) ?? qrPendingOrders[0] ?? null;
  const selectedRole = roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null;
  const visibleNav = useMemo(() => {
    if (!session || session.permissions.length === 0) {
      return nav;
    }

    return nav.filter(
      (item) =>
        item.permissions.length === 0 ||
        item.permissions.some((permission) => session.permissions.includes(permission)),
    );
  }, [session]);
  const operatorProfile = useMemo(() => readOperatorProfile(session?.permissions ?? []), [session]);
  const isApiReady = status === "ready" && Boolean(branchId);
  const activeBranding = branding ?? demoBranding;
  const brandingInitial = activeBranding.displayName.slice(0, 1).toUpperCase() || "G";
  const orderTotalCents = ticketItems.reduce((sum, item) => sum + item.totalCents, 0);
  const paidOrderTotalCents = orderPayments
    .filter((payment) => payment.status === "confirmed")
    .reduce((sum, payment) => sum + payment.amountCents, 0);
  const effectiveOrderTotalCents =
    orderTotalCents > 0 ? orderTotalCents : (currentOrder?.totalCents ?? 0);
  const remainingOrderTotalCents = Math.max(0, effectiveOrderTotalCents - paidOrderTotalCents);
  const suggestedPaymentAmountCents =
    paymentAmountMode === "half"
      ? Math.max(1, Math.ceil(remainingOrderTotalCents / 2))
      : paymentAmountMode === "custom"
        ? parseMoneyToCents(customPaymentAmount)
        : remainingOrderTotalCents;
  const cashDifferenceCents = cashSummary?.session?.differenceCents ?? null;
  const cashExpectedCents = cashSummary?.session?.expectedAmountCents ?? orderTotalCents;
  const cashReceivedCents = cashSummary?.payments.totalCents ?? 0;
  const cashOpenOrdersCount = cashSummary?.openOrders.count ?? 0;
  const cashOpenOrdersCents = cashSummary?.openOrders.totalCents ?? 0;
  const cashCloseBlockedReason = useMemo(() => {
    if (!currentOrder) {
      return "Nenhuma conta aberta selecionada.";
    }
    if (orderStatus !== "paid") {
      return "Receba o pagamento antes de fechar a conta.";
    }
    return "";
  }, [currentOrder, orderStatus]);
  const cashReadiness = useMemo(() => {
    if (!cashSummary?.session) {
      return {
        tone: "warn" as const,
        title: "Caixa ainda sem sessao carregada",
        detail: "Carregue uma sessao real para conferir esperado, recebido e diferenca.",
      };
    }
    if (cashDifferenceCents !== null && cashDifferenceCents !== 0) {
      return {
        tone: "danger" as const,
        title: "Fechamento com divergencia",
        detail: `Existe diferenca de ${formatMoney(cashDifferenceCents)} que precisa de justificativa.`,
      };
    }
    if (cashOpenOrdersCount > 0) {
      return {
        tone: "warn" as const,
        title: "Ainda existem contas em aberto",
        detail: `${cashOpenOrdersCount} conta(s) somam ${formatMoney(cashOpenOrdersCents)} antes do fechamento final.`,
      };
    }
    return {
      tone: "good" as const,
      title: "Caixa pronto para conferencia",
      detail: "Sem divergencia registrada e sem exposicao relevante em pedidos abertos.",
    };
  }, [cashDifferenceCents, cashOpenOrdersCents, cashOpenOrdersCount, cashSummary?.session]);
  const cashChecklist = useMemo(
    () => [
      {
        label: "Pagamento da conta atual",
        done: orderStatus === "paid" || currentOrder === null,
        detail:
          currentOrder === null
            ? "Nenhuma conta pendente selecionada."
            : orderStatus === "paid"
              ? "Recebimento confirmado."
              : "Receba antes de fechar.",
      },
      {
        label: "Pedidos abertos do turno",
        done: cashOpenOrdersCount === 0,
        detail:
          cashOpenOrdersCount === 0
            ? "Sem exposicao em aberto."
            : `${cashOpenOrdersCount} conta(s) ainda consomem ${formatMoney(cashOpenOrdersCents)}.`,
      },
      {
        label: "Conferencia do caixa",
        done: cashDifferenceCents === null || cashDifferenceCents === 0,
        detail:
          cashDifferenceCents === null
            ? "Diferenca ainda nao informada."
            : cashDifferenceCents === 0
              ? "Conferencia sem divergencia."
              : `Existe diferenca de ${formatMoney(cashDifferenceCents)}.`,
      },
    ],
    [cashDifferenceCents, cashOpenOrdersCents, cashOpenOrdersCount, currentOrder, orderStatus],
  );
  const cashActionItems = useMemo(
    () => [
      {
        label: "Recebido no turno",
        value: formatMoney(cashReceivedCents),
        hint: "Soma dos pagamentos confirmados.",
      },
      {
        label: "Esperado",
        value: formatMoney(cashExpectedCents),
        hint: "Base da conferencia operacional.",
      },
      {
        label: "Exposicao aberta",
        value: `${cashOpenOrdersCount} conta(s)`,
        hint: formatMoney(cashOpenOrdersCents),
      },
    ],
    [cashExpectedCents, cashOpenOrdersCents, cashOpenOrdersCount, cashReceivedCents],
  );
  const filteredTableHistory = useMemo(
    () =>
      tableHistory.filter(
        (event) =>
          isHistoryEventInFilter(event, historyFilter) &&
          isHistoryEventMatchingQuery(event, historyQuery),
      ),
    [historyFilter, historyQuery, tableHistory],
  );

  const refreshRealtimeData = useCallback(async (context: TenantSession) => {
    const [apiCategories, apiProducts, apiTables, apiQrOrders, apiTickets] = await Promise.all([
      listCategories(),
      listProducts(),
      context.branchId ? listTables(context.branchId) : Promise.resolve([]),
      context.branchId ? listQrPendingOrders(context.branchId) : Promise.resolve([]),
      listKdsTickets(),
    ]);

    setCategories(apiCategories);
    setProducts(apiProducts.length > 0 ? apiProducts : demoProducts);
    setTables(apiTables.length > 0 ? apiTables : demoTables);
    setQrPendingOrders(apiQrOrders);
    setSelectedQrOrderId((current) =>
      current && apiQrOrders.some((order) => order.id === current)
        ? current
        : (apiQrOrders[0]?.id ?? null),
    );
    setQrItemDrafts((current) => {
      const next: Record<string, { quantity: string; notes: string }> = {};
      for (const order of apiQrOrders) {
        for (const item of order.items) {
          next[item.id] = current[item.id] ?? {
            quantity: String(Number(item.quantity)),
            notes: item.notes ?? "",
          };
        }
      }
      return next;
    });
    setTickets(apiTickets.length > 0 ? apiTickets : demoTickets);
    setSelectedProductId(
      (current) =>
        apiProducts.find((product) => product.id === current)?.id ?? apiProducts[0]?.id ?? current,
    );
    setSelectedTableId(
      (current) =>
        apiTables.find((table) => table.id === current)?.id ??
        apiTables.find((table) => table.status !== "blocked")?.id ??
        current,
    );
  }, []);

  const refreshClubConfig = useCallback(async () => {
    const config = await getClubWhiskyConfig();
    setClubConfig(config);
  }, []);

  const refreshBranding = useCallback(async () => {
    const tenantBranding = await getTenantBranding();
    setBranding(tenantBranding);
  }, []);

  const refreshTableHistory = useCallback(async (context: TenantSession, tableId?: string) => {
    if (!context.branchId || !tableId) {
      setTableHistory([]);
      return;
    }
    const history = await listTableHistory(tableId);
    setTableHistory(history);
  }, []);

  const refreshFiscalDocuments = useCallback(async (context: TenantSession) => {
    const documents = await listFiscalDocuments(context.branchId);
    setFiscalDocuments(documents);
  }, []);

  const refreshInventory = useCallback(async (context: TenantSession) => {
    if (!context.branchId) {
      return;
    }
    const [rows, alerts] = await Promise.all([
      listInventorySummary(context.branchId),
      listInventoryAlerts(context.branchId),
    ]);
    setInventorySummary(rows);
    setInventoryAlerts(alerts);
    setStockAdjustmentForm((current) => ({
      ...current,
      inventoryItemId: current.inventoryItemId || rows[0]?.id || "",
    }));
  }, []);

  const refreshCashSummary = useCallback(async (context: TenantSession) => {
    if (!context.branchId) {
      return;
    }
    setCashSummary(await getCashSessionSummary(context.branchId));
  }, []);

  const refreshOrderPayments = useCallback(async (orderId: string) => {
    const rows = await listOrderPayments(orderId);
    setOrderPayments(rows);
  }, []);

  const refreshPrinting = useCallback(async (context: TenantSession) => {
    const [stations, devices, routes, jobs] = await Promise.all([
      listKdsStations(),
      listPrinterDevices(context.branchId),
      listPrintRoutes(context.branchId),
      listPrintJobs(context.branchId),
    ]);
    setKdsStations(stations.length > 0 ? stations : demoKdsStations);
    setPrinterDevices(devices.length > 0 ? devices : demoPrinterDevices);
    setPrintRoutes(routes.length > 0 ? routes : demoPrintRoutes);
    setPrintJobs(jobs.length > 0 ? jobs : demoPrintJobs);
    setPrintRouteForm((current) => ({
      ...current,
      stationId: current.stationId || stations[0]?.id || "",
      printerDeviceId: current.printerDeviceId || devices[0]?.id || "",
    }));
  }, []);

  const refreshPrinterConnector = useCallback(async () => {
    const config = await getPrinterConnectorConfig();
    setPrinterConnectorConfig(config);
  }, []);

  const refreshRoles = useCallback(async () => {
    const rows = await listRoles();
    setRoles(rows.length > 0 ? rows : demoRoles);
    setSelectedRoleId((current) =>
      rows.some((role) => role.id === current) ? current : (rows[0]?.id ?? demoRoles[0]?.id ?? ""),
    );
    setInvitationForm((current) => ({
      ...current,
      roleId: current.roleId || rows[0]?.id || demoRoles[0]?.id || "",
    }));
    setUserRoleForm((current) => ({
      ...current,
      roleId: current.roleId || rows[0]?.id || demoRoles[0]?.id || "",
    }));
  }, []);

  const refreshTeam = useCallback(async () => {
    const [apiUsers, apiInvitations] = await Promise.all([listUsers(), listInvitations()]);
    setUsers(apiUsers.length > 0 ? apiUsers : demoUsers);
    setInvitations(apiInvitations.length > 0 ? apiInvitations : demoInvitations);
    setUserRoleForm((current) => ({
      ...current,
      userId: current.userId || apiUsers[0]?.id || demoUsers[0]?.id || "",
    }));
  }, []);

  const refreshOutbox = useCallback(async (statusFilter: OutboxStatusFilter = "all") => {
    const rows = await listOutboxEvents(statusFilter === "all" ? undefined : statusFilter);
    setOutboxEvents(rows.length > 0 ? rows : demoOutboxEvents);
  }, []);

  const refreshAuditEvents = useCallback(
    async (filters = auditFilters) => {
      const rows = await listAuditEvents(filters);
      setAuditEvents(rows.length > 0 ? rows : demoAuditEvents);
    },
    [auditFilters],
  );

  useEffect(() => {
    let ignore = false;

    async function bootstrap() {
      try {
        const context = await getSession();
        if (ignore) {
          return;
        }
        setSession(context);
        await refreshBranding();
        await refreshRealtimeData(context);
        await refreshClubConfig();
        await refreshFiscalDocuments(context);
        await refreshInventory(context);
        await refreshCashSummary(context);
        await refreshPrinting(context);
        await refreshPrinterConnector();
        await refreshRoles();
        await refreshTeam();
        await refreshOutbox();
        await refreshAuditEvents();
        if (!ignore) {
          setStatus("ready");
          setActionStatus("Sessao ativa. O PDV ja pode operar com dados reais.");
        }
      } catch (error) {
        if (ignore) {
          return;
        }

        const maybeApiError = error as ApiError;
        setStatus(maybeApiError.status === 401 ? "unauthenticated" : "offline");
        setActionStatus(
          maybeApiError.status === 401
            ? "Sessao ausente. Acesse o login demo para ativar as acoes reais."
            : "API local indisponivel. Mantendo dados visuais de demonstracao.",
        );
      }
    }

    void bootstrap();
    return () => {
      ignore = true;
    };
  }, [
    refreshClubConfig,
    refreshBranding,
    refreshFiscalDocuments,
    refreshInventory,
    refreshCashSummary,
    refreshAuditEvents,
    refreshOutbox,
    refreshPrinterConnector,
    refreshPrinting,
    refreshRealtimeData,
    refreshRoles,
    refreshTeam,
  ]);

  useEffect(() => {
    if (!session || status !== "ready" || !selectedTableId) {
      return;
    }

    void refreshTableHistory(session, selectedTableId);
  }, [refreshTableHistory, selectedTableId, session, status]);

  useEffect(() => {
    if (!currentOrder || status !== "ready") {
      setOrderPayments([]);
      return;
    }

    void refreshOrderPayments(currentOrder.id);
  }, [currentOrder, refreshOrderPayments, status]);

  useEffect(() => {
    const activeCashSession = cashSummary?.session;
    if (!activeCashSession) {
      return;
    }

    setCountedCashAmount((current) =>
      current.length > 0
        ? current
        : (activeCashSession.expectedAmountCents / 100).toFixed(2).replace(".", ","),
    );
  }, [cashSummary?.session]);

  useEffect(() => {
    if (!session?.branchId || status !== "ready") {
      setRealtimeStatus("offline");
      return;
    }

    setRealtimeStatus("connecting");
    const events = new EventSource(buildPosEventsUrl(session.branchId), {
      withCredentials: true,
    });

    events.onopen = () => {
      setRealtimeStatus("live");
    };

    events.onmessage = () => {
      void refreshRealtimeData(session);
      void refreshOutbox(outboxStatusFilter);
      void refreshAuditEvents();
      if (selectedTableId) {
        void refreshTableHistory(session, selectedTableId);
      }
    };

    events.onerror = () => {
      setRealtimeStatus("connecting");
    };

    return () => {
      events.close();
      setRealtimeStatus("offline");
    };
  }, [
    outboxStatusFilter,
    refreshAuditEvents,
    refreshOutbox,
    refreshRealtimeData,
    refreshTableHistory,
    selectedTableId,
    session,
    status,
  ]);

  useEffect(() => {
    if (status !== "ready") {
      setLastQrOrderCount(qrPendingOrders.length);
      return;
    }

    if (qrPendingOrders.length > lastQrOrderCount) {
      const newestOrder = qrPendingOrders[0];
      setQrAlert(
        newestOrder
          ? `Novo pedido QR recebido em ${readQrOrderLabel(newestOrder)}.`
          : "Novo pedido QR recebido.",
      );
      playQrNotification();
    }

    setLastQrOrderCount(qrPendingOrders.length);
  }, [lastQrOrderCount, qrPendingOrders, status]);

  useEffect(() => {
    setIsPosWorkspace(new URLSearchParams(window.location.search).get("view") === "pos");
  }, []);

  useEffect(() => {
    if (!isPosWorkspace || status !== "ready") return;
    void listCustomers().then(setPosCustomers).catch(() => setPosCustomers([]));
  }, [isPosWorkspace, status]);

  const metrics = useMemo(() => {
    const occupiedCount = tables.filter((table) => table.status !== "free").length;
    const activeTickets = tickets.filter((ticket) => !["ready", "served"].includes(ticket.status));
    const activeOrderCount = activeTickets.length + qrPendingOrders.length;
    return [
      [
        "Vendas hoje",
        ticketItems.length ? formatMoney(orderTotalCents) : "R$ 8.742",
        "pedido atual",
      ],
      ["Pedidos ativos", String(Math.max(activeOrderCount, 1)), "QR + KDS"],
      ["Mesas ocupadas", `${occupiedCount}/${Math.max(tables.length, 1)}`, "salao agora"],
      ["Caixa atual", "R$ 2.184", orderStatus],
    ] as const;
  }, [orderStatus, orderTotalCents, qrPendingOrders.length, tables, ticketItems.length, tickets]);

  const activeOrderCount =
    tickets.filter((ticket) => !["ready", "served"].includes(ticket.status)).length +
    qrPendingOrders.length;

  async function ensureOrder() {
    if (!branchId || !selectedTable) {
      throw new Error("Selecione uma mesa com sessao ativa.");
    }

    if (currentOrder) {
      return currentOrder;
    }

    const opened = await openOrder(branchId, selectedTable.id, 2, selectedCustomerId || undefined);
    setCurrentOrder(opened);
    setOrderStatus(opened.status);
    setOrderPayments([]);
    setLastPaymentReceipt(null);
    setPaymentAmountMode("remaining");
    setCustomPaymentAmount("");
    setTables((current) =>
      current.map((table) =>
        table.id === selectedTable.id ? { ...table, status: "occupied" } : table,
      ),
    );
    setActionStatus(`Pedido aberto em ${selectedTable.code}.`);
    return opened;
  }

  async function runAction(action: () => Promise<void>) {
    if (!isApiReady) {
      setActionStatus("Faca login para usar as acoes reais do PDV.");
      return;
    }

    setIsBusy(true);
    try {
      await action();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao executar acao.";
      setActionStatus(message);
    } finally {
      setIsBusy(false);
    }
  }

  function openPrintDocument(html: string, title: string) {
    const popup = window.open("", "_blank", "width=1120,height=820");
    if (!popup) {
      throw new Error(`Nao foi possivel abrir a janela de ${title}.`);
    }

    popup.document.write(html);
    popup.document.close();
    popup.focus();
    popup.print();
  }

  function renderBrandingDocument(
    input: Parameters<typeof renderBrandedPrintDocument>[0],
    title: string,
  ) {
    openPrintDocument(renderBrandedPrintDocument(input), title);
  }

  function handleExportBillDocument() {
    void runAction(async () => {
      if (!currentOrder) {
        throw new Error("Abra uma conta antes de gerar a pre-conta executiva.");
      }

      renderBrandingDocument(
        {
          branding,
          documentLabel: "Pre-conta",
          title: `Pre-conta ${selectedTable?.code ?? currentOrder.channel.toUpperCase()}`,
          subtitle:
            "Documento de conferencia para a mesa, com itens, servico e total apurado no momento da emissao.",
          metadata: [
            { label: "Pedido", value: currentOrder.id.slice(0, 8) },
            { label: "Mesa/Comanda", value: selectedTable?.code ?? "Balcao" },
            { label: "Emitido em", value: new Date().toLocaleString("pt-BR") },
          ],
          metrics: [
            { label: "Itens", value: String(ticketItems.length) },
            { label: "Subtotal", value: formatMoney(orderTotalCents) },
            { label: "Total", value: formatMoney(orderTotalCents) },
          ],
          bodyHtml: `
            <section class="section">
              <h2>Itens lancados</h2>
              <table>
                <thead>
                  <tr>
                    <th>Qtd</th>
                    <th>Item</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>${
                  (ticketItems.length ? ticketItems : demoTicketLines())
                    .map(
                      (item) => `
                        <tr>
                          <td>${escapeHtml(readQuantity(item.quantity))}</td>
                          <td>${escapeHtml(item.nameSnapshot)}</td>
                          <td>${escapeHtml(formatMoney(item.totalCents))}</td>
                        </tr>`,
                    )
                    .join("") || "<tr><td colspan='3'>Sem itens.</td></tr>"
                }</tbody>
              </table>
            </section>
          `,
          footerNote:
            "Pre-conta sem valor fiscal. Use este documento para conferencia e fechamento operacional.",
        },
        "pre-conta",
      );
      setActionStatus("Pre-conta executiva aberta para impressao.");
    });
  }

  function handleExportCashSummaryDocument() {
    void runAction(async () => {
      if (!cashSummary?.session?.id) {
        throw new Error("Nao ha caixa carregado para gerar o resumo executivo.");
      }

      renderBrandingDocument(
        {
          branding,
          documentLabel: "Resumo de caixa",
          title: "Fechamento operacional do caixa",
          subtitle:
            "Leitura resumida do turno com esperado, recebido, pedidos em aberto e diferenca apurada ate o momento.",
          metadata: [
            {
              label: "Sessao",
              value: cashSummary.session.id.slice(0, 8),
            },
            {
              label: "Abertura",
              value: new Date(cashSummary.session.openedAt).toLocaleString("pt-BR"),
            },
            {
              label: "Status",
              value: cashSummary.session.status,
            },
          ],
          metrics: [
            {
              label: "Esperado",
              value: formatMoney(cashSummary.session.expectedAmountCents),
            },
            {
              label: "Recebido",
              value: formatMoney(cashSummary.payments.totalCents),
            },
            {
              label: "Pedidos abertos",
              value: `${cashSummary.openOrders.count}`,
            },
            {
              label: "Diferenca",
              value:
                cashSummary.session.differenceCents === null ||
                cashSummary.session.differenceCents === undefined
                  ? "-"
                  : formatMoney(cashSummary.session.differenceCents),
            },
          ],
          bodyHtml: `
            <section class="section">
              <h2>Formas de pagamento</h2>
              <table>
                <thead>
                  <tr>
                    <th>Metodo</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>${Object.entries(cashSummary.payments.byMethod)
                  .map(
                    ([method, total]) => `
                      <tr>
                        <td>${escapeHtml(method)}</td>
                        <td>${escapeHtml(formatMoney(total))}</td>
                      </tr>`,
                  )
                  .join("")}</tbody>
              </table>
            </section>
          `,
          footerNote:
            "Documento de conferencia interna. A impressao operacional por rota continua disponivel em paralelo.",
        },
        "resumo de caixa",
      );
      setActionStatus("Resumo executivo do caixa aberto para impressao.");
    });
  }

  function handleExportPaymentReceipt() {
    void runAction(async () => {
      if (!lastPaymentReceipt || !currentOrder) {
        throw new Error("Receba um pagamento antes de gerar o comprovante.");
      }

      renderBrandingDocument(
        {
          branding,
          documentLabel: "Comprovante",
          title: "Comprovante de pagamento",
          subtitle:
            "Registro de recebimento para conferencia do cliente e do caixa, emitido a partir do fluxo operacional do PDV.",
          metadata: [
            { label: "Pedido", value: currentOrder.id.slice(0, 8) },
            { label: "Mesa/Comanda", value: selectedTable?.code ?? "Balcao" },
            { label: "Emitido em", value: new Date().toLocaleString("pt-BR") },
          ],
          metrics: [
            { label: "Metodo", value: lastPaymentReceipt.method },
            { label: "Valor pago", value: formatMoney(lastPaymentReceipt.amountCents) },
            { label: "Status do pedido", value: lastPaymentReceipt.orderStatus },
          ],
          bodyHtml: `
            <section class="section">
              <h2>Resumo do recebimento</h2>
              <table>
                <tbody>
                  <tr><th>Transacao</th><td>${escapeHtml(lastPaymentReceipt.id.slice(0, 8))}</td></tr>
                  <tr><th>Auditoria</th><td>${escapeHtml(lastPaymentReceipt.audit)}</td></tr>
                  <tr><th>Total do pedido</th><td>${escapeHtml(formatMoney(orderTotalCents))}</td></tr>
                  <tr><th>Valor recebido</th><td>${escapeHtml(formatMoney(lastPaymentReceipt.amountCents))}</td></tr>
                </tbody>
              </table>
            </section>
          `,
          footerNote:
            "Comprovante operacional emitido pelo GiroMesa. O documento fiscal segue fluxo proprio quando aplicavel.",
        },
        "comprovante",
      );
      setActionStatus("Comprovante de pagamento aberto para impressao.");
    });
  }

  function handleExportFiscalAuxiliary(document: FiscalDocument) {
    void runAction(async () => {
      renderBrandingDocument(
        {
          branding,
          documentLabel: "Fiscal auxiliar",
          title: `${document.model.toUpperCase()} ${document.number ? `${document.series ?? "1"}-${document.number}` : "pendente"}`,
          subtitle:
            "Capa operacional para conferencia do documento fiscal, com status, totais e referencias do pedido.",
          metadata: [
            { label: "Status", value: document.status },
            { label: "Pedido", value: document.orderId?.slice(0, 8) ?? "Sem pedido" },
            {
              label: "Emitido em",
              value: document.issuedAt
                ? new Date(document.issuedAt).toLocaleString("pt-BR")
                : "Ainda nao emitido",
            },
          ],
          metrics: [
            { label: "Modelo", value: document.model.toUpperCase() },
            { label: "Valor", value: formatMoney(document.orderTotalCents ?? 0) },
            { label: "Serie", value: document.series ?? "1" },
          ],
          bodyHtml: `
            <section class="section">
              <h2>Detalhes do documento</h2>
              <table>
                <tbody>
                  <tr><th>Provider</th><td>${escapeHtml(document.provider)}</td></tr>
                  <tr><th>Ambiente</th><td>${escapeHtml(document.environment)}</td></tr>
                  <tr><th>Chave de acesso</th><td>${escapeHtml(document.accessKey ?? "Pendente")}</td></tr>
                  <tr><th>XML</th><td>${escapeHtml(document.xmlUrl ?? "Nao disponivel")}</td></tr>
                  <tr><th>DANFE</th><td>${escapeHtml(document.danfeUrl ?? "Nao disponivel")}</td></tr>
                  <tr><th>Erro</th><td>${escapeHtml(document.errorMessage ?? "Sem erro")}</td></tr>
                </tbody>
              </table>
            </section>
          `,
          footerNote:
            "Anexo auxiliar para conferencia interna. Nao substitui o documento fiscal oficial nem o XML autorizado.",
        },
        "fiscal auxiliar",
      );
      setActionStatus("Documento fiscal auxiliar aberto para impressao.");
    });
  }

  function handleAddItem(product: Product) {
    setSelectedProductId(product.id);
    void runAction(async () => {
      const order = await ensureOrder();
      const item = await addOrderItem(order.id, product.id);
      setTicketItems((current) => [...current, item]);
      setOrderStatus("opened");
      setActionStatus(`${item.nameSnapshot} lancado na comanda.`);
    });
  }

  function handleSendToKitchen() {
    void runAction(async () => {
      const order = currentOrder ?? (await ensureOrder());
      if (ticketItems.length === 0) {
        if (!selectedProduct) {
          throw new Error("Nenhum produto disponivel para enviar ao KDS.");
        }
        const item = await addOrderItem(order.id, selectedProduct.id);
        setTicketItems((current) => [...current, item]);
      }

      const sent = await sendOrderToKitchen(order.id);
      setOrderStatus(sent.status);
      setActionStatus(`${sent.ticketsCreated.length} ticket(s) enviados para KDS.`);
      if (session) {
        await refreshRealtimeData(session);
        await refreshPrinting(session);
      }
    });
  }

  function handleSendQrOrderToKitchen(order: QrPendingOrder) {
    void runAction(async () => {
      const sent = await sendOrderToKitchen(order.id);
      setActionStatus(
        `${readQrOrderLabel(order)} enviada para KDS com ${sent.ticketsCreated.length} ticket(s).`,
      );
      if (session) {
        await refreshRealtimeData(session);
        await refreshPrinting(session);
        await refreshTableHistory(session, order.tableId ?? selectedTableId);
      }
    });
  }

  function handleUpdateQrItem(order: QrPendingOrder, itemId: string) {
    void runAction(async () => {
      const draft = qrItemDrafts[itemId];
      if (!draft) {
        throw new Error("Item QR sem dados para salvar.");
      }

      const quantity = Number(draft.quantity.replace(",", "."));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error("Informe uma quantidade valida para o item QR.");
      }

      const notes = draft.notes.trim();
      await updateQrOrderItem(order.id, itemId, {
        quantity,
        ...(notes ? { notes } : {}),
      });
      setActionStatus(`${readQrOrderLabel(order)} revisada antes do KDS.`);
      if (session) {
        await refreshRealtimeData(session);
        await refreshTableHistory(session, order.tableId ?? selectedTableId);
      }
    });
  }

  function handleCancelQrItem(order: QrPendingOrder, itemId: string) {
    void runAction(async () => {
      await cancelQrOrderItem(
        order.id,
        itemId,
        "Item cancelado na conferencia operacional antes do envio ao KDS.",
      );
      setActionStatus(`${readQrOrderLabel(order)} teve um item cancelado antes do KDS.`);
      if (session) {
        await refreshRealtimeData(session);
        await refreshTableHistory(session, order.tableId ?? selectedTableId);
      }
    });
  }

  function handleRejectQrOrder(order: QrPendingOrder) {
    void runAction(async () => {
      await rejectQrOrder(order.id, qrRejectReason);
      setActionStatus(`${readQrOrderLabel(order)} recusada. Motivo registrado no historico.`);
      if (session) {
        await refreshRealtimeData(session);
        await refreshTableHistory(session, order.tableId ?? selectedTableId);
      }
    });
  }

  function handlePayment() {
    void runAction(async () => {
      if (!currentOrder) {
        throw new Error("Abra uma mesa e lance um item antes de receber.");
      }
      if (effectiveOrderTotalCents <= 0) {
        throw new Error("Lance pelo menos um item antes de receber.");
      }
      if (remainingOrderTotalCents <= 0) {
        throw new Error("A conta ja foi totalmente recebida.");
      }
      if (suggestedPaymentAmountCents <= 0) {
        throw new Error("Informe um valor valido para o pagamento.");
      }
      if (suggestedPaymentAmountCents > remainingOrderTotalCents) {
        throw new Error("O valor informado excede o saldo restante da conta.");
      }

      const payment = await registerManualPayment(currentOrder.id, suggestedPaymentAmountCents, {
        method: paymentMethod,
      });
      setLastPaymentReceipt(payment);
      await refreshOrderPayments(currentOrder.id);
      setOrderStatus(payment.orderStatus);
      setActionStatus(
        `Pagamento ${payment.method} confirmado: ${formatMoney(payment.amountCents)}.`,
      );
    });
  }

  function handleCloseOrder() {
    void runAction(async () => {
      if (!currentOrder) {
        throw new Error("Nenhum pedido aberto para fechar.");
      }
      if (orderStatus !== "paid") {
        throw new Error("Receba o pagamento antes de fechar a conta.");
      }

      const closed = await closeOrder(currentOrder.id);
      setActionStatus(`Conta fechada. Fiscal: ${closed.fiscalStatus}.`);
      if (session) {
        await refreshFiscalDocuments(session);
      }
      setOrderStatus("closed");
      setCurrentOrder(null);
      setTicketItems([]);
      setOrderPayments([]);
      setLastPaymentReceipt(null);
      setTables((current) =>
        current.map((table) =>
          table.id === selectedTable?.id ? { ...table, status: "free" } : table,
        ),
      );
    });
  }

  function handleCloseCashSession() {
    void runAction(async () => {
      if (!cashSummary?.session?.id) {
        throw new Error("Nao ha sessao de caixa carregada para encerrar.");
      }
      const countedAmountCents = parseMoneyToCents(countedCashAmount);
      if (countedAmountCents < 0) {
        throw new Error("Valor contado invalido.");
      }
      const closed = await closeCashSession(cashSummary.session.id, countedAmountCents);
      setActionStatus(
        `${closed.audit === "cash_session.disputed" ? "Caixa encerrado com divergencia" : "Caixa encerrado"}: ${formatMoney(closed.differenceCents)} de diferenca.`,
      );
      if (session) {
        await refreshCashSummary(session);
        await refreshAuditEvents();
        await refreshOutbox(outboxStatusFilter);
      }
    });
  }

  function handlePrintBillPreview() {
    void runAction(async () => {
      if (!currentOrder) {
        throw new Error("Abra uma conta antes de imprimir a pre-conta.");
      }
      const job = await printBillPreview(currentOrder.id);
      setPrintJobs((current) => [job, ...current]);
      setActionStatus(`Pre-conta enviada para impressao: ${job.id.slice(0, 8)}.`);
    });
  }

  function handlePrintCashSummary() {
    void runAction(async () => {
      if (!cashSummary?.session?.id) {
        throw new Error("Nao ha caixa aberto/carregado para imprimir resumo.");
      }
      const job = await printCashSessionSummary(cashSummary.session.id);
      setPrintJobs((current) => [job, ...current]);
      setActionStatus(`Resumo de caixa enviado para impressao: ${job.id.slice(0, 8)}.`);
    });
  }

  function handlePrintPaymentReceipt() {
    void runAction(async () => {
      if (!currentOrder || !lastPaymentReceipt) {
        throw new Error("Receba um pagamento antes de imprimir o comprovante fisico.");
      }
      const job = await printPaymentReceipt(currentOrder.id);
      setPrintJobs((current) => [job, ...current]);
      setActionStatus(`Comprovante fisico enviado para impressao: ${job.id.slice(0, 8)}.`);
    });
  }

  function handleConfigureClub(rotateKey: boolean) {
    void runAction(async () => {
      const response = await configureClubWhiskyIntegration(branchId, rotateKey);
      setClubConfig(response);
      setGeneratedClubKey(response.apiKey ?? null);
      setActionStatus(
        response.apiKey
          ? "Chave do Dose Club gerada. Ela sera exibida somente agora."
          : "Integracao Dose Club atualizada.",
      );
    });
  }

  function handleTogglePermission(role: Role, permission: string) {
    void runAction(async () => {
      const nextPermissions = role.permissions.includes(permission)
        ? role.permissions.filter((entry) => entry !== permission)
        : [...role.permissions, permission];

      const updated = await updateRole(role.id, { permissions: nextPermissions });
      setRoles((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)));
      setActionStatus(`Permissoes de ${updated.name} atualizadas com auditoria.`);
    });
  }

  function handleCreateInvitation() {
    void runAction(async () => {
      if (!invitationForm.email.trim()) {
        throw new Error("Informe o e-mail do convite.");
      }
      if (!invitationForm.roleId) {
        throw new Error("Selecione um cargo para o convite.");
      }

      await createInvitation({
        email: invitationForm.email.trim(),
        roleId: invitationForm.roleId,
        ...(branchId ? { branchId } : {}),
      });
      setActionStatus("Convite criado com entrega de e-mail mock.");
      await refreshTeam();
      await refreshAuditEvents();
    });
  }

  function handleAssignUserRole() {
    void runAction(async () => {
      if (!userRoleForm.userId || !userRoleForm.roleId) {
        throw new Error("Selecione usuario e cargo.");
      }

      await assignUserRole(userRoleForm.userId, {
        roleId: userRoleForm.roleId,
        ...(branchId ? { branchId } : {}),
      });
      setActionStatus("Cargo do usuario atualizado com auditoria.");
      await refreshTeam();
      await refreshAuditEvents();
    });
  }

  function handleApplyAuditFilters() {
    void runAction(async () => {
      await refreshAuditEvents(auditFilters);
      setActionStatus("Filtros de auditoria aplicados.");
    });
  }

  function handleClearAuditFilters() {
    const nextFilters = defaultAuditFilters;
    setAuditFilters(nextFilters);
    void runAction(async () => {
      await refreshAuditEvents(nextFilters);
      setActionStatus("Filtros de auditoria limpos.");
    });
  }

  function handleOutboxStatusChange(statusFilter: OutboxStatusFilter) {
    setOutboxStatusFilter(statusFilter);
    if (status === "ready") {
      void runAction(async () => {
        await refreshOutbox(statusFilter);
        setActionStatus("Painel de outbox atualizado.");
      });
    }
  }

  async function handleCopyClubKey() {
    if (!generatedClubKey) {
      return;
    }

    await navigator.clipboard.writeText(generatedClubKey);
    setActionStatus("Chave do Dose Club copiada para a area de transferencia.");
  }

  function handleCreateCategory() {
    void runAction(async () => {
      await createCategory({
        ...(branchId ? { branchId } : {}),
        name: categoryForm.name,
        sortOrder: Number(categoryForm.sortOrder),
      });
      setActionStatus("Categoria cadastrada.");
      if (session) {
        await refreshRealtimeData(session);
      }
    });
  }

  function handleCreateProduct() {
    void runAction(async () => {
      await createProduct({
        ...(productForm.categoryId ? { categoryId: productForm.categoryId } : {}),
        name: productForm.name,
        description: productForm.description,
        priceCents: parseMoneyToCents(productForm.price),
        costCents: parseMoneyToCents(productForm.cost),
        channels: productForm.channels,
        isClubEligible: productForm.isClubEligible,
        ...(productForm.isClubEligible
          ? {
              bottleVolumeMl: Number(productForm.bottleVolumeMl),
              defaultDoseMl: Number(productForm.defaultDoseMl),
              spiritType: productForm.spiritType,
            }
          : {}),
        fiscalNcm: productForm.fiscalNcm,
        fiscalCfop: productForm.fiscalCfop,
        fiscalOrigin: productForm.fiscalOrigin,
        fiscalCsosn: productForm.fiscalCsosn,
      });
      setActionStatus("Produto cadastrado no catalogo.");
      if (session) {
        await refreshRealtimeData(session);
      }
    });
  }

  function handleIssueFiscal() {
    void runAction(async () => {
      if (!currentOrder) {
        throw new Error("Nenhum pedido aberto para emitir documento fiscal.");
      }
      const document = await issueFiscalDocument(currentOrder.id);
      setActionStatus(`Documento fiscal ${document.model.toUpperCase()} em fila.`);
      if (session) {
        await refreshFiscalDocuments(session);
      }
    });
  }

  function handleCancelFiscal(documentId: string) {
    void runAction(async () => {
      await cancelFiscalDocument(documentId);
      setActionStatus("Documento fiscal cancelado.");
      if (session) {
        await refreshFiscalDocuments(session);
      }
    });
  }

  function handleRetryFiscal(documentId: string) {
    void runAction(async () => {
      await retryFiscalDocument(documentId);
      setActionStatus("Documento fiscal reenfileirado.");
      if (session) {
        await refreshFiscalDocuments(session);
      }
    });
  }

  function handleCreateInventoryItem() {
    void runAction(async () => {
      await createInventoryItem({
        name: inventoryForm.name,
        unit: inventoryForm.unit,
        averageCostCents: parseMoneyToCents(inventoryForm.averageCost),
        minQuantity: inventoryForm.minQuantity,
        allowNegative: inventoryForm.allowNegative,
      });
      setActionStatus("Insumo cadastrado.");
      if (session) {
        await refreshInventory(session);
        await refreshCashSummary(session);
      }
    });
  }

  function handleAdjustStock() {
    void runAction(async () => {
      if (!branchId) {
        throw new Error("Filial ativa obrigatoria para ajuste de estoque.");
      }
      if (!stockAdjustmentForm.inventoryItemId) {
        throw new Error("Selecione um insumo para ajustar.");
      }
      await adjustInventoryStock({
        branchId,
        inventoryItemId: stockAdjustmentForm.inventoryItemId,
        quantity: stockAdjustmentForm.quantity,
        reason: stockAdjustmentForm.reason,
      });
      setActionStatus("Movimento de estoque registrado com auditoria.");
      if (session) {
        await refreshInventory(session);
        await refreshCashSummary(session);
      }
    });
  }

  function handleRetryPrint(jobId: string) {
    void runAction(async () => {
      await retryPrintJob(jobId);
      setActionStatus("Job de impressao reenfileirado.");
      if (session) {
        await refreshPrinting(session);
      }
    });
  }

  function handleReprint(jobId: string) {
    void runAction(async () => {
      await reprintPrintJob(jobId, "Reimpressao solicitada pelo painel operacional.");
      setActionStatus("Reimpressao adicionada a fila.");
      if (session) {
        await refreshPrinting(session);
      }
    });
  }

  function handleConfigurePrinterConnector(rotateKey: boolean) {
    void runAction(async () => {
      if (!branchId) {
        throw new Error("Filial ativa obrigatoria para provisionar o conector.");
      }
      const response = await configurePrinterConnector(branchId, rotateKey);
      setPrinterConnectorConfig(response);
      setGeneratedPrinterConnectorKey(response.apiKey ?? null);
      setActionStatus(
        response.apiKey
          ? "Token do conector gerado. Ele sera exibido somente agora."
          : "Conector local atualizado.",
      );
    });
  }

  function handleRevokePrinterConnector() {
    void runAction(async () => {
      const response = await revokePrinterConnector();
      setPrinterConnectorConfig(response);
      setGeneratedPrinterConnectorKey(null);
      setActionStatus("Token do conector local revogado.");
    });
  }

  function handleCreatePrinterDevice() {
    void runAction(async () => {
      if (!branchId) {
        throw new Error("Filial ativa obrigatoria para cadastrar impressora.");
      }

      await createPrinterDevice({
        branchId,
        name: printerForm.name,
        role: printerForm.role,
        connectionType: printerForm.connectionType,
        ...(printerForm.address ? { address: printerForm.address } : {}),
        port: Number(printerForm.port),
        paperWidth: Number(printerForm.paperWidth) as 58 | 80,
        charactersPerLine: Number(printerForm.charactersPerLine),
        config: {
          codepage: printerForm.codepage,
          cutMode: printerForm.cutMode,
          boldHeader: printerForm.boldHeader,
          beep: printerForm.beep,
          openDrawer: printerForm.openDrawer,
        },
      });
      setActionStatus("Impressora cadastrada.");
      if (session) {
        await refreshPrinting(session);
      }
    });
  }

  function handleCreatePrintRoute() {
    void runAction(async () => {
      if (!branchId) {
        throw new Error("Filial ativa obrigatoria para cadastrar rota.");
      }
      if (!printRouteForm.printerDeviceId) {
        throw new Error("Selecione uma impressora para a rota.");
      }

      await createPrintRoute({
        branchId,
        name: printRouteForm.name,
        trigger: "kds_ticket_created",
        targetType: printRouteForm.targetType,
        ...(printRouteForm.stationId ? { stationId: printRouteForm.stationId } : {}),
        printerDeviceId: printRouteForm.printerDeviceId,
        copies: Number(printRouteForm.copies),
      });
      setActionStatus("Rota de impressao cadastrada.");
      if (session) {
        await refreshPrinting(session);
      }
    });
  }

  async function handleCopyPrinterConnectorKey() {
    if (!generatedPrinterConnectorKey) {
      return;
    }

    await navigator.clipboard.writeText(generatedPrinterConnectorKey);
    setActionStatus("Token do conector copiado para a area de transferencia.");
  }

  return (
    <main
      className="app-layout"
      data-testid="demo-dashboard"
      data-theme={activeBranding.themeMode}
      data-accent={activeBranding.accentPreset}
      data-view={isPosWorkspace ? "pos" : "dashboard"}
    >
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="GiroMesa">
          <span className="brand-mark">G</span>
          <span>GiroMesa</span>
        </a>
        <div className="tenant-chip">
          {activeBranding.logoUrl ? (
            <span
              className="tenant-logo"
              style={{ backgroundImage: `url(${activeBranding.logoUrl})` }}
              aria-hidden="true"
            />
          ) : (
            <Store size={16} />
          )}
          <span>{activeBranding.displayName}</span>
        </div>
        <nav aria-label="Modulos">
          {visibleNav.map(({ icon: Icon, label, href }, index) => (
            <a
              className={(isPosWorkspace ? href.includes("view=pos") : index === 0) ? "active" : ""}
              href={href}
              key={label}
            >
              <Icon size={18} />
              {label}
            </a>
          ))}
        </nav>
      </aside>

      <section className="workspace">
        <header className="workspace-header">
          <div className="workspace-title">
            <span className="tenant-avatar">
              {activeBranding.logoUrl ? (
                <span
                  className="tenant-logo cover"
                  style={{ backgroundImage: `url(${activeBranding.logoUrl})` }}
                  aria-hidden="true"
                />
              ) : (
                brandingInitial
              )}
            </span>
            <div>
              <span className="section-kicker">Unidade Centro</span>
              <h1>{isPosWorkspace ? "PDV do turno" : "Visão do turno"}</h1>
              <p>
                {isPosWorkspace
                  ? "Atendimento rápido, pedido, produção e recebimento em uma única superfície."
                  : `${activeBranding.displayName} · gestão em tempo real, sem misturar a operação de caixa.`}
              </p>
            </div>
          </div>
          <div className="toolbar">
            <a className="button secondary" href="/login">
              <Bell size={18} /> {status === "ready" ? "Sessao ativa" : "Entrar demo"}
            </a>
            <a className="button primary" href="/app?view=pos" data-testid="open-pos">
              <BadgeDollarSign size={18} /> Abrir PDV
            </a>
          </div>
        </header>

        <section className={`live-banner live-banner-${status}`}>
          <strong>{readStatusTitle(status)}</strong>
          <span>{actionStatus}</span>
        </section>

        {!isPosWorkspace ? (
          <section className="profile-action-strip" aria-label="Atalhos por perfil">
            <div>
              <span className="section-kicker">{operatorProfile.kicker}</span>
              <strong>{operatorProfile.title}</strong>
              <p>{operatorProfile.description}</p>
            </div>
            <div className="profile-action-buttons">
              {operatorProfile.actions.map((action) => (
                <a className="button secondary" href={action.href} key={action.href}>
                  {action.label}
                </a>
              ))}
            </div>
          </section>
        ) : null}

        <section
          className={isPosWorkspace ? "metrics compact" : "metrics compact dashboard-metrics"}
        >
          {metrics.map(([label, value, hint], index) => (
            <article className="metric" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <Badge tone={index === 1 ? "info" : index === 3 ? "good" : "neutral"}>{hint}</Badge>
            </article>
          ))}
        </section>

        {!isPosWorkspace ? (
          <section className="dashboard-command-center" aria-label="Prioridades do turno">
            <article className="dashboard-focus-card">
              <span className="section-kicker">Atendimento</span>
              <strong>{activeOrderCount} pedido(s) em andamento</strong>
              <p>Abra o PDV para atender mesas, balcão e pagamentos sem distrair a gestão.</p>
              <a className="button primary compact" href="/app?view=pos">
                Ir para o PDV <BadgeDollarSign size={15} />
              </a>
            </article>
            <article className="dashboard-focus-card">
              <span className="section-kicker">Produção</span>
              <strong>{tickets.length} ticket(s) em acompanhamento</strong>
              <p>
                {tickets.length
                  ? "Acompanhe cozinha e bar antes de criar novo gargalo."
                  : "Nenhuma fila crítica no KDS agora."}
              </p>
              <a className="button secondary compact" href="/app/waiter">
                Acompanhar salão
              </a>
            </article>
            <article className="dashboard-focus-card">
              <span className="section-kicker">Gestão</span>
              <strong>{inventoryAlerts.length} alerta(s) de estoque</strong>
              <p>
                Relatórios, caixa e pendências administrativas ficam disponíveis sem poluir o turno.
              </p>
              <a className="button secondary compact" href="/app/reports">
                Ver relatórios
              </a>
            </article>
          </section>
        ) : null}

        {isPosWorkspace ? (
          <section className="ops-grid">
            <article className="panel pos-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">PDV rapido</span>
                  <h2>{selectedTable ? `Mesa ${selectedTable.code}` : "Balcao"}</h2>
                </div>
                <Badge tone={currentOrder ? "good" : "warn"}>{orderStatus}</Badge>
              </div>
              <div className="pos-surface">
                <div className="product-grid">
                  {products.slice(0, 4).map((product, index) => (
                    <button
                      className={
                        product.id === selectedProductId ? "product-tile selected" : "product-tile"
                      }
                      type="button"
                      key={product.id}
                      data-testid={index === 0 ? "pos-add-item" : undefined}
                      onClick={() => handleAddItem(product)}
                      disabled={isBusy}
                    >
                      <span>{readCategoryLabel(product)}</span>
                      <strong>{product.name}</strong>
                      <small>
                        {formatMoney(product.priceCents)} - {readPrepTime(product.name)}
                      </small>
                    </button>
                  ))}
                </div>
                <div className="ticket-preview">
                  <div className="ticket-head">
                    <ReceiptText size={18} />
                    <strong>Comanda #{selectedTable?.code ?? "Balcao"}</strong>
                  </div>
                  <label className="pos-customer-select">
                    Cliente
                    <select
                      value={selectedCustomerId}
                      onChange={(event) => {
                        const customerId = event.target.value;
                        setSelectedCustomerId(customerId);
                        if (currentOrder && customerId) {
                          void runAction(async () => {
                            await assignOrderCustomer(currentOrder.id, customerId);
                            setActionStatus("Cliente vinculado à comanda.");
                          });
                        }
                      }}
                    >
                      <option value="">Consumidor não identificado</option>
                      {posCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                    </select>
                  </label>
                  <div className="ticket-lines">
                    {(ticketItems.length > 0 ? ticketItems : demoTicketLines()).map((item) => (
                      <div className="ticket-line" key={item.id}>
                        <strong>{readQuantity(item.quantity)}</strong>
                        <span>{item.nameSnapshot}</span>
                        <small>
                          {ticketItems.length > 0
                            ? "Lancado no pedido real"
                            : "Item ilustrativo demo"}
                        </small>
                      </div>
                    ))}
                  </div>
                  <div className="ticket-total">
                    <span>Total parcial</span>
                    <strong>{formatMoney(ticketItems.length > 0 ? orderTotalCents : 10000)}</strong>
                  </div>
                  <div className="payment-setup-grid">
                    <label>
                      Metodo
                      <select
                        value={paymentMethod}
                        onChange={(event) =>
                          setPaymentMethod(
                            event.target.value as (typeof paymentMethodOptions)[number][0],
                          )
                        }
                      >
                        {paymentMethodOptions.map(([value, label]) => (
                          <option value={value} key={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tipo
                      <select
                        value={paymentAmountMode}
                        onChange={(event) =>
                          setPaymentAmountMode(
                            event.target.value as "remaining" | "half" | "custom",
                          )
                        }
                      >
                        <option value="remaining">Quitar saldo</option>
                        <option value="half">Metade do saldo</option>
                        <option value="custom">Valor customizado</option>
                      </select>
                    </label>
                    <label>
                      Valor
                      <input
                        inputMode="decimal"
                        value={
                          paymentAmountMode === "custom"
                            ? customPaymentAmount
                            : (suggestedPaymentAmountCents / 100).toFixed(2).replace(".", ",")
                        }
                        onChange={(event) => setCustomPaymentAmount(event.target.value)}
                        disabled={paymentAmountMode !== "custom"}
                      />
                    </label>
                  </div>
                  <div className="payment-breakdown">
                    <div>
                      <span>Pago</span>
                      <strong>{formatMoney(paidOrderTotalCents)}</strong>
                    </div>
                    <div>
                      <span>Restante</span>
                      <strong>{formatMoney(remainingOrderTotalCents)}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{orderStatus}</strong>
                    </div>
                  </div>
                  <div className="ticket-actions">
                    <button
                      className="button secondary"
                      type="button"
                      data-testid="send-kds"
                      onClick={handleSendToKitchen}
                      disabled={isBusy}
                    >
                      <ChefHat size={17} /> Enviar
                    </button>
                    <button
                      className="button primary"
                      type="button"
                      data-testid="payment-complete"
                      onClick={handlePayment}
                      disabled={isBusy || !currentOrder || remainingOrderTotalCents <= 0}
                    >
                      <Banknote size={17} /> Receber
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={handleExportPaymentReceipt}
                      disabled={isBusy || !lastPaymentReceipt || !currentOrder}
                    >
                      <FileText size={17} /> Comprovante
                    </button>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={handlePrintPaymentReceipt}
                      disabled={isBusy || !lastPaymentReceipt || !currentOrder}
                    >
                      <Printer size={17} /> Comprovante fisico
                    </button>
                  </div>
                  {orderPayments.length > 0 ? (
                    <div className="payment-ledger">
                      {orderPayments.slice(0, 4).map((payment) => (
                        <div className="status-row rich" key={payment.id}>
                          <div>
                            <strong>{payment.method}</strong>
                            <span>
                              {payment.confirmedAt
                                ? new Date(payment.confirmedAt).toLocaleString("pt-BR")
                                : "sem confirmacao"}
                            </span>
                          </div>
                          <small>{formatMoney(payment.amountCents)}</small>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </article>

            <article className="panel catalog-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Catalogo</span>
                  <h2>Produtos e categorias</h2>
                </div>
                <Badge tone="info">{products.length} itens</Badge>
              </div>
              <div className="hardware-forms">
                <form
                  className="hardware-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreateCategory();
                  }}
                >
                  <strong>Nova categoria</strong>
                  <label>
                    Nome
                    <input
                      value={categoryForm.name}
                      onChange={(event) =>
                        setCategoryForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Ordem
                    <input
                      inputMode="numeric"
                      value={categoryForm.sortOrder}
                      onChange={(event) =>
                        setCategoryForm((current) => ({
                          ...current,
                          sortOrder: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <button className="button secondary full" type="submit" disabled={isBusy}>
                    <ClipboardList size={17} /> Cadastrar categoria
                  </button>
                </form>

                <form
                  className="hardware-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreateProduct();
                  }}
                >
                  <strong>Novo produto</strong>
                  <div className="form-grid-compact">
                    <label>
                      Nome
                      <input
                        value={productForm.name}
                        onChange={(event) =>
                          setProductForm((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Categoria
                      <select
                        value={productForm.categoryId}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            categoryId: event.target.value,
                          }))
                        }
                      >
                        <option value="">Sem categoria</option>
                        {categories.map((category) => (
                          <option value={category.id} key={category.id}>
                            {category.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    Descricao
                    <input
                      value={productForm.description}
                      onChange={(event) =>
                        setProductForm((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="form-grid-compact">
                    <label>
                      Preco
                      <input
                        inputMode="decimal"
                        value={productForm.price}
                        onChange={(event) =>
                          setProductForm((current) => ({ ...current, price: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Custo
                      <input
                        inputMode="decimal"
                        value={productForm.cost}
                        onChange={(event) =>
                          setProductForm((current) => ({ ...current, cost: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="check-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={productForm.channels.includes("pos")}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            channels: toggleValue(current.channels, "pos", event.target.checked),
                          }))
                        }
                      />
                      PDV
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={productForm.channels.includes("qr")}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            channels: toggleValue(current.channels, "qr", event.target.checked),
                          }))
                        }
                      />
                      QR
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={productForm.isClubEligible}
                        onChange={(event) =>
                          setProductForm((current) => ({
                            ...current,
                            isClubEligible: event.target.checked,
                          }))
                        }
                      />
                      Dose Club
                    </label>
                  </div>
                  {productForm.isClubEligible ? (
                    <div className="form-grid-compact">
                      <label>
                        Garrafa ml
                        <input
                          inputMode="numeric"
                          value={productForm.bottleVolumeMl}
                          onChange={(event) =>
                            setProductForm((current) => ({
                              ...current,
                              bottleVolumeMl: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Dose ml
                        <input
                          inputMode="numeric"
                          value={productForm.defaultDoseMl}
                          onChange={(event) =>
                            setProductForm((current) => ({
                              ...current,
                              defaultDoseMl: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                  ) : null}
                  <button className="button primary full" type="submit" disabled={isBusy}>
                    <PackageOpen size={17} /> Cadastrar produto
                  </button>
                </form>
              </div>
            </article>

            <article className="panel floor-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Salao</span>
                  <h2>Mapa de mesas</h2>
                </div>
                <Badge tone="info">{tables.length} mesas</Badge>
              </div>
              <div className="floor-grid">
                {tables.slice(0, 8).map((table, index) => (
                  <button
                    className={`table-tile table-${table.status} ${table.id === selectedTableId ? "selected-table" : ""}`}
                    type="button"
                    key={table.id}
                    data-testid={index === 1 ? "pos-open-table" : undefined}
                    onClick={() => {
                      setSelectedTableId(table.id);
                      setActionStatus(`${table.code} selecionada para o proximo pedido.`);
                    }}
                  >
                    <strong>{table.code}</strong>
                    <span>{table.seats} lugares</span>
                    <small>{readTableDetail(table)}</small>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel qr-ops-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Cardapio QR</span>
                  <h2>Pedidos recebidos</h2>
                </div>
                <div className="qr-panel-badges">
                  <span className={`realtime-pill realtime-pill-${realtimeStatus}`}>
                    {readRealtimeStatus(realtimeStatus)}
                  </span>
                  <Badge tone={qrPendingOrders.length > 0 ? "warn" : "good"}>
                    {qrPendingOrders.length > 0
                      ? `${qrPendingOrders.length} pendente(s)`
                      : "sem fila"}
                  </Badge>
                </div>
              </div>
              {qrAlert ? (
                <div className="qr-alert" role="status">
                  <Bell size={16} />
                  <span>{qrAlert}</span>
                  <button className="icon-button" type="button" onClick={() => setQrAlert(null)}>
                    <X size={16} />
                  </button>
                </div>
              ) : null}
              <div className="qr-review-layout">
                {qrPendingOrders.length > 0 ? (
                  <>
                    <div className="qr-order-list">
                      {qrPendingOrders.slice(0, 6).map((order) => (
                        <button
                          className={`qr-order-chip ${
                            order.id === selectedQrOrder?.id ? "selected" : ""
                          }`}
                          type="button"
                          key={order.id}
                          onClick={() => setSelectedQrOrderId(order.id)}
                        >
                          <strong>{readQrOrderLabel(order)}</strong>
                          <span>{readQrOrderSummary(order)}</span>
                          <small>{formatMoney(order.totalCents)}</small>
                        </button>
                      ))}
                    </div>
                    {selectedQrOrder ? (
                      <div className="qr-review-card">
                        <div className="qr-review-head">
                          <div>
                            <strong>{readQrOrderLabel(selectedQrOrder)}</strong>
                            <span>{readRelativeTime(selectedQrOrder.createdAt)}</span>
                          </div>
                          <Badge tone="info">{formatMoney(selectedQrOrder.totalCents)}</Badge>
                        </div>
                        <div className="qr-review-items">
                          {selectedQrOrder.items.map((item) => {
                            const draft = qrItemDrafts[item.id] ?? {
                              quantity: String(Number(item.quantity)),
                              notes: item.notes ?? "",
                            };
                            return (
                              <div className="qr-review-item" key={item.id}>
                                <div>
                                  <strong>{item.nameSnapshot}</strong>
                                  <span>{formatMoney(item.totalCents)}</span>
                                </div>
                                <label>
                                  Qtd.
                                  <input
                                    inputMode="decimal"
                                    value={draft.quantity}
                                    onChange={(event) =>
                                      setQrItemDrafts((current) => ({
                                        ...current,
                                        [item.id]: { ...draft, quantity: event.target.value },
                                      }))
                                    }
                                  />
                                </label>
                                <label className="qr-note-field">
                                  Observacao
                                  <input
                                    value={draft.notes}
                                    onChange={(event) =>
                                      setQrItemDrafts((current) => ({
                                        ...current,
                                        [item.id]: { ...draft, notes: event.target.value },
                                      }))
                                    }
                                  />
                                </label>
                                <div className="qr-item-actions">
                                  <button
                                    className="button secondary compact"
                                    type="button"
                                    disabled={!isApiReady || isBusy}
                                    onClick={() => handleUpdateQrItem(selectedQrOrder, item.id)}
                                  >
                                    Salvar
                                  </button>
                                  <button
                                    className="button ghost compact"
                                    type="button"
                                    disabled={!isApiReady || isBusy}
                                    onClick={() => handleCancelQrItem(selectedQrOrder, item.id)}
                                  >
                                    Cancelar item
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <label className="qr-reject-field">
                          Motivo da recusa
                          <input
                            value={qrRejectReason}
                            onChange={(event) => setQrRejectReason(event.target.value)}
                          />
                        </label>
                        <div className="ticket-actions">
                          <button
                            className="button secondary"
                            type="button"
                            disabled={!isApiReady || isBusy}
                            onClick={() => handleRejectQrOrder(selectedQrOrder)}
                          >
                            Recusar
                          </button>
                          <button
                            className="button primary"
                            type="button"
                            disabled={!isApiReady || isBusy}
                            onClick={() => handleSendQrOrderToKitchen(selectedQrOrder)}
                          >
                            <ChefHat size={16} />
                            Enviar KDS
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="empty-state">
                    <strong>Nenhum pedido QR aguardando</strong>
                    <span>Quando o cliente enviar pelo QR, ele aparece aqui para conferencia.</span>
                  </div>
                )}
              </div>
            </article>

            <article className="panel table-history-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Historico da mesa</span>
                  <h2>{selectedTable ? selectedTable.code : "Mesa"}</h2>
                </div>
                <Badge tone={filteredTableHistory.length > 0 ? "info" : "neutral"}>
                  {filteredTableHistory.length > 0
                    ? `${filteredTableHistory.length} evento(s)`
                    : "sem eventos"}
                </Badge>
              </div>
              <div className="history-tools">
                <label className="history-search">
                  <Search size={16} />
                  <input
                    value={historyQuery}
                    onChange={(event) => setHistoryQuery(event.target.value)}
                    placeholder="Buscar historico"
                  />
                </label>
                <select
                  value={historyFilter}
                  onChange={(event) => setHistoryFilter(event.target.value as HistoryFilter)}
                >
                  <option value="all">Todos</option>
                  <option value="qr">QR</option>
                  <option value="kds">KDS</option>
                  <option value="payments">Pagamentos</option>
                  <option value="ops">Operacao</option>
                </select>
              </div>
              <div className="timeline-list">
                {filteredTableHistory.length > 0 ? (
                  filteredTableHistory.slice(0, 8).map((event) => (
                    <div className="timeline-row" key={event.id}>
                      <span className="timeline-dot" />
                      <div>
                        <strong>{readHistoryActionLabel(event.action)}</strong>
                        <span>{readHistoryDetail(event)}</span>
                      </div>
                      <small>
                        {readHistoryOperator(event)} - {readRelativeTime(event.createdAt)}
                      </small>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <strong>Nenhum evento encontrado</strong>
                    <span>Ajuste a busca ou o filtro para ver outros registros da mesa.</span>
                  </div>
                )}
              </div>
            </article>

            <article className="panel permissions-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Permissoes</span>
                  <h2>Cargos e acessos</h2>
                </div>
                <ShieldCheck size={20} />
              </div>
              <div className="role-shell">
                <div className="role-list">
                  {roles.map((role) => (
                    <button
                      className={`role-chip ${role.id === selectedRole?.id ? "selected" : ""}`}
                      key={role.id}
                      type="button"
                      onClick={() => setSelectedRoleId(role.id)}
                    >
                      <strong>{role.name}</strong>
                      <span>{role.permissions.length} permissoes</span>
                    </button>
                  ))}
                </div>
                <div className="permission-card">
                  {selectedRole ? (
                    <>
                      <div className="permission-head">
                        <div>
                          <strong>{selectedRole.name}</strong>
                          <span>{selectedRole.code}</span>
                        </div>
                        <Badge tone="info">{selectedRole.permissions.length} ativas</Badge>
                      </div>
                      <div className="permission-groups">
                        {permissionGroups.map((group) => (
                          <div className="permission-group" key={group.title}>
                            <span>{group.title}</span>
                            {group.items.map(([permission, label]) => (
                              <label className="permission-toggle" key={permission}>
                                <input
                                  type="checkbox"
                                  checked={selectedRole.permissions.includes(permission)}
                                  onChange={() => handleTogglePermission(selectedRole, permission)}
                                  disabled={isBusy}
                                />
                                <span>{label}</span>
                                <code>{permission}</code>
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="empty-state">
                      <strong>Nenhum cargo encontrado</strong>
                      <span>Cadastre ou sincronize cargos para configurar o RBAC.</span>
                    </div>
                  )}
                </div>
              </div>
            </article>

            <article className="panel team-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Equipe</span>
                  <h2>Usuarios e convites</h2>
                </div>
                <div className="team-row-actions">
                  <a className="button ghost compact" href="/app/security">
                    <ShieldCheck size={15} /> Seguranca
                  </a>
                  <a className="button ghost compact" href="/app/team">
                    <Users size={15} /> Abrir
                  </a>
                </div>
              </div>
              <div className="team-forms">
                <form
                  className="team-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreateInvitation();
                  }}
                >
                  <label>
                    E-mail do convite
                    <input
                      type="email"
                      value={invitationForm.email}
                      onChange={(event) =>
                        setInvitationForm((current) => ({
                          ...current,
                          email: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    Cargo
                    <select
                      value={invitationForm.roleId}
                      onChange={(event) =>
                        setInvitationForm((current) => ({
                          ...current,
                          roleId: event.target.value,
                        }))
                      }
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button secondary compact" type="submit" disabled={isBusy}>
                    <KeyRound size={15} /> Convidar
                  </button>
                </form>
                <form
                  className="team-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleAssignUserRole();
                  }}
                >
                  <label>
                    Usuario
                    <select
                      value={userRoleForm.userId}
                      onChange={(event) =>
                        setUserRoleForm((current) => ({
                          ...current,
                          userId: event.target.value,
                        }))
                      }
                    >
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Novo cargo
                    <select
                      value={userRoleForm.roleId}
                      onChange={(event) =>
                        setUserRoleForm((current) => ({
                          ...current,
                          roleId: event.target.value,
                        }))
                      }
                    >
                      {roles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button primary compact" type="submit" disabled={isBusy}>
                    <ShieldCheck size={15} /> Aplicar
                  </button>
                </form>
              </div>
              <div className="team-list">
                {users.slice(0, 4).map((user) => (
                  <div className="team-row" key={user.id}>
                    <div>
                      <strong>{user.name}</strong>
                      <span>{user.email}</span>
                    </div>
                    <Badge tone={user.isActive ? "good" : "danger"}>
                      {user.roles[0]?.name ?? "sem cargo"}
                    </Badge>
                  </div>
                ))}
                {invitations.slice(0, 3).map((invitation) => (
                  <div className="team-row" key={invitation.id}>
                    <div>
                      <strong>{invitation.email}</strong>
                      <span>Convite para {invitation.roleName ?? "cargo pendente"}</span>
                    </div>
                    <Badge tone={invitation.status === "pending" ? "warn" : "neutral"}>
                      {invitation.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel outbox-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Outbox</span>
                  <h2>Eventos de integracao</h2>
                </div>
                <Gauge size={20} />
              </div>
              <div className="outbox-toolbar">
                <select
                  value={outboxStatusFilter}
                  onChange={(event) =>
                    handleOutboxStatusChange(event.target.value as OutboxStatusFilter)
                  }
                >
                  <option value="all">Todos</option>
                  <option value="pending">Pendentes</option>
                  <option value="processed">Processados</option>
                  <option value="failed">Com erro</option>
                </select>
                <button
                  className="button secondary compact"
                  type="button"
                  onClick={() => handleOutboxStatusChange(outboxStatusFilter)}
                  disabled={isBusy}
                >
                  <RotateCw size={15} /> Atualizar
                </button>
              </div>
              <div className="outbox-list">
                {(outboxEvents.length > 0 ? outboxEvents : demoOutboxEvents)
                  .slice(0, 6)
                  .map((event) => (
                    <div className="outbox-row" key={event.id}>
                      <div>
                        <strong>{event.topic}</strong>
                        <span>{readOutboxPayloadSummary(event)}</span>
                      </div>
                      <Badge tone={readOutboxTone(event.status)}>{readOutboxStatus(event)}</Badge>
                      <small>{readRelativeTime(event.createdAt)}</small>
                    </div>
                  ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Cozinha e bar</span>
                  <h2>Fila KDS</h2>
                </div>
                <Badge tone={tickets.length > 0 ? "danger" : "good"}>
                  {tickets.length > 0 ? `${tickets.length} tickets` : "sem fila"}
                </Badge>
              </div>
              <div className="status-list">
                {tickets.slice(0, 4).map((ticket, index) => (
                  <div className="status-row rich" key={ticket.id} data-testid="kds-ticket">
                    <div>
                      <strong>{readTicketCode(ticket)}</strong>
                      <span>
                        {ticket.stationName} - {readTicketSummary(ticket)}
                      </span>
                    </div>
                    <Badge tone={readTicketTone(ticket.status)}>{ticket.status}</Badge>
                    <small className={index === 0 ? "danger-text" : ""}>
                      {index === 0 ? "agora" : `${index + 3} min`}
                    </small>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel print-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Impressao</span>
                  <h2>Comandas termicas</h2>
                </div>
                <Badge tone={readPrintBadgeTone(printJobs)}>{readPrintSummary(printJobs)}</Badge>
              </div>
              <div className="integration-list">
                <div>
                  <span>Impressoras ativas</span>
                  <strong>{printerDevices.filter((device) => device.isActive).length}</strong>
                </div>
                <div>
                  <span>Rotas configuradas</span>
                  <strong>{printRoutes.filter((route) => route.isActive).length}</strong>
                </div>
                <div>
                  <span>Conector local</span>
                  <strong>
                    {printerConnectorConfig.hasApiKey
                      ? `${printerConnectorConfig.online ? "online" : "offline"} ${
                          printerConnectorConfig.apiKeyLastFour
                        }`
                      : "sem token"}
                  </strong>
                </div>
                <div>
                  <span>Ultima conexao</span>
                  <strong>{readConnectorLastSeen(printerConnectorConfig.lastSyncAt)}</strong>
                </div>
                <div>
                  <span>Versao</span>
                  <strong>{readConnectorHeartbeatValue(printerConnectorConfig, "version")}</strong>
                </div>
                <div>
                  <span>Host</span>
                  <strong>{readConnectorHeartbeatValue(printerConnectorConfig, "hostname")}</strong>
                </div>
              </div>
              {generatedPrinterConnectorKey ? (
                <div className="secret-box">
                  <span>Token exibido uma unica vez</span>
                  <code>{generatedPrinterConnectorKey}</code>
                  <button
                    className="icon-button"
                    type="button"
                    onClick={handleCopyPrinterConnectorKey}
                  >
                    <Copy size={16} />
                  </button>
                </div>
              ) : null}
              <div className="hardware-forms">
                <form
                  className="hardware-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreatePrinterDevice();
                  }}
                >
                  <strong>Nova impressora</strong>
                  <label>
                    Nome
                    <input
                      value={printerForm.name}
                      onChange={(event) =>
                        setPrinterForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <div className="form-grid-compact">
                    <label>
                      Funcao
                      <select
                        value={printerForm.role}
                        onChange={(event) =>
                          setPrinterForm((current) => ({ ...current, role: event.target.value }))
                        }
                      >
                        <option value="kitchen">Cozinha</option>
                        <option value="bar">Bar</option>
                        <option value="cashier">Caixa</option>
                        <option value="conference">Conferencia</option>
                        <option value="fiscal">Fiscal</option>
                      </select>
                    </label>
                    <label>
                      Papel
                      <select
                        value={printerForm.paperWidth}
                        onChange={(event) =>
                          setPrinterForm((current) => ({
                            ...current,
                            paperWidth: event.target.value,
                            charactersPerLine: event.target.value === "58" ? "32" : "48",
                          }))
                        }
                      >
                        <option value="80">80mm</option>
                        <option value="58">58mm</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-grid-compact">
                    <label>
                      IP/host
                      <input
                        value={printerForm.address}
                        onChange={(event) =>
                          setPrinterForm((current) => ({ ...current, address: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Porta
                      <input
                        inputMode="numeric"
                        value={printerForm.port}
                        onChange={(event) =>
                          setPrinterForm((current) => ({ ...current, port: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="form-grid-compact">
                    <label>
                      Codepage
                      <select
                        value={printerForm.codepage}
                        onChange={(event) =>
                          setPrinterForm((current) => ({
                            ...current,
                            codepage: event.target.value,
                          }))
                        }
                      >
                        <option value="cp850">CP850</option>
                        <option value="cp860">CP860</option>
                        <option value="cp1252">Windows-1252</option>
                      </select>
                    </label>
                    <label>
                      Corte
                      <select
                        value={printerForm.cutMode}
                        onChange={(event) =>
                          setPrinterForm((current) => ({ ...current, cutMode: event.target.value }))
                        }
                      >
                        <option value="partial">Parcial</option>
                        <option value="full">Total</option>
                      </select>
                    </label>
                  </div>
                  <div className="check-row">
                    <label>
                      <input
                        type="checkbox"
                        checked={printerForm.boldHeader}
                        onChange={(event) =>
                          setPrinterForm((current) => ({
                            ...current,
                            boldHeader: event.target.checked,
                          }))
                        }
                      />
                      Cabecalho em negrito
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={printerForm.beep}
                        onChange={(event) =>
                          setPrinterForm((current) => ({ ...current, beep: event.target.checked }))
                        }
                      />
                      Beep
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={printerForm.openDrawer}
                        onChange={(event) =>
                          setPrinterForm((current) => ({
                            ...current,
                            openDrawer: event.target.checked,
                          }))
                        }
                      />
                      Gaveta
                    </label>
                  </div>
                  <button className="button secondary full" type="submit" disabled={isBusy}>
                    <Printer size={17} /> Cadastrar impressora
                  </button>
                </form>

                <form
                  className="hardware-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreatePrintRoute();
                  }}
                >
                  <strong>Nova rota</strong>
                  <label>
                    Nome
                    <input
                      value={printRouteForm.name}
                      onChange={(event) =>
                        setPrintRouteForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    Estacao KDS
                    <select
                      value={printRouteForm.stationId}
                      onChange={(event) =>
                        setPrintRouteForm((current) => ({
                          ...current,
                          stationId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Todas</option>
                      {kdsStations.map((station) => (
                        <option value={station.id} key={station.id}>
                          {station.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Impressora
                    <select
                      value={printRouteForm.printerDeviceId}
                      onChange={(event) =>
                        setPrintRouteForm((current) => ({
                          ...current,
                          printerDeviceId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione</option>
                      {printerDevices.map((device) => (
                        <option value={device.id} key={device.id}>
                          {device.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid-compact">
                    <label>
                      Tipo
                      <select
                        value={printRouteForm.targetType}
                        onChange={(event) =>
                          setPrintRouteForm((current) => ({
                            ...current,
                            targetType: event.target.value,
                          }))
                        }
                      >
                        <option value="kitchen_ticket">Cozinha</option>
                        <option value="bar_ticket">Bar</option>
                        <option value="bill_preview">Conferencia</option>
                        <option value="cash_summary">Caixa</option>
                        <option value="payment_receipt">Comprovante</option>
                      </select>
                    </label>
                    <label>
                      Vias
                      <input
                        inputMode="numeric"
                        value={printRouteForm.copies}
                        onChange={(event) =>
                          setPrintRouteForm((current) => ({
                            ...current,
                            copies: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <button className="button secondary full" type="submit" disabled={isBusy}>
                    <ClipboardList size={17} /> Cadastrar rota
                  </button>
                </form>
              </div>
              <div className="status-list">
                {printJobs.slice(0, 3).map((job) => (
                  <div className="status-row rich" key={job.id}>
                    <div>
                      <strong>{job.printerName ?? "Sem impressora"}</strong>
                      <span>
                        {readPrintKind(job.kind)} - {job.orderId?.slice(0, 8) ?? "sem pedido"}
                      </span>
                    </div>
                    <Badge tone={readPrintTone(job.status)}>{readPrintStatus(job.status)}</Badge>
                    <small>{job.copies} via(s)</small>
                  </div>
                ))}
              </div>
              <div className="ticket-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => handleConfigurePrinterConnector(false)}
                  disabled={isBusy || !branchId}
                >
                  <KeyRound size={17} /> Token
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => handleConfigurePrinterConnector(true)}
                  disabled={isBusy || !branchId}
                >
                  <RotateCw size={17} /> Rotacionar
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={handleRevokePrinterConnector}
                  disabled={isBusy || !printerConnectorConfig.hasApiKey}
                >
                  <ShieldCheck size={17} /> Revogar
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={handlePrintBillPreview}
                  disabled={isBusy || !currentOrder}
                >
                  <ReceiptText size={17} /> Pre-conta
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={handleExportBillDocument}
                  disabled={isBusy || !currentOrder}
                >
                  <FileText size={17} /> Pre-conta PDF
                </button>
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => printJobs[0] && handleRetryPrint(printJobs[0].id)}
                  disabled={
                    isBusy || !printJobs[0] || !["failed", "canceled"].includes(printJobs[0].status)
                  }
                >
                  <RotateCw size={17} /> Retry
                </button>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => printJobs[0] && handleReprint(printJobs[0].id)}
                  disabled={isBusy || !printJobs[0]}
                >
                  <Printer size={17} /> Reimprimir
                </button>
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Estoque</span>
                  <h2>Ficha tecnica e saldos</h2>
                </div>
                <Badge tone={inventoryAlerts.length > 0 ? "danger" : "warn"}>
                  {inventoryAlerts.length > 0
                    ? `${inventoryAlerts.length} alerta(s)`
                    : `${inventorySummary.length} insumos`}
                </Badge>
              </div>
              <div className="hardware-forms">
                <form
                  className="hardware-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreateInventoryItem();
                  }}
                >
                  <strong>Novo insumo</strong>
                  <div className="form-grid-compact">
                    <label>
                      Nome
                      <input
                        value={inventoryForm.name}
                        onChange={(event) =>
                          setInventoryForm((current) => ({ ...current, name: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      Unidade
                      <input
                        value={inventoryForm.unit}
                        onChange={(event) =>
                          setInventoryForm((current) => ({ ...current, unit: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                  <div className="form-grid-compact">
                    <label>
                      Custo medio
                      <input
                        inputMode="decimal"
                        value={inventoryForm.averageCost}
                        onChange={(event) =>
                          setInventoryForm((current) => ({
                            ...current,
                            averageCost: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Minimo
                      <input
                        inputMode="decimal"
                        value={inventoryForm.minQuantity}
                        onChange={(event) =>
                          setInventoryForm((current) => ({
                            ...current,
                            minQuantity: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <button className="button secondary full" type="submit" disabled={isBusy}>
                    <PackageOpen size={17} /> Cadastrar insumo
                  </button>
                </form>
                <form
                  className="hardware-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleAdjustStock();
                  }}
                >
                  <strong>Ajuste auditado</strong>
                  <label>
                    Insumo
                    <select
                      value={stockAdjustmentForm.inventoryItemId}
                      onChange={(event) =>
                        setStockAdjustmentForm((current) => ({
                          ...current,
                          inventoryItemId: event.target.value,
                        }))
                      }
                    >
                      <option value="">Selecione</option>
                      {inventorySummary.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-grid-compact">
                    <label>
                      Quantidade
                      <input
                        inputMode="decimal"
                        value={stockAdjustmentForm.quantity}
                        onChange={(event) =>
                          setStockAdjustmentForm((current) => ({
                            ...current,
                            quantity: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Motivo
                      <input
                        value={stockAdjustmentForm.reason}
                        onChange={(event) =>
                          setStockAdjustmentForm((current) => ({
                            ...current,
                            reason: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <button className="button secondary full" type="submit" disabled={isBusy}>
                    <ShieldCheck size={17} /> Registrar movimento
                  </button>
                </form>
              </div>
              {inventoryAlerts.length > 0 ? (
                <div className="inventory-alerts">
                  {inventoryAlerts.slice(0, 3).map((alert) => (
                    <div className="inventory-row" key={alert.id}>
                      <div>
                        <strong>{alert.name}</strong>
                        <span>
                          {alert.status === "negative" ? "Saldo negativo" : "Abaixo do minimo"} -
                          falta {alert.shortage.toFixed(3)} {alert.unit}
                        </span>
                      </div>
                      <Badge tone="danger">
                        {alert.quantity} / {alert.minQuantity}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="inventory-list">
                {(inventorySummary.length > 0 ? inventorySummary : demoInventoryRows()).map(
                  (item) => {
                    const current = Number(item.quantity);
                    const minimum = Number(item.minQuantity);
                    return (
                      <div className="inventory-row" key={item.id}>
                        <div>
                          <strong>{item.name}</strong>
                          <span>
                            Minimo {item.minQuantity} {item.unit}
                          </span>
                        </div>
                        <Badge tone={current < minimum ? "danger" : "good"}>
                          {item.quantity} {item.unit}
                        </Badge>
                      </div>
                    );
                  },
                )}
              </div>
            </article>

            <article className="panel cash-panel" id="caixa">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Caixa</span>
                  <h2>Conferencia do turno</h2>
                </div>
                <Badge tone={cashReadiness.tone}>{cashSummary?.session?.status ?? "demo"}</Badge>
              </div>
              <div className="cash-readiness-card">
                <div>
                  <strong>{cashReadiness.title}</strong>
                  <span>{cashReadiness.detail}</span>
                </div>
                <Badge tone={cashReadiness.tone}>fechamento</Badge>
              </div>
              <div className="cash-grid">
                <span>Esperado</span>
                <strong>{formatMoney(cashExpectedCents)}</strong>
                <span>Recebido no turno</span>
                <strong>{formatMoney(cashReceivedCents)}</strong>
                <span>Pedidos abertos</span>
                <strong>
                  {cashSummary
                    ? `${cashOpenOrdersCount} - ${formatMoney(cashOpenOrdersCents)}`
                    : orderStatus}
                </strong>
                <span>Diferença</span>
                <strong>
                  {cashDifferenceCents === null ? "-" : formatMoney(cashDifferenceCents)}
                </strong>
              </div>
              <div className="cash-kpi-grid">
                {cashActionItems.map((item) => (
                  <div className="cash-kpi-card" key={item.label}>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.hint}</small>
                  </div>
                ))}
              </div>
              <div className="payment-setup-grid">
                <label>
                  Valor contado
                  <input
                    inputMode="decimal"
                    value={countedCashAmount}
                    onChange={(event) => setCountedCashAmount(event.target.value)}
                    placeholder="0,00"
                  />
                </label>
                <label>
                  Status atual
                  <input value={cashSummary?.session?.status ?? "sem sessao"} disabled />
                </label>
                <label>
                  Resultado estimado
                  <input
                    value={
                      countedCashAmount
                        ? formatMoney(
                            parseMoneyToCents(countedCashAmount) -
                              (cashSummary?.session?.expectedAmountCents ?? 0),
                          )
                        : "-"
                    }
                    disabled
                  />
                </label>
              </div>
              <div className="status-list compact">
                {cashChecklist.map((item) => (
                  <div className="status-row rich" key={item.label}>
                    <div>
                      <strong>{item.label}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <Badge tone={item.done ? "good" : "warn"}>
                      {item.done ? "ok" : "pendente"}
                    </Badge>
                  </div>
                ))}
              </div>
              <button
                className="button secondary full"
                type="button"
                onClick={handlePrintCashSummary}
                disabled={isBusy || !cashSummary?.session?.id}
              >
                <Printer size={17} /> Imprimir resumo do caixa
              </button>
              <button
                className="button secondary full"
                type="button"
                onClick={handleExportCashSummaryDocument}
                disabled={isBusy || !cashSummary?.session?.id}
              >
                <FileText size={17} /> Resumo executivo PDF
              </button>
              <button
                className="button primary full"
                type="button"
                data-testid="cash-close"
                onClick={handleCloseOrder}
                disabled={isBusy || Boolean(cashCloseBlockedReason)}
                title={cashCloseBlockedReason || "Fechar conta com auditoria"}
              >
                <ShieldCheck size={17} /> Fechar com auditoria
              </button>
              {cashCloseBlockedReason ? (
                <p className="cash-helper-copy">{cashCloseBlockedReason}</p>
              ) : null}
              <button
                className="button secondary full"
                type="button"
                onClick={handleCloseCashSession}
                disabled={
                  isBusy ||
                  !cashSummary?.session?.id ||
                  cashSummary.session.status !== "open" ||
                  cashOpenOrdersCount > 0
                }
              >
                <BadgeDollarSign size={17} /> Encerrar caixa
              </button>
            </article>

            <article className="panel fiscal-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Fiscal</span>
                  <h2>Notas e cupons</h2>
                </div>
                <Badge tone={readFiscalBadgeTone(fiscalDocuments)}>
                  {readFiscalSummary(fiscalDocuments)}
                </Badge>
              </div>
              <div className="fiscal-list">
                {(fiscalDocuments.length > 0 ? fiscalDocuments.slice(0, 4) : demoFiscalRows()).map(
                  (document) => (
                    <div className="fiscal-row" key={document.id}>
                      <FileCheck2 size={18} />
                      <div>
                        <strong>
                          {document.model.toUpperCase()}{" "}
                          {document.number
                            ? `${document.series ?? "1"}-${document.number}`
                            : "pendente"}
                        </strong>
                        <span>
                          {document.orderId
                            ? `Pedido ${document.orderId.slice(0, 8)}`
                            : "Sem pedido"}
                        </span>
                      </div>
                      <Badge tone={readFiscalTone(document.status)}>
                        {readFiscalStatus(document.status)}
                      </Badge>
                      {["pending", "rejected", "error", "contingency"].includes(document.status) &&
                      fiscalDocuments.length > 0 ? (
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => handleRetryFiscal(document.id)}
                          aria-label="Reenfileirar documento fiscal"
                        >
                          <RotateCw size={15} />
                        </button>
                      ) : null}
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => handleExportFiscalAuxiliary(document)}
                        aria-label={`Gerar anexo auxiliar ${document.id}`}
                      >
                        <FileText size={15} />
                      </button>
                      {document.status === "authorized" && fiscalDocuments.length > 0 ? (
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => handleCancelFiscal(document.id)}
                          aria-label="Cancelar documento fiscal"
                        >
                          <ShieldCheck size={15} />
                        </button>
                      ) : null}
                    </div>
                  ),
                )}
              </div>
              <button
                className="button secondary full"
                type="button"
                onClick={handleIssueFiscal}
                disabled={isBusy || !currentOrder}
              >
                <ReceiptText size={17} /> Emitir NFC-e do pedido atual
              </button>
            </article>

            <article className="panel branding-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Identidade</span>
                  <h2>Ambiente do estabelecimento</h2>
                </div>
                <Palette size={20} />
              </div>
              <div className="brand-preview">
                <span className="tenant-avatar large">
                  {activeBranding.logoUrl ? (
                    <span
                      className="tenant-logo cover"
                      style={{ backgroundImage: `url(${activeBranding.logoUrl})` }}
                      aria-hidden="true"
                    />
                  ) : (
                    brandingInitial
                  )}
                </span>
                <div>
                  <strong>{activeBranding.displayName}</strong>
                  <span>Personalização aplicada ao painel, QR e comunicações.</span>
                </div>
              </div>
              <a className="button primary full" href="/app/settings/branding">
                <Palette size={17} /> Configurar identidade
              </a>
            </article>
            <article className="panel integration-panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Integracao</span>
                  <h2>Dose Club</h2>
                </div>
                <Badge tone={clubConfig?.status === "active" ? "good" : "warn"}>
                  {clubConfig?.status ?? "nao configurado"}
                </Badge>
              </div>
              <div className="integration-list">
                <div>
                  <span>API key</span>
                  <strong>
                    {clubConfig?.hasApiKey
                      ? `termina em ${clubConfig.apiKeyLastFour}`
                      : "nao provisionada"}
                  </strong>
                </div>
                <div>
                  <span>Filial vinculada</span>
                  <strong>{clubConfig?.branchId ? "Unidade atual" : "todas autorizadas"}</strong>
                </div>
                <div>
                  <span>Scopes</span>
                  <strong>{clubConfig?.scopes?.length ?? 0} permissoes</strong>
                </div>
              </div>
              {generatedClubKey ? (
                <div className="secret-box">
                  <span>Exibida uma unica vez</span>
                  <code>{generatedClubKey}</code>
                  <button className="icon-button" type="button" onClick={handleCopyClubKey}>
                    <Copy size={16} />
                  </button>
                </div>
              ) : null}
              <div className="ticket-actions">
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => handleConfigureClub(false)}
                  disabled={isBusy}
                >
                  <KeyRound size={17} /> Provisionar
                </button>
                <button
                  className="button primary"
                  type="button"
                  onClick={() => handleConfigureClub(true)}
                  disabled={isBusy}
                >
                  <RotateCw size={17} /> Rotacionar
                </button>
              </div>
            </article>

            <article className="panel">
              <div className="panel-title">
                <div>
                  <span className="section-kicker">Auditoria</span>
                  <h2>Eventos sensiveis</h2>
                </div>
                <Gauge size={20} />
              </div>
              <div className="audit-filters">
                <label>
                  Acao
                  <input
                    value={auditFilters.action}
                    onChange={(event) =>
                      setAuditFilters((current) => ({ ...current, action: event.target.value }))
                    }
                    placeholder="payment.confirmed"
                  />
                </label>
                <label>
                  Usuario
                  <select
                    value={auditFilters.userId}
                    onChange={(event) =>
                      setAuditFilters((current) => ({ ...current, userId: event.target.value }))
                    }
                  >
                    <option value="">Todos</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Entidade
                  <input
                    value={auditFilters.entityType}
                    onChange={(event) =>
                      setAuditFilters((current) => ({ ...current, entityType: event.target.value }))
                    }
                    placeholder="order"
                  />
                </label>
                <label>
                  De
                  <input
                    type="date"
                    value={auditFilters.dateFrom}
                    onChange={(event) =>
                      setAuditFilters((current) => ({ ...current, dateFrom: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Ate
                  <input
                    type="date"
                    value={auditFilters.dateTo}
                    onChange={(event) =>
                      setAuditFilters((current) => ({ ...current, dateTo: event.target.value }))
                    }
                  />
                </label>
                <button
                  className="button secondary compact"
                  type="button"
                  onClick={handleApplyAuditFilters}
                  disabled={isBusy}
                >
                  <Search size={15} /> Filtrar
                </button>
                <button
                  className="button ghost compact"
                  type="button"
                  onClick={handleClearAuditFilters}
                  disabled={isBusy}
                >
                  <X size={15} /> Limpar
                </button>
              </div>
              <div className="audit-list">
                {auditEvents.slice(0, 6).map((event) => (
                  <div className="audit-row" key={event.id}>
                    <strong>{readRelativeTime(event.createdAt)}</strong>
                    <span>{readAuditSummary(event)}</span>
                    <small>
                      {event.action} por {readAuditOperator(event)}
                    </small>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        <a className="floating-qr" href={`/q/${selectedTable?.code ?? "M03"}`}>
          <QrCode size={18} />
          QR Mesa {selectedTable?.code ?? "M03"}
        </a>
      </section>
    </main>
  );
}

function readStatusTitle(status: AppStatus) {
  if (status === "ready") {
    return "API conectada";
  }
  if (status === "loading") {
    return "Carregando sessao";
  }
  if (status === "unauthenticated") {
    return "Aguardando login";
  }
  return "Modo demonstracao";
}

function readOperatorProfile(permissions: string[]) {
  const canManageTenant = permissions.includes("tenant:manage");
  const canReadReports = permissions.includes("reports:read");
  const canManageCash = permissions.includes("cash:manage");
  const canOperatePos = permissions.includes("pos:operate");
  const canManageInventory = permissions.includes("inventory:manage");

  if (canManageTenant || canReadReports) {
    return {
      kicker: "Perfil recomendado",
      title: "Dono ou gerente",
      description: "Priorize relatórios, equipe, configurações e indicadores do turno.",
      actions: [
        { label: "Ver relatórios", href: "/app/reports" },
        { label: "Equipe", href: "/app/team" },
        { label: "Personalizar", href: "/app/settings/branding" },
      ],
    };
  }

  if (canManageCash) {
    return {
      kicker: "Perfil recomendado",
      title: "Caixa",
      description: "Acompanhe pagamentos, pré-contas, fechamento e pendências fiscais.",
      actions: [
        { label: "Fechar turno", href: "/app#caixa" },
        { label: "Relatórios", href: "/app/reports" },
      ],
    };
  }

  if (canOperatePos) {
    return {
      kicker: "Perfil recomendado",
      title: "Garçom",
      description: "Use a tela mobile para abrir mesa, lançar itens e enviar para a cozinha.",
      actions: [
        { label: "Modo garçom", href: "/app/waiter" },
        { label: "QR mesa M03", href: "/q/M03" },
      ],
    };
  }

  if (canManageInventory) {
    return {
      kicker: "Perfil recomendado",
      title: "Estoque",
      description: "Revise alertas, ficha tecnica e movimentos auditados.",
      actions: [{ label: "Ver estoque", href: "/app#estoque" }],
    };
  }

  return {
    kicker: "Perfil recomendado",
    title: "Operação",
    description: "Entre com uma conta do estabelecimento para carregar atalhos por permissão.",
    actions: [{ label: "Entrar", href: "/login" }],
  };
}

function readCategoryLabel(product: Product) {
  if (product.name.toLowerCase().includes("chopp") || product.name.toLowerCase().includes("soda")) {
    return "Bebidas";
  }
  if (product.name.toLowerCase().includes("pizza")) {
    return "Pizzas";
  }
  if (product.name.toLowerCase().includes("brownie")) {
    return "Sobremesas";
  }
  return "Hamburgueres";
}

function readPrepTime(name: string) {
  if (name.toLowerCase().includes("chopp") || name.toLowerCase().includes("soda")) {
    return "2 min";
  }
  if (name.toLowerCase().includes("pizza")) {
    return "18 min";
  }
  if (name.toLowerCase().includes("brownie")) {
    return "7 min";
  }
  return "12 min";
}

function readQuantity(quantity: string) {
  return `${Number(quantity).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}x`;
}

function readTableDetail(table: DiningTable) {
  const labels: Record<string, string> = {
    free: "Livre",
    occupied: "Ocupada",
    preparing: "Em preparo",
    waiting_payment: "Pagamento",
    reserved: "Reserva",
    served: "Servida",
    order_sent: "Cozinha",
    waiting_order: "Aguardando",
    blocked: "Bloqueada",
  };
  return labels[table.status] ?? table.status;
}

function readQrOrderLabel(order: QrPendingOrder) {
  if (order.tableCode) {
    return `Mesa ${order.tableCode}`;
  }
  if (order.tableName) {
    return order.tableName;
  }
  return `Pedido ${order.id.slice(0, 8)}`;
}

function readQrOrderSummary(order: QrPendingOrder) {
  if (order.items.length === 0) {
    return "Sem itens carregados";
  }

  return order.items
    .slice(0, 3)
    .map((item) => `${Number(item.quantity).toLocaleString("pt-BR")}x ${item.nameSnapshot}`)
    .join(", ");
}

function readRelativeTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "agora";
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) {
    return "agora";
  }
  if (diffMinutes < 60) {
    return `${diffMinutes} min`;
  }
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function readHistoryActionLabel(action: string) {
  const labels: Record<string, string> = {
    "qr.order_created": "Pedido QR recebido",
    "qr.call-waiter": "Garcom chamado",
    "qr.pre-bill": "Pre-conta solicitada",
    "qr_order.item_updated": "Pedido QR revisado",
    "qr_order.item_canceled": "Item QR cancelado",
    "qr_order.rejected": "Pedido QR recusado",
    "order.sent_to_kitchen": "Enviado ao KDS",
    "payment.confirmed": "Pagamento confirmado",
    "order.closed": "Conta fechada",
  };
  return labels[action] ?? action;
}

function readHistoryDetail(event: TableHistoryEvent) {
  const metadata = event.metadata ?? {};
  if (event.action === "qr.order_created") {
    return `${readMetadataValue(metadata, "itemCount", "Pedido")} item(ns) enviados pelo cliente.`;
  }
  if (event.action === "qr_order.item_updated") {
    return `${readMetadataValue(metadata, "name", "Item")} ajustado para ${readMetadataValue(
      metadata,
      "quantity",
      "nova quantidade",
    )}.`;
  }
  if (event.action === "qr_order.item_canceled") {
    return `${readMetadataValue(metadata, "name", "Item")} cancelado. ${readMetadataValue(
      metadata,
      "reason",
      "Motivo operacional registrado.",
    )}`;
  }
  if (event.action === "qr_order.rejected") {
    return String(metadata.reason ?? "Motivo operacional registrado.");
  }
  if (event.action === "order.sent_to_kitchen") {
    return `${readMetadataValue(metadata, "ticketsCreated", "0")} ticket(s) gerados.`;
  }
  if (event.action === "payment.confirmed") {
    const amountCents = readMetadataNumber(metadata, "amountCents");
    const method = readMetadataValue(metadata, "method", "pagamento manual");
    const orderStatus = readMetadataValue(metadata, "orderStatus", "status atualizado");
    return `${formatMoney(amountCents)} confirmado via ${method}. Pedido ficou como ${orderStatus}.`;
  }
  if (event.action === "order.closed") {
    const totalCents = readMetadataNumber(metadata, "totalCents");
    const movements = readMetadataValue(metadata, "stockMovementsCreated", "0");
    return `Conta fechada em ${formatMoney(totalCents)} com ${movements} baixa(s) de estoque.`;
  }
  if (typeof metadata.message === "string" && metadata.message.length > 0) {
    return metadata.message;
  }
  return "Evento registrado na auditoria.";
}

function readOutboxStatus(event: OutboxEvent) {
  if (event.status === "failed" && event.attempts > 0) {
    return `erro ${event.attempts}x`;
  }
  return event.status;
}

function readOutboxTone(status: string): "neutral" | "good" | "warn" | "danger" | "info" {
  if (status === "processed") {
    return "good";
  }
  if (status === "failed" || status === "error") {
    return "danger";
  }
  if (status === "pending") {
    return "warn";
  }
  return "neutral";
}

function readOutboxPayloadSummary(event: OutboxEvent) {
  if (event.errorMessage) {
    return event.errorMessage;
  }

  const payload = event.payload ?? {};
  const orderId =
    typeof payload.orderId === "string" ? `Pedido ${payload.orderId.slice(0, 8)}` : "";
  const amount =
    typeof payload.amountCents === "number" ? formatMoney(payload.amountCents) : undefined;
  const branchId =
    typeof payload.branchId === "string" ? `Filial ${payload.branchId.slice(0, 8)}` : "";
  return [orderId, amount, branchId].filter(Boolean).join(" - ") || "Evento operacional.";
}

function readAuditOperator(event: AuditEvent) {
  if (event.userName) {
    return event.userName;
  }
  if (event.userEmail) {
    return event.userEmail;
  }
  return "sistema";
}

function readAuditSummary(event: AuditEvent) {
  const metadata = event.metadata ?? {};
  if (event.action === "role.updated") {
    return `Cargo ${readMetadataValue(metadata, "code", event.entityId ?? "selecionado")} atualizado.`;
  }
  if (event.action === "invitation.created") {
    return `Convite enviado para ${readMetadataValue(metadata, "email", "novo usuario")}.`;
  }
  if (event.action === "user.role_assigned") {
    return `Cargo aplicado ao usuario ${readMetadataValue(metadata, "email", "selecionado")}.`;
  }
  if (event.action === "payment.confirmed") {
    return `Pagamento auditado em ${formatMoney(readMetadataNumber(metadata, "amountCents"))}.`;
  }
  if (event.action === "order.closed") {
    return `Conta fechada em ${formatMoney(readMetadataNumber(metadata, "totalCents"))}.`;
  }
  return `${event.entityType} atualizado.`;
}

function readHistoryOperator(event: TableHistoryEvent) {
  if (event.userName) {
    return event.userName;
  }
  if (event.userEmail) {
    return event.userEmail;
  }
  return "Cliente/QR";
}

function isHistoryEventInFilter(event: TableHistoryEvent, filter: HistoryFilter): boolean {
  const isQrEvent = event.action.startsWith("qr") || event.action.startsWith("qr_order");
  const isKdsEvent = event.action.includes("kds") || event.action === "order.sent_to_kitchen";
  const isPaymentEvent = event.action.includes("payment") || event.action.includes("cash");

  if (filter === "all") {
    return true;
  }
  if (filter === "qr") {
    return isQrEvent;
  }
  if (filter === "kds") {
    return isKdsEvent;
  }
  if (filter === "payments") {
    return isPaymentEvent;
  }
  return !isQrEvent && !isPaymentEvent;
}

function isHistoryEventMatchingQuery(event: TableHistoryEvent, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const haystack = [
    readHistoryActionLabel(event.action),
    readHistoryDetail(event),
    readHistoryOperator(event),
    event.action,
    event.entityType,
    event.entityId ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalizedQuery);
}

function readRealtimeStatus(status: RealtimeStatus) {
  const labels: Record<RealtimeStatus, string> = {
    offline: "tempo real offline",
    connecting: "tempo real conectando",
    live: "tempo real ativo",
  };
  return labels[status];
}

function readMetadataValue(metadata: Record<string, unknown>, key: string, fallback: string) {
  const value = metadata[key];
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function readMetadataNumber(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function playQrNotification() {
  try {
    const audioWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    };
    const AudioContextClass = audioWindow.AudioContext || audioWindow.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.16);
  } catch {
    // Browsers may block audio until user interaction; the visual alert remains available.
  }
}

function readTicketCode(ticket: KdsTicket) {
  const tableId = ticket.payload.tableId;
  return typeof tableId === "string" && tableId.length > 0 ? tableId : ticket.orderId.slice(0, 8);
}

function readTicketSummary(ticket: KdsTicket) {
  const summary = ticket.payload.summary;
  if (typeof summary === "string") {
    return summary;
  }
  const source = ticket.payload.source;
  return typeof source === "string" ? source : ticket.orderChannel;
}

function readTicketTone(status: string) {
  if (status === "ready") {
    return "good";
  }
  if (status === "waiting_payment") {
    return "warn";
  }
  return "neutral";
}

function readFiscalTone(status: string) {
  if (status === "authorized") {
    return "good";
  }
  if (status === "pending" || status === "contingency") {
    return "warn";
  }
  if (status === "rejected" || status === "error") {
    return "danger";
  }
  return "neutral";
}

function readFiscalBadgeTone(documents: FiscalDocument[]) {
  if (documents.some((document) => document.status === "rejected" || document.status === "error")) {
    return "danger";
  }
  if (documents.some((document) => document.status === "pending")) {
    return "warn";
  }
  if (documents.some((document) => document.status === "authorized")) {
    return "good";
  }
  return "neutral";
}

function readFiscalSummary(documents: FiscalDocument[]) {
  if (documents.length === 0) {
    return "mock pronto";
  }
  const pending = documents.filter((document) => document.status === "pending").length;
  if (pending > 0) {
    return `${pending} pendente(s)`;
  }
  return `${documents.length} documento(s)`;
}

function readFiscalStatus(status: string) {
  const labels: Record<string, string> = {
    not_required: "nao exigido",
    pending: "pendente",
    authorized: "autorizado",
    rejected: "rejeitado",
    canceled: "cancelado",
    contingency: "contingencia",
    error: "erro",
  };
  return labels[status] ?? status;
}

function readPrintBadgeTone(jobs: PrintJob[]) {
  if (jobs.some((job) => job.status === "failed")) {
    return "danger";
  }
  if (jobs.some((job) => job.status === "pending" || job.status === "printing")) {
    return "warn";
  }
  if (jobs.some((job) => job.status === "printed")) {
    return "good";
  }
  return "neutral";
}

function readPrintSummary(jobs: PrintJob[]) {
  const pending = jobs.filter((job) => job.status === "pending").length;
  if (pending > 0) {
    return `${pending} na fila`;
  }
  return jobs.length > 0 ? `${jobs.length} job(s)` : "sem fila";
}

function readPrintTone(status: string) {
  if (status === "printed") {
    return "good";
  }
  if (status === "failed") {
    return "danger";
  }
  if (status === "pending" || status === "printing") {
    return "warn";
  }
  return "neutral";
}

function readPrintStatus(status: string) {
  const labels: Record<string, string> = {
    pending: "pendente",
    printing: "imprimindo",
    printed: "impresso",
    failed: "falhou",
    canceled: "cancelado",
  };
  return labels[status] ?? status;
}

function readPrintKind(kind: string) {
  const labels: Record<string, string> = {
    kitchen_ticket: "Comanda cozinha",
    bar_ticket: "Comanda bar",
    bill_preview: "Conferencia",
    cash_summary: "Resumo caixa",
    payment_receipt: "Comprovante",
    fiscal_danfe: "DANFE",
  };
  return labels[kind] ?? kind;
}

function readConnectorLastSeen(value?: string | null) {
  if (!value) {
    return "sem heartbeat";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "data invalida";
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function readConnectorHeartbeatValue(config: PrinterConnectorConfig, key: string) {
  const value = config.heartbeat?.[key];
  return typeof value === "string" && value.length > 0 ? value : "-";
}

function parseMoneyToCents(value: string) {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function toggleValue(values: string[], value: string, checked: boolean) {
  if (checked) {
    return values.includes(value) ? values : [...values, value];
  }
  return values.filter((entry) => entry !== value);
}

function demoInventoryRows(): InventorySummaryItem[] {
  return [
    {
      id: "demo-stock-meat",
      name: "Blend bovino",
      unit: "kg",
      averageCostCents: 3800,
      minQuantity: "3.000",
      allowNegative: false,
      quantity: "2.800",
    },
    {
      id: "demo-stock-whisky",
      name: "Single Malt Dose Club",
      unit: "ml",
      averageCostCents: 18,
      minQuantity: "1500.000",
      allowNegative: false,
      quantity: "4200.000",
    },
  ];
}

function demoFiscalRows(): FiscalDocument[] {
  return [
    {
      id: "demo-fiscal-1",
      branchId: null,
      orderId: "demo-order",
      provider: "mock",
      model: "nfce",
      environment: "homologation",
      series: "1",
      number: null,
      status: "pending",
      accessKey: null,
      xmlUrl: null,
      danfeUrl: null,
      errorMessage: null,
      issuedAt: null,
      canceledAt: null,
      createdAt: new Date().toISOString(),
      orderTotalCents: 10000,
    },
  ];
}

function demoTicketLines(): OrderItemResponse[] {
  return [
    {
      id: "demo-line-1",
      orderId: "demo",
      productId: "demo-burger",
      nameSnapshot: "Burger Classico",
      quantity: "2",
      unitPriceCents: 3200,
      totalCents: 6400,
      audit: "demo",
    },
    {
      id: "demo-line-2",
      orderId: "demo",
      productId: "demo-chopp",
      nameSnapshot: "Chopp Pilsen 400ml",
      quantity: "1",
      unitPriceCents: 1400,
      totalCents: 1400,
      audit: "demo",
    },
    {
      id: "demo-line-3",
      orderId: "demo",
      productId: "demo-brownie",
      nameSnapshot: "Brownie da casa",
      quantity: "1",
      unitPriceCents: 2200,
      totalCents: 2200,
      audit: "demo",
    },
  ];
}
