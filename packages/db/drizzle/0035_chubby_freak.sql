ALTER TYPE "public"."order_status" ADD VALUE 'written_off';--> statement-breakpoint
CREATE TABLE "commission_accruals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"base_cents" integer DEFAULT 0 NOT NULL,
	"calculated_cents" integer DEFAULT 0 NOT NULL,
	"approved_cents" integer DEFAULT 0 NOT NULL,
	"paid_cents" integer DEFAULT 0 NOT NULL,
	"status" varchar(32) DEFAULT 'calculating' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"idempotency_key" varchar(180),
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commission_accruals_version_check" CHECK ("commission_accruals"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "commission_payment_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"accrual_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"informed_at" timestamp with time zone NOT NULL,
	"method" varchar(40) NOT NULL,
	"reference" varchar(160),
	"note" text,
	"cash_movement_id" uuid,
	"bank_reconciliation_status" varchar(24) DEFAULT 'not_applicable' NOT NULL,
	"reverses_record_id" uuid,
	"idempotency_key" varchar(180),
	"created_by_user_id" uuid,
	"confirmed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"version" integer NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"model" varchar(32) NOT NULL,
	"period" varchar(16) NOT NULL,
	"base" varchar(32) NOT NULL,
	"attribution_mode" varchar(32) NOT NULL,
	"rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_legal_review" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_policy_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"policy_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"eligible" boolean DEFAULT true NOT NULL,
	"override" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operational_occurrence_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"resulting_status" varchar(32),
	"resulting_decision" varchar(32),
	"note" text,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"method" varchar(40),
	"reference" varchar(160),
	"cash_movement_id" uuid,
	"reverses_event_id" uuid,
	"idempotency_key" varchar(180),
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operational_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"shift_id" uuid,
	"table_id" uuid,
	"order_id" uuid,
	"responsible_waiter_user_id" uuid,
	"type" varchar(60) NOT NULL,
	"initial_report" text NOT NULL,
	"status" varchar(32) DEFAULT 'under_review' NOT NULL,
	"decision" varchar(32),
	"version" integer DEFAULT 1 NOT NULL,
	"unpaid_balance_cents" integer DEFAULT 0 NOT NULL,
	"menu_value_cents" integer DEFAULT 0 NOT NULL,
	"service_suggested_cents" integer DEFAULT 0 NOT NULL,
	"paid_snapshot_cents" integer DEFAULT 0 NOT NULL,
	"branch_rule_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"idempotency_key" varchar(180),
	"created_by_user_id" uuid,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operational_occurrences_version_check" CHECK ("operational_occurrences"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "staff_service_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"attribution_mode" varchar(32) NOT NULL,
	"service_rate_bps" integer DEFAULT 1000 NOT NULL,
	"service_base" varchar(32) DEFAULT 'net_consumption' NOT NULL,
	"require_waiter_confirmation" boolean DEFAULT false NOT NULL,
	"pool_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_legal_review" boolean DEFAULT false NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_service_policies_rate_check" CHECK ("staff_service_policies"."service_rate_bps" >= 0 and "staff_service_policies"."service_rate_bps" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "waiter_shift_settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"waiter_user_id" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"supersedes_id" uuid,
	"status" varchar(32) DEFAULT 'calculating' NOT NULL,
	"policy_id" uuid,
	"policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"gross_sales_cents" integer DEFAULT 0 NOT NULL,
	"cancelled_cents" integer DEFAULT 0 NOT NULL,
	"discount_cents" integer DEFAULT 0 NOT NULL,
	"net_consumption_cents" integer DEFAULT 0 NOT NULL,
	"service_suggested_cents" integer DEFAULT 0 NOT NULL,
	"service_received_cents" integer DEFAULT 0 NOT NULL,
	"pooled_service_cents" integer DEFAULT 0 NOT NULL,
	"pending_cash_cents" integer DEFAULT 0 NOT NULL,
	"adjustments_cents" integer DEFAULT 0 NOT NULL,
	"occurrence_open_cents" integer DEFAULT 0 NOT NULL,
	"occurrence_recovered_cents" integer DEFAULT 0 NOT NULL,
	"commission_accrued_cents" integer DEFAULT 0 NOT NULL,
	"breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"calculate_idempotency_key" varchar(180),
	"close_idempotency_key" varchar(180),
	"waiter_confirmed_at" timestamp with time zone,
	"checked_by_user_id" uuid,
	"checked_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"closed_at" timestamp with time zone,
	"reopen_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waiter_shift_settlements_version_check" CHECK ("waiter_shift_settlements"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "source_type" varchar(60);--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "source_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "idempotency_key" varchar(180);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "responsible_waiter_user_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shift_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "service_charge_suggested_cents" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "service_charge_status" varchar(24) DEFAULT 'not_configured' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "service_charge_policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_policy_id_commission_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."commission_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_accruals" ADD CONSTRAINT "commission_accruals_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payment_records" ADD CONSTRAINT "commission_payment_records_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payment_records" ADD CONSTRAINT "commission_payment_records_accrual_id_commission_accruals_id_fk" FOREIGN KEY ("accrual_id") REFERENCES "public"."commission_accruals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payment_records" ADD CONSTRAINT "commission_payment_records_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payment_records" ADD CONSTRAINT "commission_payment_records_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_payment_records" ADD CONSTRAINT "commission_payment_records_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_policies" ADD CONSTRAINT "commission_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_policies" ADD CONSTRAINT "commission_policies_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_policies" ADD CONSTRAINT "commission_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_policy_members" ADD CONSTRAINT "commission_policy_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_policy_members" ADD CONSTRAINT "commission_policy_members_policy_id_commission_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."commission_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_policy_members" ADD CONSTRAINT "commission_policy_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrence_events" ADD CONSTRAINT "operational_occurrence_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrence_events" ADD CONSTRAINT "operational_occurrence_events_occurrence_id_operational_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."operational_occurrences"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrence_events" ADD CONSTRAINT "operational_occurrence_events_cash_movement_id_cash_movements_id_fk" FOREIGN KEY ("cash_movement_id") REFERENCES "public"."cash_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrence_events" ADD CONSTRAINT "operational_occurrence_events_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrences" ADD CONSTRAINT "operational_occurrences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrences" ADD CONSTRAINT "operational_occurrences_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrences" ADD CONSTRAINT "operational_occurrences_shift_id_operational_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."operational_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrences" ADD CONSTRAINT "operational_occurrences_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrences" ADD CONSTRAINT "operational_occurrences_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrences" ADD CONSTRAINT "operational_occurrences_responsible_waiter_user_id_users_id_fk" FOREIGN KEY ("responsible_waiter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrences" ADD CONSTRAINT "operational_occurrences_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_occurrences" ADD CONSTRAINT "operational_occurrences_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_service_policies" ADD CONSTRAINT "staff_service_policies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_service_policies" ADD CONSTRAINT "staff_service_policies_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_service_policies" ADD CONSTRAINT "staff_service_policies_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ADD CONSTRAINT "waiter_shift_settlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ADD CONSTRAINT "waiter_shift_settlements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ADD CONSTRAINT "waiter_shift_settlements_shift_id_operational_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."operational_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ADD CONSTRAINT "waiter_shift_settlements_waiter_user_id_users_id_fk" FOREIGN KEY ("waiter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ADD CONSTRAINT "waiter_shift_settlements_policy_id_staff_service_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."staff_service_policies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ADD CONSTRAINT "waiter_shift_settlements_checked_by_user_id_users_id_fk" FOREIGN KEY ("checked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ADD CONSTRAINT "waiter_shift_settlements_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_accruals_revision_idx" ON "commission_accruals" USING btree ("tenant_id","user_id","policy_id","period_start","period_end","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_accruals_key_idx" ON "commission_accruals" USING btree ("tenant_id","idempotency_key") WHERE "commission_accruals"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "commission_payment_records_key_idx" ON "commission_payment_records" USING btree ("tenant_id","idempotency_key") WHERE "commission_payment_records"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "commission_payment_records_accrual_idx" ON "commission_payment_records" USING btree ("tenant_id","accrual_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_policies_version_idx" ON "commission_policies" USING btree ("tenant_id","branch_id","name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_policy_members_unique_idx" ON "commission_policy_members" USING btree ("tenant_id","policy_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_occurrence_events_key_idx" ON "operational_occurrence_events" USING btree ("tenant_id","idempotency_key") WHERE "operational_occurrence_events"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "operational_occurrence_events_occurrence_idx" ON "operational_occurrence_events" USING btree ("tenant_id","occurrence_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_occurrences_key_idx" ON "operational_occurrences" USING btree ("tenant_id","idempotency_key") WHERE "operational_occurrences"."idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "operational_occurrences_open_order_type_idx" ON "operational_occurrences" USING btree ("tenant_id","order_id","type") WHERE "operational_occurrences"."status" in ('under_review', 'approved') and "operational_occurrences"."order_id" is not null;--> statement-breakpoint
CREATE INDEX "operational_occurrences_branch_shift_idx" ON "operational_occurrences" USING btree ("tenant_id","branch_id","shift_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_service_policies_version_idx" ON "staff_service_policies" USING btree ("tenant_id","branch_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_service_policies_one_active_idx" ON "staff_service_policies" USING btree ("tenant_id","branch_id") WHERE "staff_service_policies"."is_active";--> statement-breakpoint
CREATE UNIQUE INDEX "waiter_shift_settlements_revision_idx" ON "waiter_shift_settlements" USING btree ("tenant_id","shift_id","waiter_user_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "waiter_shift_settlements_calculate_key_idx" ON "waiter_shift_settlements" USING btree ("tenant_id","calculate_idempotency_key") WHERE "waiter_shift_settlements"."calculate_idempotency_key" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "waiter_shift_settlements_close_key_idx" ON "waiter_shift_settlements" USING btree ("tenant_id","close_idempotency_key") WHERE "waiter_shift_settlements"."close_idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "waiter_shift_settlements_shift_status_idx" ON "waiter_shift_settlements" USING btree ("tenant_id","branch_id","shift_id","status");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_shift_id_operational_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."operational_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_responsible_waiter_user_id_users_id_fk" FOREIGN KEY ("responsible_waiter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_shift_id_operational_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."operational_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_movements_idempotency_idx" ON "cash_movements" USING btree ("tenant_id","idempotency_key") WHERE "cash_movements"."idempotency_key" is not null;
--> statement-breakpoint
UPDATE "roles"
SET "permissions" = CASE
  WHEN "code" IN ('owner', 'manager', 'finance') THEN "permissions" || '["staff_finance:manage","staff_finance:read_self"]'::jsonb
  WHEN "code" = 'waiter' THEN "permissions" || '["staff_finance:read_self"]'::jsonb
  ELSE "permissions"
END
WHERE NOT ("permissions" ? 'staff_finance:manage') OR NOT ("permissions" ? 'staff_finance:read_self');
