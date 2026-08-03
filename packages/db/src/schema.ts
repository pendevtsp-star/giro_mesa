import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
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
export const approvalStatus = pgEnum("approval_status", [
  "pending",
  "approved",
  "rejected",
  "expired",
]);
export const cashHandoverStatus = pgEnum("cash_handover_status", [
  "not_required",
  "pending",
  "received",
  "disputed",
]);
export const reservationStatus = pgEnum("reservation_status", [
  "booked",
  "arrived",
  "seated",
  "no_show",
  "canceled",
]);
export const waitlistStatus = pgEnum("waitlist_status", [
  "waiting",
  "notified",
  "seated",
  "left",
  "canceled",
]);
export const onboardingStepStatus = pgEnum("onboarding_step_status", [
  "pending",
  "in_progress",
  "completed",
  "skipped",
  "blocked",
]);
export const operationalShiftStatus = pgEnum("operational_shift_status", [
  "open",
  "closed",
  "canceled",
]);
export const cashMovementType = pgEnum("cash_movement_type", [
  "supply",
  "withdrawal",
  "adjustment",
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
  "cleaning",
]);
export const printJobStatus = pgEnum("print_job_status", [
  "pending",
  "printing",
  "printed",
  "failed",
  "canceled",
]);
export const deliveryStatus = pgEnum("delivery_status", [
  "pending",
  "confirmed",
  "preparing",
  "ready_for_pickup",
  "out_for_delivery",
  "delivered",
  "canceled",
]);
export const qrTableStatus = pgEnum("qr_table_status", ["active", "revoked"]);
export const serviceRequestStatus = pgEnum("service_request_status", [
  "pending",
  "acknowledged",
  "resolved",
  "canceled",
]);
export const cleaningMode = pgEnum("cleaning_mode", ["manual", "automatic"]);
export const themeMode = pgEnum("theme_mode", ["light", "dark", "system"]);
export const kdsInputMode = pgEnum("kds_input_mode", ["touch", "keyboard", "hybrid", "printer"]);
export const operationalDeviceStatus = pgEnum("operational_device_status", ["active", "revoked"]);
export const productionOutputMode = pgEnum("production_output_mode", ["kds", "printer", "hybrid"]);

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
    isDemo: boolean("is_demo").notNull().default(false),
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

