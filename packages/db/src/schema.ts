import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
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
  "written_off",
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
  "unknown",
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
export const waiterResponsibilityPolicy = pgEnum("waiter_responsibility_policy", [
  "strict",
  "collaborative",
]);
export const qrMode = pgEnum("qr_mode", [
  "disabled",
  "menu_only",
  "waiter_assisted",
  "self_service",
]);
export const tableServiceSessionStatus = pgEnum("table_service_session_status", [
  "active",
  "closed",
  "revoked",
]);
export const qrGuestSessionStatus = pgEnum("qr_guest_session_status", [
  "active",
  "revoked",
  "expired",
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

export const tenantEntitlements = pgTable(
  "tenant_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id),
    code: varchar("code", { length: 120 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("active"),
    source: varchar("source", { length: 40 }).notNull().default("platform"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("tenant_entitlements_tenant_code_idx").on(table.tenantId, table.code),
    index("tenant_entitlements_tenant_status_idx").on(table.tenantId, table.status),
  ],
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

export const ecosystemCampaigns = pgTable(
  "ecosystem_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id").references(() => branches.id),
    sourceProduct: varchar("source_product", { length: 40 }).notNull(),
    targetProduct: varchar("target_product", { length: 40 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    name: varchar("name", { length: 160 }).notNull(),
    message: varchar("message", { length: 500 }).notNull(),
    targetUrl: text("target_url").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("ecosystem_campaigns_tenant_status_idx").on(table.tenantId, table.status),
    index("ecosystem_campaigns_branch_status_idx").on(table.branchId, table.status),
  ],
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
    waiterResponsibilityPolicy: waiterResponsibilityPolicy("waiter_responsibility_policy")
      .notNull()
      .default("collaborative"),
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
    initialMode: varchar("initial_mode", { length: 40 }).notNull().default("table"),
    stationId: uuid("station_id").references(() => kdsStations.id),
    printerDeviceId: uuid("printer_device_id").references(() => printerDevices.id),
    allowModeSwitch: boolean("allow_mode_switch").notNull().default(false),
    tokenHash: text("token_hash").notNull(),
    status: operationalDeviceStatus("status").notNull().default("active"),
    theme: themeMode("theme").notNull().default("system"),
    kdsInput: kdsInputMode("kds_input").notNull().default("hybrid"),
    provider: varchar("provider", { length: 40 }),
    providerTerminalId: varchar("provider_terminal_id", { length: 160 }),
    capabilities: jsonb("capabilities").$type<Record<string, unknown>>().notNull().default({}),
    pairedAt: timestamp("paired_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
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
    check("operational_devices_version_check", sql`${table.version} > 0`),
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

export const federationHandoffs = pgTable(
  "federation_handoffs",
  {
    id: uuid("id").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    targetProduct: varchar("target_product", { length: 40 }).notNull(),
    audience: varchar("audience", { length: 80 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index("federation_handoffs_tenant_user_idx").on(table.tenantId, table.userId),
    index("federation_handoffs_expiry_idx").on(table.expiresAt),
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
  (table) => [
    index("invitations_tenant_idx").on(table.tenantId),
    uniqueIndex("invitations_token_hash_idx").on(table.tokenHash),
  ],
);

export const legalAcceptances = pgTable(
  "legal_acceptances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    documentType: varchar("document_type", { length: 32 }).notNull(),
    documentVersion: varchar("document_version", { length: 80 }).notNull(),
    documentHash: varchar("document_hash", { length: 64 }).notNull(),
    origin: varchar("origin", { length: 80 }).notNull(),
    ipAddress: varchar("ip_address", { length: 80 }),
    userAgent: text("user_agent"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("legal_acceptances_tenant_user_idx").on(table.tenantId, table.userId),
    uniqueIndex("legal_acceptances_document_idx").on(
      table.tenantId,
      table.userId,
      table.documentType,
      table.documentVersion,
      table.documentHash,
    ),
    check(
      "legal_acceptances_hash_check",
      sql`length(${table.documentHash}) = 64 and ${table.documentHash} ~ '^[0-9a-f]+$'`,
    ),
  ],
);

export const commercialInterests = pgTable(
  "commercial_interests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    product: varchar("product", { length: 32 }).notNull(),
    planCode: varchar("plan_code", { length: 32 }),
    origin: varchar("origin", { length: 80 }).notNull(),
    establishmentName: varchar("establishment_name", { length: 160 }).notNull(),
    contactName: varchar("contact_name", { length: 160 }).notNull(),
    email: varchar("email", { length: 255 }).notNull(),
    phone: varchar("phone", { length: 32 }),
    message: text("message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("commercial_interests_created_idx").on(table.createdAt),
    check("commercial_interests_product_check", sql`${table.product} in ('giromesa')`),
    check(
      "commercial_interests_plan_check",
      sql`${table.planCode} is null or ${table.planCode} in ('starter', 'professional', 'premium')`,
    ),
  ],
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
    mode: qrMode("mode").notNull().default("waiter_assisted"),
    presenceMethods: jsonb("presence_methods")
      .$type<Array<"code" | "approval" | "network">>()
      .notNull()
      .default(["code"]),
    tabVisibility: varchar("tab_visibility", { length: 24 })
      .$type<"shared" | "own_items">()
      .notNull()
      .default("shared"),
    guestSessionTtlMinutes: integer("guest_session_ttl_minutes").notNull().default(720),
    presenceCodeTtlMinutes: integer("presence_code_ttl_minutes").notNull().default(30),
    trustedNetworkCidrs: jsonb("trusted_network_cidrs").$type<string[]>().notNull().default([]),
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

export const commercialAttributionDaily = pgTable(
  "commercial_attribution_daily",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    day: date("day").notNull(),
    source: varchar("source", { length: 40 }).notNull().default("qr_organic"),
    destination: varchar("destination", { length: 40 }).notNull(),
    campaign: varchar("campaign", { length: 80 }).notNull().default("organic_attribution"),
    visits: integer("visits").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("commercial_attribution_daily_rollup_idx").on(
      table.tenantId,
      table.branchId,
      table.day,
      table.source,
      table.destination,
      table.campaign,
    ),
    index("commercial_attribution_daily_tenant_day_idx").on(table.tenantId, table.day),
    check("commercial_attribution_daily_visits_check", sql`${table.visits} >= 0`),
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
    isAlcoholic: boolean("is_alcoholic").notNull().default(false),
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
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("stock_locations_tenant_branch_idx").on(table.tenantId, table.branchId),
    uniqueIndex("stock_locations_one_transit_idx")
      .on(table.tenantId, table.branchId)
      .where(sql`${table.type} = 'transit' and ${table.archivedAt} is null`),
  ],
);

export const branchInventorySettings = pgTable(
  "branch_inventory_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    transferMode: varchar("transfer_mode", { length: 24 }).notNull().default("immediate"),
    consumptionLocationId: uuid("consumption_location_id").references(() => stockLocations.id),
    managerApprovalThreshold: numeric("manager_approval_threshold", {
      precision: 14,
      scale: 3,
    })
      .notNull()
      .default("0"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("branch_inventory_settings_scope_idx").on(table.tenantId, table.branchId),
    check(
      "branch_inventory_settings_transfer_mode_check",
      sql`${table.transferMode} in ('immediate', 'awaiting_receipt')`,
    ),
    check(
      "branch_inventory_settings_approval_threshold_check",
      sql`${table.managerApprovalThreshold} >= 0 and ${table.managerApprovalThreshold} <= 100`,
    ),
  ],
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

export const inventoryTransfers = pgTable(
  "inventory_transfers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    originLocationId: uuid("origin_location_id")
      .notNull()
      .references(() => stockLocations.id),
    destinationLocationId: uuid("destination_location_id")
      .notNull()
      .references(() => stockLocations.id),
    transitLocationId: uuid("transit_location_id").references(() => stockLocations.id),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    receivedByUserId: uuid("received_by_user_id").references(() => users.id),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    mode: varchar("mode", { length: 24 }).notNull().default("immediate"),
    reason: text("reason").notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
    version: integer("version").notNull().default(1),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    reversedAt: timestamp("reversed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inventory_transfers_tenant_key_idx").on(table.tenantId, table.idempotencyKey),
    index("inventory_transfers_branch_status_idx").on(table.tenantId, table.branchId, table.status),
    check(
      "inventory_transfers_status_check",
      sql`${table.status} in ('draft', 'awaiting_receipt', 'completed', 'cancelled')`,
    ),
    check(
      "inventory_transfers_mode_check",
      sql`${table.mode} in ('immediate', 'awaiting_receipt')`,
    ),
    check(
      "inventory_transfers_distinct_locations_check",
      sql`${table.originLocationId} <> ${table.destinationLocationId}`,
    ),
    check("inventory_transfers_version_check", sql`${table.version} > 0`),
  ],
);

export const inventoryTransferLines = pgTable(
  "inventory_transfer_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => inventoryTransfers.id),
    inventoryItemId: uuid("inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id),
    quantitySent: numeric("quantity_sent", { precision: 14, scale: 3 }).notNull(),
    quantityReceived: numeric("quantity_received", { precision: 14, scale: 3 }),
    divergenceReason: text("divergence_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("inventory_transfer_lines_item_idx").on(
      table.tenantId,
      table.transferId,
      table.inventoryItemId,
    ),
    check("inventory_transfer_lines_sent_check", sql`${table.quantitySent} > 0`),
    check(
      "inventory_transfer_lines_received_check",
      sql`${table.quantityReceived} is null or (${table.quantityReceived} >= 0 and ${table.quantityReceived} <= ${table.quantitySent})`,
    ),
  ],
);

export const returnableMappings = pgTable(
  "returnable_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    fullInventoryItemId: uuid("full_inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id),
    emptyInventoryItemId: uuid("empty_inventory_item_id")
      .notNull()
      .references(() => inventoryItems.id),
    ...timestamps,
  },
  (table) => [uniqueIndex("returnable_mappings_product_idx").on(table.tenantId, table.productId)],
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
    shiftId: uuid("shift_id").references(() => operationalShifts.id),
    serviceChargeSuggestedCents: integer("service_charge_suggested_cents").notNull().default(0),
    serviceChargeStatus: varchar("service_charge_status", { length: 24 })
      .$type<"not_configured" | "suggested" | "accepted" | "removed" | "manual">()
      .notNull()
      .default("not_configured"),
    serviceChargePolicySnapshot: jsonb("service_charge_policy_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
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

export const tableWaiterAssignments = pgTable(
  "table_waiter_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => operationalShifts.id),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id),
    waiterUserId: uuid("waiter_user_id")
      .notNull()
      .references(() => users.id),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id),
    source: varchar("source", { length: 32 })
      .$type<"manager" | "area" | "first_service" | "transfer">()
      .notNull(),
    reason: varchar("reason", { length: 240 }),
    version: integer("version").notNull().default(1),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedByUserId: uuid("ended_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("table_waiter_assignments_one_active_idx")
      .on(table.tenantId, table.shiftId, table.tableId)
      .where(sql`${table.endedAt} is null`),
    index("table_waiter_assignments_waiter_idx").on(
      table.tenantId,
      table.branchId,
      table.shiftId,
      table.waiterUserId,
    ),
    index("table_waiter_assignments_table_idx").on(
      table.tenantId,
      table.branchId,
      table.shiftId,
      table.tableId,
    ),
    check("table_waiter_assignments_version_check", sql`${table.version} > 0`),
  ],
);

export const tableServiceSessions = pgTable(
  "table_service_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    shiftId: uuid("shift_id").references(() => operationalShifts.id),
    tableId: uuid("table_id")
      .notNull()
      .references(() => diningTables.id),
    orderId: uuid("order_id").references(() => orders.id),
    status: tableServiceSessionStatus("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    mode: qrMode("mode").notNull().default("waiter_assisted"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    presenceMethods: jsonb("presence_methods").$type<string[]>().notNull().default(["code"]),
    tabVisibility: varchar("tab_visibility", { length: 24 })
      .$type<"shared" | "own_items">()
      .notNull()
      .default("shared"),
    guestSessionTtlMinutes: integer("guest_session_ttl_minutes").notNull().default(720),
    presenceCodeHash: text("presence_code_hash"),
    presenceCodeExpiresAt: timestamp("presence_code_expires_at", { withTimezone: true }),
    presenceCodeAttempts: integer("presence_code_attempts").notNull().default(0),
    activatedByUserId: uuid("activated_by_user_id").references(() => users.id),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: varchar("revoke_reason", { length: 240 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("table_service_sessions_one_active_idx")
      .on(table.tenantId, table.tableId)
      .where(sql`${table.status} = 'active'`),
    index("table_service_sessions_branch_table_idx").on(
      table.tenantId,
      table.branchId,
      table.tableId,
    ),
    index("table_service_sessions_order_idx").on(table.tenantId, table.orderId),
    check("table_service_sessions_version_check", sql`${table.version} > 0`),
  ],
);

export const qrGuestSessions = pgTable(
  "qr_guest_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    tableServiceSessionId: uuid("table_service_session_id")
      .notNull()
      .references(() => tableServiceSessions.id),
    tokenHash: text("token_hash").notNull(),
    validationMethod: varchar("validation_method", { length: 24 })
      .$type<"code" | "approval" | "network">()
      .notNull(),
    status: qrGuestSessionStatus("status").notNull().default("active"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("qr_guest_sessions_token_hash_idx").on(table.tokenHash),
    index("qr_guest_sessions_active_idx").on(
      table.tenantId,
      table.branchId,
      table.tableServiceSessionId,
      table.status,
    ),
  ],
);

export const qrGuestAccessRequests = pgTable(
  "qr_guest_access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    tableServiceSessionId: uuid("table_service_session_id")
      .notNull()
      .references(() => tableServiceSessions.id),
    claimKeyHash: text("claim_key_hash").notNull(),
    status: varchar("status", { length: 24 })
      .$type<"pending" | "approved" | "rejected" | "claimed" | "expired">()
      .notNull()
      .default("pending"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("qr_guest_access_requests_claim_key_idx").on(table.claimKeyHash),
    index("qr_guest_access_requests_pending_idx").on(
      table.tenantId,
      table.branchId,
      table.tableServiceSessionId,
      table.status,
    ),
  ],
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
    registeredByUserId: uuid("registered_by_user_id").references(() => users.id),
    shiftId: uuid("shift_id").references(() => operationalShifts.id),
    responsibleWaiterUserId: uuid("responsible_waiter_user_id").references(() => users.id),
    tableServiceSessionId: uuid("table_service_session_id").references(
      () => tableServiceSessions.id,
    ),
    qrGuestSessionId: uuid("qr_guest_session_id").references(() => qrGuestSessions.id),
    status: orderItemStatus("status").notNull().default("pending"),
    notes: text("notes"),
    modifiers: jsonb("modifiers").$type<Record<string, unknown>[]>().notNull().default([]),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
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
    uniqueIndex("order_items_idempotency_idx").on(table.tenantId, table.idempotencyKey),
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
    executionMode: varchar("execution_mode", { length: 20 }).notNull().default("manual"),
    terminalDeviceId: uuid("terminal_device_id").references(() => operationalDevices.id),
    providerReference: varchar("provider_reference", { length: 160 }),
    originalPaymentId: uuid("original_payment_id").references((): AnyPgColumn => payments.id),
    paymentType: varchar("payment_type", { length: 20 }).notNull().default("charge"),
    resultUnknownAt: timestamp("result_unknown_at", { withTimezone: true }),
    lastQueriedAt: timestamp("last_queried_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
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
    index("payments_tenant_original_idx").on(table.tenantId, table.originalPaymentId),
    check("payments_amount_check", sql`${table.amountCents} > 0`),
    check("payments_version_check", sql`${table.version} > 0`),
  ],
);

export const paymentAllocations = pgTable(
  "payment_allocations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id),
    orderItemId: uuid("order_item_id").references(() => orderItems.id),
    seatLabel: varchar("seat_label", { length: 80 }),
    amountCents: integer("amount_cents").notNull(),
    allocatedByUserId: uuid("allocated_by_user_id")
      .notNull()
      .references(() => users.id),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payment_allocations_idempotency_idx").on(table.tenantId, table.idempotencyKey),
    index("payment_allocations_tenant_order_idx").on(table.tenantId, table.orderId),
    index("payment_allocations_tenant_payment_idx").on(table.tenantId, table.paymentId),
    index("payment_allocations_tenant_item_idx").on(table.tenantId, table.orderItemId),
    check("payment_allocations_amount_check", sql`${table.amountCents} > 0`),
    check(
      "payment_allocations_target_check",
      sql`(${table.orderItemId} is not null and ${table.seatLabel} is null) or (${table.orderItemId} is null and ${table.seatLabel} is not null)`,
    ),
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
    tableServiceSessionId: uuid("table_service_session_id").references(
      () => tableServiceSessions.id,
    ),
    qrGuestSessionId: uuid("qr_guest_session_id").references(() => qrGuestSessions.id),
    type: varchar("type", { length: 40 })
      .$type<
        "call_waiter" | "request_pre_bill" | "need_help" | "split_intent" | "payment_preference"
      >()
      .notNull(),
    status: serviceRequestStatus("status").notNull().default("pending"),
    requesterKeyHash: text("requester_key_hash"),
    message: varchar("message", { length: 180 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
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
    sourceType: varchar("source_type", { length: 60 }),
    sourceId: uuid("source_id"),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    index("cash_movements_tenant_session_idx").on(table.tenantId, table.cashSessionId),
    index("cash_movements_tenant_branch_idx").on(table.tenantId, table.branchId),
    uniqueIndex("cash_movements_idempotency_idx")
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  ],
);

export const staffServicePolicies = pgTable(
  "staff_service_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    version: integer("version").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(false),
    attributionMode: varchar("attribution_mode", { length: 32 })
      .$type<"table_responsible" | "item_author" | "shift_pool">()
      .notNull(),
    serviceRateBps: integer("service_rate_bps").notNull().default(1000),
    serviceBase: varchar("service_base", { length: 32 })
      .$type<"net_consumption" | "gross_consumption" | "manual">()
      .notNull()
      .default("net_consumption"),
    requireWaiterConfirmation: boolean("require_waiter_confirmation").notNull().default(false),
    poolRules: jsonb("pool_rules").$type<Record<string, unknown>>().notNull().default({}),
    confirmedLegalReview: boolean("confirmed_legal_review").notNull().default(false),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    idempotencyPayloadHash: varchar("idempotency_payload_hash", { length: 64 }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("staff_service_policies_version_idx").on(
      table.tenantId,
      table.branchId,
      table.version,
    ),
    uniqueIndex("staff_service_policies_one_active_idx")
      .on(table.tenantId, table.branchId)
      .where(sql`${table.isActive}`),
    uniqueIndex("staff_service_policies_idempotency_idx")
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    check(
      "staff_service_policies_rate_check",
      sql`${table.serviceRateBps} >= 0 and ${table.serviceRateBps} <= 10000`,
    ),
  ],
);

export const waiterShiftSettlements = pgTable(
  "waiter_shift_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => operationalShifts.id),
    waiterUserId: uuid("waiter_user_id")
      .notNull()
      .references(() => users.id),
    revision: integer("revision").notNull().default(1),
    supersedesId: uuid("supersedes_id"),
    status: varchar("status", { length: 32 })
      .$type<"calculating" | "awaiting_confirmation" | "checked" | "closed" | "reopened">()
      .notNull()
      .default("calculating"),
    policyId: uuid("policy_id").references(() => staffServicePolicies.id),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    grossSalesCents: integer("gross_sales_cents").notNull().default(0),
    cancelledCents: integer("cancelled_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    netConsumptionCents: integer("net_consumption_cents").notNull().default(0),
    serviceSuggestedCents: integer("service_suggested_cents").notNull().default(0),
    serviceReceivedCents: integer("service_received_cents").notNull().default(0),
    pooledServiceCents: integer("pooled_service_cents").notNull().default(0),
    pendingCashCents: integer("pending_cash_cents").notNull().default(0),
    adjustmentsCents: integer("adjustments_cents").notNull().default(0),
    occurrenceOpenCents: integer("occurrence_open_cents").notNull().default(0),
    occurrenceRecoveredCents: integer("occurrence_recovered_cents").notNull().default(0),
    commissionAccruedCents: integer("commission_accrued_cents").notNull().default(0),
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(1),
    calculateIdempotencyKey: varchar("calculate_idempotency_key", { length: 180 }),
    calculatePayloadHash: varchar("calculate_payload_hash", { length: 64 }),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
    ledgerHash: varchar("ledger_hash", { length: 64 }).notNull(),
    closeIdempotencyKey: varchar("close_idempotency_key", { length: 180 }),
    waiterConfirmedAt: timestamp("waiter_confirmed_at", { withTimezone: true }),
    checkedByUserId: uuid("checked_by_user_id").references(() => users.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    reopenReason: varchar("reopen_reason", { length: 500 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("waiter_shift_settlements_revision_idx").on(
      table.tenantId,
      table.shiftId,
      table.waiterUserId,
      table.revision,
    ),
    uniqueIndex("waiter_shift_settlements_calculate_key_idx")
      .on(table.tenantId, table.calculateIdempotencyKey)
      .where(sql`${table.calculateIdempotencyKey} is not null`),
    uniqueIndex("waiter_shift_settlements_close_key_idx")
      .on(table.tenantId, table.closeIdempotencyKey)
      .where(sql`${table.closeIdempotencyKey} is not null`),
    index("waiter_shift_settlements_shift_status_idx").on(
      table.tenantId,
      table.branchId,
      table.shiftId,
      table.status,
    ),
    check("waiter_shift_settlements_version_check", sql`${table.version} > 0`),
  ],
);

export const managerialShiftSettlements = pgTable(
  "managerial_shift_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => operationalShifts.id),
    revision: integer("revision").notNull().default(1),
    supersedesId: uuid("supersedes_id").references(
      (): AnyPgColumn => managerialShiftSettlements.id,
    ),
    status: varchar("status", { length: 32 })
      .$type<"checked" | "closed" | "reopened">()
      .notNull()
      .default("checked"),
    policyId: uuid("policy_id").references(() => staffServicePolicies.id),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    grossSalesCents: integer("gross_sales_cents").notNull().default(0),
    cancelledCents: integer("cancelled_cents").notNull().default(0),
    discountCents: integer("discount_cents").notNull().default(0),
    netConsumptionCents: integer("net_consumption_cents").notNull().default(0),
    netPaidCents: integer("net_paid_cents").notNull().default(0),
    serviceSuggestedCents: integer("service_suggested_cents").notNull().default(0),
    serviceReceivedCents: integer("service_received_cents").notNull().default(0),
    pendingCashCents: integer("pending_cash_cents").notNull().default(0),
    breakdown: jsonb("breakdown").$type<Record<string, unknown>>().notNull().default({}),
    version: integer("version").notNull().default(1),
    calculateIdempotencyKey: varchar("calculate_idempotency_key", { length: 180 }),
    calculatePayloadHash: varchar("calculate_payload_hash", { length: 64 }),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
    ledgerHash: varchar("ledger_hash", { length: 64 }).notNull(),
    closeIdempotencyKey: varchar("close_idempotency_key", { length: 180 }),
    checkedByUserId: uuid("checked_by_user_id").references(() => users.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    closedByUserId: uuid("closed_by_user_id").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    reopenReason: varchar("reopen_reason", { length: 500 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("managerial_shift_settlements_revision_idx").on(
      table.tenantId,
      table.shiftId,
      table.revision,
    ),
    uniqueIndex("managerial_shift_settlements_calculate_key_idx").on(
      table.tenantId,
      table.branchId,
      table.shiftId,
      table.calculateIdempotencyKey,
    ),
    index("managerial_shift_settlements_shift_status_idx").on(
      table.tenantId,
      table.branchId,
      table.shiftId,
      table.status,
    ),
    check("managerial_shift_settlements_version_check", sql`${table.version} > 0`),
  ],
);

export const operationalOccurrences = pgTable(
  "operational_occurrences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    shiftId: uuid("shift_id").references(() => operationalShifts.id),
    tableId: uuid("table_id").references(() => diningTables.id),
    orderId: uuid("order_id").references(() => orders.id),
    responsibleWaiterUserId: uuid("responsible_waiter_user_id").references(() => users.id),
    type: varchar("type", { length: 60 }).notNull(),
    initialReport: text("initial_report").notNull(),
    status: varchar("status", { length: 32 }).notNull().default("under_review"),
    decision: varchar("decision", { length: 32 }),
    version: integer("version").notNull().default(1),
    unpaidBalanceCents: integer("unpaid_balance_cents").notNull().default(0),
    menuValueCents: integer("menu_value_cents").notNull().default(0),
    serviceSuggestedCents: integer("service_suggested_cents").notNull().default(0),
    paidSnapshotCents: integer("paid_snapshot_cents").notNull().default(0),
    branchRuleSnapshot: jsonb("branch_rule_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    idempotencyPayloadHash: varchar("idempotency_payload_hash", { length: 64 }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("operational_occurrences_key_idx")
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex("operational_occurrences_open_order_type_idx")
      .on(table.tenantId, table.orderId, table.type)
      .where(sql`${table.status} in ('under_review', 'approved') and ${table.orderId} is not null`),
    index("operational_occurrences_branch_shift_idx").on(
      table.tenantId,
      table.branchId,
      table.shiftId,
      table.status,
    ),
    check("operational_occurrences_version_check", sql`${table.version} > 0`),
  ],
);

export const operationalOccurrenceEvents = pgTable(
  "operational_occurrence_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    occurrenceId: uuid("occurrence_id")
      .notNull()
      .references(() => operationalOccurrences.id),
    eventType: varchar("event_type", { length: 60 }).notNull(),
    resultingStatus: varchar("resulting_status", { length: 32 }),
    resultingDecision: varchar("resulting_decision", { length: 32 }),
    note: text("note"),
    amountCents: integer("amount_cents").notNull().default(0),
    method: varchar("method", { length: 40 }),
    reference: varchar("reference", { length: 160 }),
    cashMovementId: uuid("cash_movement_id").references(() => cashMovements.id),
    reversesEventId: uuid("reverses_event_id").references(
      (): AnyPgColumn => operationalOccurrenceEvents.id,
    ),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    idempotencyPayloadHash: varchar("idempotency_payload_hash", { length: 64 }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("operational_occurrence_events_key_idx")
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex("operational_occurrence_events_reversal_once_idx")
      .on(table.tenantId, table.reversesEventId)
      .where(sql`${table.reversesEventId} is not null`),
    index("operational_occurrence_events_occurrence_idx").on(
      table.tenantId,
      table.occurrenceId,
      table.createdAt,
    ),
  ],
);

export const commissionPolicies = pgTable(
  "commission_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: varchar("name", { length: 120 }).notNull(),
    version: integer("version").notNull(),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    status: varchar("status", { length: 24 }).notNull().default("draft"),
    model: varchar("model", { length: 32 }).notNull(),
    period: varchar("period", { length: 16 }).notNull(),
    base: varchar("base", { length: 32 }).notNull(),
    attributionMode: varchar("attribution_mode", { length: 32 }).notNull(),
    rules: jsonb("rules").$type<Record<string, unknown>>().notNull().default({}),
    confirmedLegalReview: boolean("confirmed_legal_review").notNull().default(false),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    idempotencyPayloadHash: varchar("idempotency_payload_hash", { length: 64 }),
    activationIdempotencyKey: varchar("activation_idempotency_key", { length: 180 }),
    activationPayloadHash: varchar("activation_payload_hash", { length: 64 }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("commission_policies_version_idx").on(
      table.tenantId,
      table.branchId,
      table.name,
      table.version,
    ),
    uniqueIndex("commission_policies_one_active_idx")
      .on(table.tenantId, table.branchId, table.name)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("commission_policies_idempotency_idx")
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex("commission_policies_activation_idempotency_idx")
      .on(table.tenantId, table.activationIdempotencyKey)
      .where(sql`${table.activationIdempotencyKey} is not null`),
  ],
);

export const commissionPolicyMembers = pgTable(
  "commission_policy_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => commissionPolicies.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    eligible: boolean("eligible").notNull().default(true),
    override: jsonb("override").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("commission_policy_members_unique_idx").on(
      table.tenantId,
      table.policyId,
      table.userId,
    ),
  ],
);

export const commissionAccruals = pgTable(
  "commission_accruals",
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
    policyId: uuid("policy_id")
      .notNull()
      .references(() => commissionPolicies.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    revision: integer("revision").notNull().default(1),
    supersedesId: uuid("supersedes_id"),
    policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>().notNull().default({}),
    baseCents: integer("base_cents").notNull().default(0),
    calculatedCents: integer("calculated_cents").notNull().default(0),
    approvedCents: integer("approved_cents").notNull().default(0),
    paidCents: integer("paid_cents").notNull().default(0),
    status: varchar("status", { length: 32 }).notNull().default("calculating"),
    version: integer("version").notNull().default(1),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    idempotencyPayloadHash: varchar("idempotency_payload_hash", { length: 64 }),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    reason: varchar("reason", { length: 500 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("commission_accruals_revision_idx").on(
      table.tenantId,
      table.userId,
      table.policyId,
      table.periodStart,
      table.periodEnd,
      table.revision,
    ),
    uniqueIndex("commission_accruals_key_idx")
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    check("commission_accruals_version_check", sql`${table.version} > 0`),
  ],
);

export const commissionPaymentRecords = pgTable(
  "commission_payment_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    accrualId: uuid("accrual_id")
      .notNull()
      .references(() => commissionAccruals.id),
    amountCents: integer("amount_cents").notNull(),
    informedAt: timestamp("informed_at", { withTimezone: true }).notNull(),
    method: varchar("method", { length: 40 }).notNull(),
    reference: varchar("reference", { length: 160 }),
    note: text("note"),
    cashMovementId: uuid("cash_movement_id").references(() => cashMovements.id),
    bankReconciliationStatus: varchar("bank_reconciliation_status", { length: 24 })
      .notNull()
      .default("not_applicable"),
    reversesRecordId: uuid("reverses_record_id").references(
      (): AnyPgColumn => commissionPaymentRecords.id,
    ),
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    idempotencyPayloadHash: varchar("idempotency_payload_hash", { length: 64 }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    confirmedByUserId: uuid("confirmed_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("commission_payment_records_key_idx")
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    uniqueIndex("commission_payment_records_reversal_once_idx")
      .on(table.tenantId, table.reversesRecordId)
      .where(sql`${table.reversesRecordId} is not null`),
    index("commission_payment_records_accrual_idx").on(
      table.tenantId,
      table.accrualId,
      table.createdAt,
    ),
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
    status: varchar("status", { length: 40 }).notNull().default("disabled"),
    onboardingStatus: varchar("onboarding_status", { length: 40 }).notNull().default("not_started"),
    providerCompanyId: varchar("provider_company_id", { length: 160 }),
    providerMetadata: jsonb("provider_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    productionEnabledAt: timestamp("production_enabled_at", { withTimezone: true }),
    productionEnabledBy: uuid("production_enabled_by").references(() => users.id),
    productionEnabledReason: text("production_enabled_reason"),
    certificateFingerprint: varchar("certificate_fingerprint", { length: 128 }),
    certificateExpiresAt: timestamp("certificate_expires_at", { withTimezone: true }),
    providerCertificateStatus: varchar("provider_certificate_status", { length: 40 }),
    lastReconciledAt: timestamp("last_reconciled_at", { withTimezone: true }),
    lastHealthStatus: varchar("last_health_status", { length: 40 }),
    lastHealthErrorCode: varchar("last_health_error_code", { length: 120 }),
    version: integer("version").notNull().default(1),
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

export const fiscalProviderCredentials = pgTable(
  "fiscal_provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    provider: varchar("provider", { length: 40 }).notNull(),
    environment: varchar("environment", { length: 20 }).notNull(),
    tokenEncrypted: text("token_encrypted").notNull(),
    tokenFingerprint: varchar("token_fingerprint", { length: 128 }).notNull(),
    tokenLastFour: varchar("token_last_four", { length: 4 }).notNull(),
    webhookSecretHash: varchar("webhook_secret_hash", { length: 128 }),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fiscal_provider_credentials_scope_idx").on(
      table.tenantId,
      table.branchId,
      table.provider,
      table.environment,
    ),
    index("fiscal_provider_credentials_branch_idx").on(table.tenantId, table.branchId),
  ],
);

export const fiscalAccountantInvitations = pgTable(
  "fiscal_accountant_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    email: varchar("email", { length: 254 }).notNull(),
    tokenHash: varchar("token_hash", { length: 128 }).notNull(),
    status: varchar("status", { length: 24 }).notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fiscal_accountant_invitation_token_idx").on(table.tokenHash),
    index("fiscal_accountant_invitation_scope_idx").on(
      table.tenantId,
      table.branchId,
      table.status,
    ),
  ],
);

export const fiscalOperations = pgTable(
  "fiscal_operations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    fiscalDocumentId: uuid("fiscal_document_id").references(() => fiscalDocuments.id),
    type: varchar("type", { length: 20 }).notNull(),
    environment: varchar("environment", { length: 20 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 180 }).notNull(),
    providerReference: varchar("provider_reference", { length: 160 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: varchar("lease_owner", { length: 120 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    errorCode: varchar("error_code", { length: 120 }),
    errorMessage: varchar("error_message", { length: 500 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("fiscal_operations_idempotency_idx").on(
      table.tenantId,
      table.idempotencyKey,
      table.type,
    ),
    index("fiscal_operations_claim_idx").on(table.status, table.availableAt),
  ],
);

export const branchPaymentSettings = pgTable(
  "branch_payment_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    profile: varchar("profile", { length: 32 }).notNull().default("external_terminal"),
    preferredMode: varchar("preferred_mode", { length: 20 }).notNull().default("manual"),
    allowManualFallback: boolean("allow_manual_fallback").notNull().default(true),
    reconciliationMode: varchar("reconciliation_mode", { length: 20 }).notNull().default("manual"),
    provider: varchar("provider", { length: 40 }),
    status: varchar("status", { length: 20 }).notNull().default("disabled"),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("branch_payment_settings_scope_idx").on(table.tenantId, table.branchId),
    check("branch_payment_settings_version_check", sql`${table.version} > 0`),
  ],
);

export const paymentReconciliationImports = pgTable(
  "payment_reconciliation_imports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    source: varchar("source", { length: 60 }).notNull().default("giromesa_csv"),
    mode: varchar("mode", { length: 20 }).notNull().default("import"),
    checksum: varchar("checksum", { length: 64 }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    status: varchar("status", { length: 24 }).notNull().default("processed"),
    summary: jsonb("summary").$type<Record<string, unknown>>().notNull().default({}),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payment_reconciliation_import_scope_idx").on(
      table.tenantId,
      table.branchId,
      table.source,
      table.checksum,
    ),
  ],
);

export const paymentReconciliationEntries = pgTable(
  "payment_reconciliation_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    importId: uuid("import_id")
      .notNull()
      .references(() => paymentReconciliationImports.id),
    paymentId: uuid("payment_id").references(() => payments.id),
    occurrenceId: uuid("occurrence_id").references(() => operationalOccurrences.id),
    externalKey: varchar("external_key", { length: 180 }).notNull(),
    providerReference: varchar("provider_reference", { length: 160 }),
    nsu: varchar("nsu", { length: 80 }),
    authorizationCode: varchar("authorization_code", { length: 80 }),
    grossCents: integer("gross_cents").notNull(),
    feeCents: integer("fee_cents").notNull().default(0),
    netCents: integer("net_cents").notNull(),
    expectedSettlementAt: timestamp("expected_settlement_at", { withTimezone: true }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    status: varchar("status", { length: 24 }).notNull().default("unmatched"),
    resolution: jsonb("resolution").$type<Record<string, unknown>>().notNull().default({}),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("payment_reconciliation_entry_key_idx").on(
      table.tenantId,
      table.importId,
      table.externalKey,
    ),
    index("payment_reconciliation_entry_status_idx").on(
      table.tenantId,
      table.branchId,
      table.status,
    ),
    check(
      "payment_reconciliation_entry_amounts_check",
      sql`${table.grossCents} > 0 and ${table.feeCents} >= 0 and ${table.netCents} >= 0`,
    ),
    check("payment_reconciliation_entry_version_check", sql`${table.version} > 0`),
  ],
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
    branchId: uuid("branch_id").references(() => branches.id),
    credentialId: uuid("credential_id").references(() => fiscalProviderCredentials.id),
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
    idempotencyKey: varchar("idempotency_key", { length: 180 }),
    leaseOwner: varchar("lease_owner", { length: 120 }),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index("outbox_events_status_idx").on(table.status, table.availableAt),
    uniqueIndex("outbox_events_idempotency_idx")
      .on(table.tenantId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
  ],
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
