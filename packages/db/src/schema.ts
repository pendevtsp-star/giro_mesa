import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const tenantStatus = pgEnum("tenant_status", [
  "trial",
  "active",
  "past_due",
  "suspended",
  "canceled",
]);
export const orderStatus = pgEnum("order_status", [
  "draft",
  "opened",
  "sent_to_kitchen",
  "preparing",
  "ready",
  "served",
  "waiting_payment",
  "partially_paid",
  "paid",
  "canceled",
  "refunded",
]);
export const orderItemStatus = pgEnum("order_item_status", [
  "pending",
  "sent",
  "preparing",
  "ready",
  "served",
  "canceled",
  "refunded",
]);
export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "authorized",
  "confirmed",
  "failed",
  "canceled",
  "refunded",
  "partially_refunded",
]);
export const cashSessionStatus = pgEnum("cash_session_status", [
  "open",
  "closed",
  "reconciled",
  "disputed",
]);
export const fiscalStatus = pgEnum("fiscal_status", [
  "not_required",
  "pending",
  "authorized",
  "rejected",
  "canceled",
  "contingency",
  "error",
]);
export const tableStatus = pgEnum("table_status", [
  "free",
  "occupied",
  "waiting_order",
  "order_sent",
  "preparing",
  "served",
  "waiting_payment",
  "reserved",
  "blocked",
]);
export const printJobStatus = pgEnum("print_job_status", [
  "pending",
  "printing",
  "printed",
  "failed",
  "canceled",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    document: varchar("document", { length: 32 }),
    status: tenantStatus("status").notNull().default("trial"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [uniqueIndex("tenants_slug_idx").on(table.slug)],
);

export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  priceCents: integer("price_cents").notNull(),
  limits: jsonb("limits").$type<Record<string, unknown>>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id),
    provider: varchar("provider", { length: 40 }).notNull().default("asaas"),
    providerSubscriptionId: varchar("provider_subscription_id", { length: 120 }),
    status: tenantStatus("status").notNull().default("trial"),
    currentPeriodEndsAt: timestamp("current_period_ends_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("subscriptions_tenant_idx").on(table.tenantId)],
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 140 }).notNull(),
    document: varchar("document", { length: 32 }),
    timezone: varchar("timezone", { length: 60 }).notNull().default("America/Sao_Paulo"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("branches_tenant_idx").on(table.tenantId)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    email: varchar("email", { length: 255 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    passwordHash: text("password_hash"),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    mfaSecretRef: text("mfa_secret_ref"),
    isPlatformUser: boolean("is_platform_user").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_email_tenant_idx").on(table.email, table.tenantId),
    index("users_tenant_idx").on(table.tenantId),
  ],
);

export const mfaRecoveryCodes = pgTable(
  "mfa_recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    codeHash: text("code_hash").notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("mfa_recovery_codes_hash_idx").on(table.codeHash),
    index("mfa_recovery_codes_tenant_user_idx").on(table.tenantId, table.userId),
  ],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (table) => [uniqueIndex("roles_code_tenant_idx").on(table.code, table.tenantId)],
);