export const purchaseIntents = pgTable(
  "purchase_intents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    product: varchar("product", { length: 40 }).notNull().default("giromesa"),
    planCode: varchar("plan_code", { length: 40 }).notNull(),
    status: varchar("status", { length: 32 }).notNull().default("pending"),
    paymentMethod: varchar("payment_method", { length: 40 }).notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("BRL"),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    billingEmail: varchar("billing_email", { length: 255 }),
    provider: varchar("provider", { length: 40 }).notNull().default("asaas"),
    providerReference: varchar("provider_reference", { length: 160 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("purchase_intents_tenant_key_idx").on(table.tenantId, table.idempotencyKey),
    index("purchase_intents_tenant_status_idx").on(table.tenantId, table.status),
  ],
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

export const branchOperationalSettings = pgTable(
  "branch_operational_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    cleaningMode: cleaningMode("cleaning_mode").notNull().default("manual"),
    allowWaiterPayments: boolean("allow_waiter_payments").notNull().default(false),
    defaultTheme: themeMode("default_theme").notNull().default("dark"),
    defaultKdsInputMode: kdsInputMode("default_kds_input_mode").notNull().default("hybrid"),
    kdsShortcuts: jsonb("kds_shortcuts").$type<Record<string, string>>().notNull().default({
      refresh: "r",
      sound: "s",
      fullscreen: "f",
      advance: " ",
      up: "ArrowUp",
      down: "ArrowDown",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("branch_operational_settings_scope_idx").on(table.tenantId, table.branchId),
  ],
);

export const branchBusinessHours = pgTable(
  "branch_business_hours",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    weekday: integer("weekday").notNull(),
    opensAt: varchar("opens_at", { length: 5 }).notNull(),
    closesAt: varchar("closes_at", { length: 5 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("branch_business_hours_slot_idx").on(
      table.tenantId,
      table.branchId,
      table.weekday,
      table.sortOrder,
    ),
    check("branch_business_hours_weekday_check", sql`${table.weekday} between 0 and 6`),
    check(
      "branch_business_hours_open_check",
      sql`${table.opensAt} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
    check(
      "branch_business_hours_close_check",
      sql`${table.closesAt} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
  ],
);

export const branchBusinessHourExceptions = pgTable(
  "branch_business_hour_exceptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    date: date("date").notNull(),
    isClosed: boolean("is_closed").notNull().default(false),
    intervals: jsonb("intervals")
      .$type<Array<{ opensAt: string; closesAt: string }>>()
      .notNull()
      .default([]),
    reason: varchar("reason", { length: 160 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("branch_business_hour_exceptions_date_idx").on(
      table.tenantId,
      table.branchId,
      table.date,
    ),
  ],
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

export const userOperationalPreferences = pgTable(
  "user_operational_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    theme: themeMode("theme").notNull().default("system"),
    kdsInput: kdsInputMode("kds_input").notNull().default("hybrid"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("user_operational_preferences_scope_idx").on(
      table.tenantId,
      table.branchId,
      table.userId,
    ),
  ],
);

export const operationalPins = pgTable(
  "operational_pins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    pinHash: text("pin_hash").notNull(),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("operational_pins_user_idx").on(table.tenantId, table.branchId, table.userId),
  ],
);

export const operationalDevices = pgTable(
  "operational_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    kind: varchar("kind", { length: 40 }).notNull(),
    tokenHash: text("token_hash").notNull(),
    status: operationalDeviceStatus("status").notNull().default("active"),
    theme: themeMode("theme").notNull().default("system"),
    kdsInput: kdsInputMode("kds_input").notNull().default("hybrid"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("operational_devices_token_idx").on(table.tokenHash),
    index("operational_devices_scope_idx").on(table.tenantId, table.branchId, table.status),
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
    version: integer("version").notNull().default(1),
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
    areaId: uuid("area_id"),
    code: varchar("code", { length: 40 }).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    seats: integer("seats").notNull().default(2),
    shape: varchar("shape", { length: 20 }).notNull().default("rounded"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    status: tableStatus("status").notNull().default("free"),
    version: integer("version").notNull().default(1),
    groupId: uuid("group_id"),
    reservedName: varchar("reserved_name", { length: 120 }),
    qrTokenHash: text("qr_token_hash"),
    qrTokenVersion: integer("qr_token_version").notNull().default(1),
    qrStatus: qrTableStatus("qr_status").notNull().default("active"),
    qrRotatedAt: timestamp("qr_rotated_at", { withTimezone: true }),
    qrRotatedByUserId: uuid("qr_rotated_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("dining_tables_code_branch_idx").on(table.branchId, table.code),
    index("dining_tables_tenant_branch_idx").on(table.tenantId, table.branchId),
    check("dining_tables_version_check", sql`${table.version} > 0`),
  ],
);

export const qrBranchSettings = pgTable(
  "qr_branch_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    capabilities: jsonb("capabilities")
      .$type<
        Array<
          | "menu"
          | "order"
          | "review_before_kds"
          | "track_preparation"
          | "view_tab"
          | "call_waiter"
          | "request_pre_bill"
        >
      >()
      .notNull()
      .default([
        "menu",
        "order",
        "track_preparation",
        "view_tab",
        "call_waiter",
        "request_pre_bill",
      ]),
    reviewBeforeKds: boolean("review_before_kds").notNull().default(false),
    template: varchar("template", { length: 40 }).notNull().default("classic"),
    primaryColor: varchar("primary_color", { length: 16 }).notNull().default("#FFCC00"),
    instruction: varchar("instruction", { length: 180 })
      .notNull()
      .default("Aponte a câmera para acessar o cardápio"),
    showLogo: boolean("show_logo").notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("qr_branch_settings_branch_idx").on(table.branchId),
    index("qr_branch_settings_tenant_branch_idx").on(table.tenantId, table.branchId),
  ],
);

export const guestExperienceConfigStatus = pgEnum("guest_experience_config_status", [
  "draft",
  "published",
  "archived",
]);

export const guestExperienceConfigs = pgTable(
  "guest_experience_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    version: integer("version").notNull(),
    status: guestExperienceConfigStatus("status").notNull().default("draft"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("guest_experience_branch_version_idx").on(table.branchId, table.version),
    index("guest_experience_tenant_branch_status_idx").on(
      table.tenantId,
      table.branchId,
      table.status,
    ),
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

export const suppliers = pgTable(
  "suppliers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    document: varchar("document", { length: 32 }),
    contactName: varchar("contact_name", { length: 160 }),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 255 }),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => [index("suppliers_tenant_idx").on(table.tenantId)],
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
    supplierId: uuid("supplier_id").references(() => suppliers.id),
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
    guestLabel: varchar("guest_label", { length: 60 }),
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
    uniqueIndex("orders_one_active_per_table_idx")
      .on(table.tenantId, table.tableId)
      .where(
        sql`${table.tableId} is not null and ${table.status} in ('draft', 'opened', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'waiting_payment', 'partially_paid')`,
      ),
    check("orders_version_check", sql`${table.version} > 0`),
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
    sourceChannel: varchar("source_channel", { length: 20 }).notNull().default("pos"),
    status: orderItemStatus("status").notNull().default("pending"),
    notes: text("notes"),
    modifiers: jsonb("modifiers").$type<Record<string, unknown>[]>().notNull().default([]),
    sentToKitchenAt: timestamp("sent_to_kitchen_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("order_items_tenant_order_idx").on(table.tenantId, table.orderId),
    index("order_items_tenant_source_status_idx").on(
      table.tenantId,
      table.sourceChannel,
      table.status,
    ),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    orderId: uuid("order_id").references(() => orders.id),
    provider: varchar("provider", { length: 40 }).notNull().default("manual"),
    method: varchar("method", { length: 40 }).notNull(),
    status: paymentStatus("status").notNull().default("pending"),
    amountCents: integer("amount_cents").notNull(),
    externalId: varchar("external_id", { length: 160 }),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    registeredByUserId: uuid("registered_by_user_id").references(() => users.id),
    registeredVia: varchar("registered_via", { length: 20 }).notNull().default("cashier"),
    cashHandoverStatus: cashHandoverStatus("cash_handover_status")
      .notNull()
      .default("not_required"),
    cashHandoverReceivedByUserId: uuid("cash_handover_received_by_user_id").references(
      () => users.id,
    ),
    cashHandoverReceivedAt: timestamp("cash_handover_received_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payments_idempotency_idx").on(table.tenantId, table.idempotencyKey),
    index("payments_tenant_order_idx").on(table.tenantId, table.orderId),
  ],
);

export const operationPolicies = pgTable(
  "operation_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    roleId: uuid("role_id").references(() => roles.id),
    maxDiscountWithoutApprovalBps: integer("max_discount_without_approval_bps")
      .notNull()
      .default(0),
    requireCancellationReason: boolean("require_cancellation_reason").notNull().default(true),
    requireApprovalAfterKitchen: boolean("require_approval_after_kitchen").notNull().default(true),
    returnStockOnApprovedCancellation: boolean("return_stock_on_approved_cancellation")
      .notNull()
      .default(true),
    managerPinHash: text("manager_pin_hash"),
    ...timestamps,
  },
  (table) => [
    index("operation_policies_scope_idx").on(table.tenantId, table.branchId, table.roleId),
  ],
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    entityType: varchar("entity_type", { length: 60 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    action: varchar("action", { length: 80 }).notNull(),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => users.id),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    requestedValueCents: integer("requested_value_cents"),
    approvedValueCents: integer("approved_value_cents"),
    reason: text("reason"),
    decisionReason: text("decision_reason"),
    status: approvalStatus("status").notNull().default("pending"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("approval_requests_tenant_status_idx").on(table.tenantId, table.status),
    index("approval_requests_entity_idx").on(table.tenantId, table.entityType, table.entityId),
  ],
);

export const floorAreas = pgTable(
  "floor_areas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    layout: jsonb("layout").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("floor_areas_branch_name_idx").on(table.branchId, table.name),
    index("floor_areas_tenant_branch_idx").on(table.tenantId, table.branchId),
  ],
);

export const reservations = pgTable(
  "reservations",
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
    customerName: varchar("customer_name", { length: 160 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 40 }),
    partySize: integer("party_size").notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(120),
    toleranceMinutes: integer("tolerance_minutes").notNull().default(15),
    version: integer("version").notNull().default(1),
    status: reservationStatus("status").notNull().default("booked"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    seatedAt: timestamp("seated_at", { withTimezone: true }),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("reservations_tenant_branch_status_idx").on(table.tenantId, table.branchId, table.status),
    index("reservations_table_schedule_idx").on(table.tableId, table.scheduledAt),
    check("reservations_party_size_check", sql`${table.partySize} > 0`),
    check("reservations_duration_check", sql`${table.durationMinutes} > 0`),
    check("reservations_tolerance_check", sql`${table.toleranceMinutes} >= 0`),
    check("reservations_version_check", sql`${table.version} > 0`),
  ],
);

export const reservationTables = pgTable(
  "reservation_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    reservationId: uuid("reservation_id")
      .notNull()
      .references(() => reservations.id),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id),
    isPrimary: boolean("is_primary").notNull().default(false),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("reservation_tables_assignment_idx").on(
      table.tenantId,
      table.reservationId,
      table.tableId,
    ),
    index("reservation_tables_schedule_lookup_idx").on(table.tenantId, table.tableId),
  ],
);

export const waitlistEntries = pgTable(
  "waitlist_entries",
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
    customerName: varchar("customer_name", { length: 160 }).notNull(),
    customerPhone: varchar("customer_phone", { length: 40 }),
    partySize: integer("party_size").notNull(),
    status: waitlistStatus("status").notNull().default("waiting"),
    quotedWaitMinutes: integer("quoted_wait_minutes"),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    seatedAt: timestamp("seated_at", { withTimezone: true }),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("waitlist_entries_tenant_branch_status_idx").on(
      table.tenantId,
      table.branchId,
      table.status,
    ),
  ],
);

export const tableEvents = pgTable(
  "table_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id),
    reservationId: uuid("reservation_id").references(() => reservations.id),
    orderId: uuid("order_id").references(() => orders.id),
    targetTableId: uuid("target_table_id").references(() => diningTables.id),
    type: varchar("type", { length: 80 }).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("table_events_tenant_table_idx").on(table.tenantId, table.tableId, table.createdAt),
  ],
);

export const serviceRequests = pgTable(
  "service_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id),
    orderId: uuid("order_id").references(() => orders.id),
    type: varchar("type", { length: 40 })
      .$type<"call_waiter" | "request_pre_bill" | "need_help">()
      .notNull(),
    status: serviceRequestStatus("status").notNull().default("pending"),
    requesterKeyHash: text("requester_key_hash"),
    message: varchar("message", { length: 180 }),
    acknowledgedByUserId: uuid("acknowledged_by_user_id").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("service_requests_tenant_branch_status_idx").on(
      table.tenantId,
      table.branchId,
      table.status,
    ),
    index("service_requests_table_created_idx").on(table.tableId, table.createdAt),
  ],
);

export const publicRequestIdempotency = pgTable(
  "public_request_idempotency",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id),
    action: varchar("action", { length: 60 }).notNull(),
    idempotencyKeyHash: text("idempotency_key_hash").notNull(),
    payloadHash: text("payload_hash").notNull(),
    response: jsonb("response").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("public_request_idempotency_key_idx").on(
      table.tableId,
      table.action,
      table.idempotencyKeyHash,
    ),
    index("public_request_idempotency_created_idx").on(table.tenantId, table.createdAt),
  ],
);

