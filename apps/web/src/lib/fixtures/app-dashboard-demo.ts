import type {
  AuditEvent,
  DiningTable,
  FiscalDocument,
  InventorySummaryItem,
  Invitation,
  KdsStation,
  KdsTicket,
  OrderItemResponse,
  OutboxEvent,
  PrinterConnectorConfig,
  PrinterDevice,
  PrintJob,
  PrintRoute,
  Product,
  Role,
  TenantBranding,
  TenantUser,
} from "../giromesa-api";

export const demoTables: DiningTable[] = [
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

export const demoProducts: Product[] = [
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

export const demoTickets: KdsTicket[] = [
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

export const demoKdsStations: KdsStation[] = [
  { id: "demo-kitchen", branchId: "demo", name: "Cozinha", type: "kitchen", isActive: true },
  { id: "demo-bar", branchId: "demo", name: "Bar", type: "bar", isActive: true },
];

export const demoPrinterDevices: PrinterDevice[] = [
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

export const demoPrintRoutes: PrintRoute[] = [
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

export const demoPrintJobs: PrintJob[] = [
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

export const demoPrinterConnectorConfig: PrinterConnectorConfig = {
  provider: "local_printer_connector",
  status: "not_configured",
  branchId: null,
  scopes: [],
  hasApiKey: false,
};

export const demoBranding: TenantBranding = {
  displayName: "Bar Aurora",
  logoUrl: null,
  themeMode: "light",
  accentPreset: "emerald",
};

export const demoRoles: Role[] = [
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

export const demoOutboxEvents: OutboxEvent[] = [
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

export const demoUsers: TenantUser[] = [
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

export const demoInvitations: Invitation[] = [
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

export const demoAuditEvents: AuditEvent[] = [
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

export const permissionGroups = [
  {
    title: "Administracao",
    items: [
      ["tenant:manage", "Gerenciar tenant, cargos e integrações"],
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

export const defaultPrinterForm = {
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

export const defaultPrintRouteForm = {
  name: "Rota Cozinha",
  targetType: "kitchen_ticket",
  stationId: "",
  printerDeviceId: "",
  copies: "1",
};

export const defaultCategoryForm = {
  name: "Drinks autorais",
  sortOrder: "6",
};

export const defaultProductForm = {
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

export const defaultInventoryForm = {
  name: "Whisky base",
  unit: "ml",
  averageCost: "0,18",
  minQuantity: "1500",
  allowNegative: false,
};

export const defaultStockAdjustmentForm = {
  inventoryItemId: "",
  quantity: "1000",
  reason: "Entrada manual conferida",
};

export const defaultInvitationForm = {
  email: "gerente@bar.demo",
  roleId: "",
};

export const defaultUserRoleForm = {
  userId: "",
  roleId: "",
};

export const defaultAuditFilters = {
  action: "",
  userId: "",
  entityType: "",
  dateFrom: "",
  dateTo: "",
};

export const paymentMethodOptions = [
  ["pix_manual", "Pix manual"],
  ["cash", "Dinheiro"],
  ["credit_card", "Credito"],
  ["debit_card", "Debito"],
] as const;

export function demoInventoryRows(): InventorySummaryItem[] {
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

export function demoFiscalRows(): FiscalDocument[] {
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

export function demoTicketLines(): OrderItemResponse[] {
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