export const userRoles = pgTable(
  "user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    branchId: uuid("branch_id").references(() => branches.id),
    ...timestamps,
  },
  (table) => [index("user_roles_tenant_user_idx").on(table.tenantId, table.userId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    ipAddress: varchar("ip_address", { length: 80 }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("sessions_token_hash_idx").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    provider: varchar("provider", { length: 40 }).notNull(),
    providerUserId: varchar("provider_user_id", { length: 255 }).notNull(),
    email: varchar("email", { length: 255 }),
    profile: jsonb("profile").$type<Record<string, unknown>>().notNull().default({}),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("oauth_accounts_provider_user_idx").on(table.provider, table.providerUserId),
    uniqueIndex("oauth_accounts_user_provider_idx").on(table.userId, table.provider),
    index("oauth_accounts_tenant_user_idx").on(table.tenantId, table.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: varchar("email", { length: 255 }).notNull(),
    roleId: uuid("role_id").references(() => roles.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("invitations_tenant_idx").on(table.tenantId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("password_reset_tokens_hash_idx").on(table.tokenHash),
    index("password_reset_tokens_tenant_user_idx").on(table.tenantId, table.userId),
  ],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 255 }),
    birthday: varchar("birthday", { length: 10 }),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    lgpdConsentAt: timestamp("lgpd_consent_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("customers_tenant_idx").on(table.tenantId)],
);

export const floorPlans = pgTable(
  "floor_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    layout: jsonb("layout").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [index("floor_plans_tenant_branch_idx").on(table.tenantId, table.branchId)],
);

export const diningTables = pgTable(
  "dining_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    floorPlanId: uuid("floor_plan_id").references(() => floorPlans.id),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    seats: integer("seats").notNull().default(2),
    status: tableStatus("status").notNull().default("free"),
    qrTokenHash: text("qr_token_hash"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("dining_tables_code_branch_idx").on(table.branchId, table.code),
    index("dining_tables_tenant_branch_idx").on(table.tenantId, table.branchId),
  ],
);

export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("categories_tenant_idx").on(table.tenantId)],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    categoryId: uuid("category_id").references(() => categories.id),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    sku: varchar("sku", { length: 80 }),
    priceCents: integer("price_cents").notNull(),
    costCents: integer("cost_cents").notNull().default(0),
    imageUrl: text("image_url"),
    isActive: boolean("is_active").notNull().default(true),
    isAvailable: boolean("is_available").notNull().default(true),
    isClubEligible: boolean("is_club_eligible").notNull().default(false),
    bottleVolumeMl: integer("bottle_volume_ml"),
    defaultDoseMl: integer("default_dose_ml").notNull().default(50),
    spiritType: varchar("spirit_type", { length: 60 }),
    fiscalNcm: varchar("fiscal_ncm", { length: 12 }),
    fiscalCfop: varchar("fiscal_cfop", { length: 8 }),
    fiscalCest: varchar("fiscal_cest", { length: 12 }),
    fiscalOrigin: varchar("fiscal_origin", { length: 2 }),
    fiscalCst: varchar("fiscal_cst", { length: 8 }),
    fiscalCsosn: varchar("fiscal_csosn", { length: 8 }),
    fiscalIcmsRate: numeric("fiscal_icms_rate", { precision: 7, scale: 4 }),
    fiscalPisRate: numeric("fiscal_pis_rate", { precision: 7, scale: 4 }),
    fiscalCofinsRate: numeric("fiscal_cofins_rate", { precision: 7, scale: 4 }),
    channels: jsonb("channels").$type<string[]>().notNull().default(["pos", "qr"]),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [index("products_tenant_idx").on(table.tenantId)],
);

export const modifierGroups = pgTable(
  "modifier_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    name: varchar("name", { length: 120 }).notNull(),
    minChoices: integer("min_choices").notNull().default(0),
    maxChoices: integer("max_choices").notNull().default(1),
    isRequired: boolean("is_required").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("modifier_groups_tenant_product_idx").on(table.tenantId, table.productId)],
);

export const modifierOptions = pgTable(
  "modifier_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    groupId: uuid("group_id")
      .notNull()
      .references(() => modifierGroups.id),
    name: varchar("name", { length: 120 }).notNull(),
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    costDeltaCents: integer("cost_delta_cents").notNull().default(0),
    isAvailable: boolean("is_available").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("modifier_options_tenant_group_idx").on(table.tenantId, table.groupId)],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    unit: varchar("unit", { length: 24 }).notNull(),
    averageCostCents: integer("average_cost_cents").notNull().default(0),
    minQuantity: numeric("min_quantity", { precision: 14, scale: 3 }).notNull().default("0"),
    allowNegative: boolean("allow_negative").notNull().default(false),
    ...timestamps,
  },
  (table) => [index("inventory_items_tenant_idx").on(table.tenantId)],
);

export const stockLocations = pgTable(
  "stock_locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    type: varchar("type", { length: 40 }).notNull(),
    ...timestamps,
  },
  (table) => [index("stock_locations_tenant_branch_idx").on(table.tenantId, table.branchId)],
);

export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    yieldQuantity: numeric("yield_quantity", { precision: 14, scale: 3 }).notNull().default("1"),
    technicalLossRate: numeric("technical_loss_rate", { precision: 5, scale: 4 })
      .notNull()
      .default("0"),
    ...timestamps,
  },
  (table) => [uniqueIndex("recipes_tenant_product_idx").on(table.tenantId, table.productId)],
);