export const onboardingSteps = pgTable(
  "onboarding_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    stepKey: varchar("step_key", { length: 80 }).notNull(),
    status: onboardingStepStatus("status").notNull().default("pending"),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    skippedAt: timestamp("skipped_at", { withTimezone: true }),
    blockedReason: text("blocked_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("onboarding_steps_tenant_branch_key_idx").on(
      table.tenantId,
      table.branchId,
      table.stepKey,
    ),
    index("onboarding_steps_tenant_status_idx").on(table.tenantId, table.status),
  ],
);

export const operationIdempotency = pgTable(
  "operation_idempotency",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    scope: varchar("scope", { length: 80 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    requestHash: text("request_hash").notNull(),
    status: varchar("status", { length: 24 }).notNull().default("processing"),
    response: jsonb("response").$type<Record<string, unknown>>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("operation_idempotency_scope_key_idx").on(
      table.tenantId,
      table.branchId,
      table.scope,
      table.idempotencyKey,
    ),
  ],
);

export const operationalEvents = pgTable(
  "operational_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: bigserial("version", { mode: "number" }).notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    type: varchar("type", { length: 120 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 120 }).notNull(),
    aggregateId: uuid("aggregate_id"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("operational_events_version_idx").on(table.version),
    index("operational_events_scope_version_idx").on(table.tenantId, table.branchId, table.version),
  ],
);

export const operationalShifts = pgTable(
  "operational_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    openedByUserId: uuid("opened_by_user_id")
      .notNull()
      .references(() => users.id),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id),
    status: operationalShiftStatus("status").notNull().default("open"),
    version: integer("version").notNull().default(1),
    closeIdempotencyKey: varchar("close_idempotency_key", { length: 180 }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    notes: text("notes"),
    openingContext: jsonb("opening_context").$type<Record<string, unknown>>().notNull().default({}),
    closingSummary: jsonb("closing_summary").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("operational_shifts_tenant_branch_status_idx").on(
      table.tenantId,
      table.branchId,
      table.status,
    ),
    uniqueIndex("operational_shifts_one_open_idx")
      .on(table.tenantId, table.branchId)
      .where(sql`${table.status} = 'open'`),
    uniqueIndex("operational_shifts_close_idempotency_idx")
      .on(table.tenantId, table.closeIdempotencyKey)
      .where(sql`${table.closeIdempotencyKey} is not null`),
    check("operational_shifts_version_check", sql`${table.version} > 0`),
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
    version: integer("version").notNull().default(1),
    closeIdempotencyKey: varchar("close_idempotency_key", { length: 120 }),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("cash_sessions_tenant_branch_idx").on(table.tenantId, table.branchId),
    uniqueIndex("cash_sessions_one_open_per_branch_idx")
      .on(table.tenantId, table.branchId)
      .where(sql`${table.status} = 'open'`),
    uniqueIndex("cash_sessions_close_idempotency_idx").on(
      table.tenantId,
      table.closeIdempotencyKey,
    ),
    check("cash_sessions_version_positive", sql`${table.version} > 0`),
  ],
);