export const recipeItems = pgTable(
  "recipe_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unit: varchar("unit", { length: 24 }).notNull(),
    ...timestamps,
  },
  (table) => [index("recipe_items_tenant_recipe_idx").on(table.tenantId, table.recipeId)],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id),
    stockLocationId: uuid("stock_location_id").references(() => stockLocations.id),
    type: varchar("type", { length: 40 }).notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    sourceType: varchar("source_type", { length: 60 }),
    sourceId: uuid("source_id"),
    reason: text("reason"),
    ...timestamps,
  },
  (table) => [index("stock_movements_tenant_item_idx").on(table.tenantId, table.inventoryItemId)],
);

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    tableId: uuid("table_id").references(() => diningTables.id),
    customerId: uuid("customer_id").references(() => customers.id),
    channel: varchar("channel", { length: 40 }).notNull(),
    status: orderStatus("status").notNull().default("draft"),
    peopleCount: integer("people_count").notNull().default(1),
    subtotalCents: integer("subtotal_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    serviceChargeCents: integer("service_charge_cents").notNull().default(0),
    deliveryFeeCents: integer("delivery_fee_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull().default(0),
    version: integer("version").notNull().default(1),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("orders_tenant_branch_status_idx").on(table.tenantId, table.branchId, table.status),
    index("orders_tenant_table_idx").on(table.tenantId, table.tableId),
  ],
);

export const tabs = pgTable(
  "tabs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    orderId: uuid("order_id").references(() => orders.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 120 }),
    status: varchar("status", { length: 40 }).notNull().default("open"),
    consumptionLimitCents: integer("consumption_limit_cents"),
    ...timestamps,
  },
  (table) => [index("tabs_tenant_branch_idx").on(table.tenantId, table.branchId)],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    tabId: uuid("tab_id").references(() => tabs.id),
    nameSnapshot: varchar("name_snapshot", { length: 160 }).notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 3 }).notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    status: orderItemStatus("status").notNull().default("pending"),
    notes: text("notes"),
    modifiers: jsonb("modifiers").$type<Record<string, unknown>[]>().notNull().default([]),
    sentToKitchenAt: timestamp("sent_to_kitchen_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("order_items_tenant_order_idx").on(table.tenantId, table.orderId)],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id").references(() => orders.id),
    provider: varchar("provider", { length: 40 }).notNull().default("manual"),
    method: varchar("method", { length: 40 }).notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    externalId: varchar("external_id", { length: 160 }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payments_idempotency_idx").on(table.tenantId, table.idempotencyKey),
    index("payments_tenant_order_idx").on(table.tenantId, table.orderId),
  ],
);

export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => users.id),
    status: cashSessionStatus("status").notNull().default("open"),
    openingAmountCents: integer("opening_amount_cents").notNull().default(0),
    expectedAmountCents: integer("expected_amount_cents").notNull().default(0),
    countedAmountCents: integer("counted_amount_cents"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("cash_sessions_tenant_branch_idx").on(table.tenantId, table.branchId)],
);

export const kdsStations = pgTable(
  "kds_stations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    type: varchar("type", { length: 40 }).notNull(),
    productCategoryIds: jsonb("product_category_ids").$type<string[]>().notNull().default([]),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("kds_stations_tenant_branch_idx").on(table.tenantId, table.branchId)],
);

export const kdsTickets = pgTable(
  "kds_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    stationId: uuid("station_id")
      .notNull()
      .references(() => kdsStations.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    status: orderItemStatus("status").notNull().default("sent"),
    priority: integer("priority").notNull().default(0),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    bumpedAt: timestamp("bumped_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("kds_tickets_tenant_station_idx").on(table.tenantId, table.stationId)],
);

export const printerDevices = pgTable(
  "printer_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    role: varchar("role", { length: 40 }).notNull(),
    connectionType: varchar("connection_type", { length: 40 }).notNull().default("network"),
    address: varchar("address", { length: 180 }),
    port: integer("port"),
    paperWidth: integer("paper_width").notNull().default(80),
    charactersPerLine: integer("characters_per_line").notNull().default(48),
    isActive: boolean("is_active").notNull().default(true),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("printer_devices_tenant_branch_idx").on(table.tenantId, table.branchId),
    uniqueIndex("printer_devices_branch_name_idx").on(table.branchId, table.name),
  ],
);

export const printRoutes = pgTable(
  "print_routes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    trigger: varchar("trigger", { length: 60 }).notNull(),
    targetType: varchar("target_type", { length: 60 }).notNull(),
    stationId: uuid("station_id").references(() => kdsStations.id),
    productCategoryIds: jsonb("product_category_ids").$type<string[]>().notNull().default([]),
    printerDeviceId: uuid("printer_device_id")
      .notNull()
      .references(() => printerDevices.id),
    copies: integer("copies").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("print_routes_tenant_branch_idx").on(table.tenantId, table.branchId),
    index("print_routes_station_idx").on(table.tenantId, table.stationId),
  ],
);

export const printJobs = pgTable(
  "print_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    printerDeviceId: uuid("printer_device_id").references(() => printerDevices.id),
    printRouteId: uuid("print_route_id").references(() => printRoutes.id),
    kdsTicketId: uuid("kds_ticket_id").references(() => kdsTickets.id),
    orderId: uuid("order_id").references(() => orders.id),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    kind: varchar("kind", { length: 60 }).notNull(),
    status: printJobStatus("status").notNull().default("pending"),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    copies: integer("copies").notNull().default(1),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    renderedText: text("rendered_text").notNull(),
    errorMessage: text("error_message"),
    printedAt: timestamp("printed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("print_jobs_idempotency_idx").on(table.tenantId, table.idempotencyKey),
    index("print_jobs_tenant_status_idx").on(table.tenantId, table.status, table.createdAt),
    index("print_jobs_branch_status_idx").on(table.branchId, table.status, table.createdAt),
  ],
);

export const deliveryOrders = pgTable(
  "delivery_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    customerAddress: jsonb("customer_address").$type<Record<string, unknown>>().notNull(),
    deliveryStatus: varchar("delivery_status", { length: 40 }).notNull().default("received"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("delivery_orders_tenant_order_idx").on(table.tenantId, table.orderId)],
);

export const fiscalDocuments = pgTable(
  "fiscal_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    orderId: uuid("order_id").references(() => orders.id),
    provider: varchar("provider", { length: 40 }).notNull().default("mock"),
    model: varchar("model", { length: 20 }).notNull(),
    environment: varchar("environment", { length: 20 }).notNull().default("homologation"),
    series: varchar("series", { length: 20 }),
    number: integer("number"),
    status: fiscalStatus("status").notNull().default("pending"),
    externalId: varchar("external_id", { length: 160 }),
    accessKey: varchar("access_key", { length: 80 }),
    xmlUrl: text("xml_url"),
    danfeUrl: text("danfe_url"),
    errorMessage: text("error_message"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("fiscal_documents_tenant_order_idx").on(table.tenantId, table.orderId),
    uniqueIndex("fiscal_documents_order_model_idx").on(table.tenantId, table.orderId, table.model),
  ],
);

export const fiscalSettings = pgTable(
  "fiscal_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    provider: varchar("provider", { length: 40 }).notNull().default("mock"),
    status: varchar("status", { length: 40 }).notNull().default("enabled"),
    environment: varchar("environment", { length: 20 }).notNull().default("homologation"),
    defaultModel: varchar("default_model", { length: 20 }).notNull().default("nfce"),
    legalName: varchar("legal_name", { length: 180 }),
    tradeName: varchar("trade_name", { length: 180 }),
    document: varchar("document", { length: 32 }),
    stateRegistration: varchar("state_registration", { length: 32 }),
    municipalRegistration: varchar("municipal_registration", { length: 32 }),
    taxRegime: varchar("tax_regime", { length: 40 }).notNull().default("simples_nacional"),
    uf: varchar("uf", { length: 2 }),
    cityCode: varchar("city_code", { length: 12 }),
    cityName: varchar("city_name", { length: 120 }),
    series: varchar("series", { length: 20 }).notNull().default("1"),
    nextNumber: integer("next_number").notNull().default(1),
    certificateSecretRef: varchar("certificate_secret_ref", { length: 160 }),
    cscSecretRef: varchar("csc_secret_ref", { length: 160 }),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [uniqueIndex("fiscal_settings_tenant_branch_idx").on(table.tenantId, table.branchId)],
);

export const integrationAccounts = pgTable(
  "integration_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    provider: varchar("provider", { length: 60 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("disabled"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    secretRef: varchar("secret_ref", { length: 160 }),
    apiKeyHash: text("api_key_hash"),
    apiKeyLastFour: varchar("api_key_last_four", { length: 8 }),
    apiKeyCreatedAt: timestamp("api_key_created_at", { withTimezone: true }),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("integration_accounts_provider_idx").on(table.tenantId, table.provider),
    uniqueIndex("integration_accounts_api_key_hash_idx").on(table.apiKeyHash),
  ],
);

export const webhookEvents = pgTable(
  "webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: varchar("provider", { length: 60 }).notNull(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    externalEventId: varchar("external_event_id", { length: 180 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("received"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("webhook_events_provider_external_idx").on(table.provider, table.externalEventId),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    topic: varchar("topic", { length: 120 }).notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: varchar("status", { length: 40 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    ...timestamps,
  },
  (table) => [index("outbox_events_status_idx").on(table.status, table.availableAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    userId: uuid("user_id").references(() => users.id),
    requestId: varchar("request_id", { length: 120 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 120 }).notNull(),
    entityId: uuid("entity_id"),
    ipAddress: varchar("ip_address", { length: 80 }),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  ],
);