export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    cashSessionId: uuid("cash_session_id")
      .notNull()
      .references(() => cashSessions.id),
    type: cashMovementType("type").notNull(),
    amountCents: integer("amount_cents").notNull(),
    reason: text("reason").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("cash_movements_tenant_session_idx").on(table.tenantId, table.cashSessionId),
    index("cash_movements_tenant_branch_idx").on(table.tenantId, table.branchId),
  ],
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
    outputMode: productionOutputMode("output_mode").notNull().default("kds"),
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
    channel: varchar("channel", { length: 40 }).notNull(), // own_app, ifood, rappi, phone
    status: deliveryStatus("status").notNull().default("pending"),
    customerName: varchar("customer_name", { length: 160 }),
    customerPhone: varchar("customer_phone", { length: 40 }),
    deliveryAddress: text("delivery_address"),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    estimatedMinutes: integer("estimated_minutes"),
    riderName: varchar("rider_name", { length: 120 }),
    riderPhone: varchar("rider_phone", { length: 40 }),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    index("delivery_orders_tenant_idx").on(table.tenantId),
    index("delivery_orders_order_idx").on(table.orderId),
  ],
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

export const fiscalCertificates = pgTable(
  "fiscal_certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    type: varchar("type", { length: 20 }).notNull().default("a1"),
    dataEncrypted: text("data_encrypted").notNull(),
    filename: varchar("filename", { length: 255 }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    validationError: text("validation_error"),
    isActive: boolean("is_active").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("fiscal_certificates_tenant_idx").on(table.tenantId),
    index("fiscal_certificates_tenant_branch_idx").on(table.tenantId, table.branchId),
  ],
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
