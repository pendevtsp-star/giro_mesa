ALTER TYPE "public"."table_status" ADD VALUE IF NOT EXISTS 'cleaning';
--> statement-breakpoint
CREATE TYPE "public"."cleaning_mode" AS ENUM('manual', 'automatic');
--> statement-breakpoint
CREATE TYPE "public"."theme_mode" AS ENUM('light', 'dark', 'system');
--> statement-breakpoint
CREATE TYPE "public"."kds_input_mode" AS ENUM('touch', 'keyboard', 'hybrid', 'printer');
--> statement-breakpoint
CREATE TYPE "public"."operational_device_status" AS ENUM('active', 'revoked');
--> statement-breakpoint
CREATE TYPE "public"."production_output_mode" AS ENUM('kds', 'printer', 'hybrid');
--> statement-breakpoint

CREATE TABLE "branch_operational_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "cleaning_mode" "cleaning_mode" DEFAULT 'manual' NOT NULL,
  "allow_waiter_payments" boolean DEFAULT false NOT NULL,
  "default_theme" "theme_mode" DEFAULT 'dark' NOT NULL,
  "default_kds_input_mode" "kds_input_mode" DEFAULT 'hybrid' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "branch_operational_settings_scope_idx" ON "branch_operational_settings" ("tenant_id", "branch_id");
--> statement-breakpoint

CREATE TABLE "branch_business_hours" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "weekday" integer NOT NULL,
  "opens_at" varchar(5) NOT NULL,
  "closes_at" varchar(5) NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "branch_business_hours_weekday_check" CHECK ("weekday" BETWEEN 0 AND 6),
  CONSTRAINT "branch_business_hours_open_check" CHECK ("opens_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "branch_business_hours_close_check" CHECK ("closes_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "branch_business_hours_slot_idx" ON "branch_business_hours" ("tenant_id", "branch_id", "weekday", "sort_order");
--> statement-breakpoint

CREATE TABLE "branch_business_hour_exceptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "date" date NOT NULL,
  "is_closed" boolean DEFAULT false NOT NULL,
  "intervals" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reason" varchar(160),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "branch_business_hour_exceptions_date_idx" ON "branch_business_hour_exceptions" ("tenant_id", "branch_id", "date");
--> statement-breakpoint

CREATE TABLE "user_operational_preferences" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "theme" "theme_mode" DEFAULT 'system' NOT NULL,
  "kds_input" "kds_input_mode" DEFAULT 'hybrid' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_operational_preferences_scope_idx" ON "user_operational_preferences" ("tenant_id", "branch_id", "user_id");
--> statement-breakpoint

CREATE TABLE "operational_pins" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "pin_hash" text NOT NULL,
  "failed_attempts" integer DEFAULT 0 NOT NULL,
  "locked_until" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operational_pins_user_idx" ON "operational_pins" ("tenant_id", "branch_id", "user_id");
--> statement-breakpoint

CREATE TABLE "operational_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "name" varchar(120) NOT NULL,
  "kind" varchar(40) NOT NULL,
  "token_hash" text NOT NULL,
  "status" "operational_device_status" DEFAULT 'active' NOT NULL,
  "theme" "theme_mode" DEFAULT 'system' NOT NULL,
  "kds_input" "kds_input_mode" DEFAULT 'hybrid' NOT NULL,
  "last_seen_at" timestamp with time zone,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "revoked_by_user_id" uuid REFERENCES "users"("id"),
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operational_devices_token_idx" ON "operational_devices" ("token_hash");
--> statement-breakpoint
CREATE INDEX "operational_devices_scope_idx" ON "operational_devices" ("tenant_id", "branch_id", "status");
--> statement-breakpoint

ALTER TABLE "dining_tables" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "dining_tables" ADD CONSTRAINT "dining_tables_version_check" CHECK ("version" > 0);
--> statement-breakpoint
ALTER TABLE "kds_stations" ADD COLUMN "output_mode" "production_output_mode" DEFAULT 'kds' NOT NULL;
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "duration_minutes" integer DEFAULT 120 NOT NULL;
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "tolerance_minutes" integer DEFAULT 15 NOT NULL;
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_party_size_check" CHECK ("party_size" > 0);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_duration_check" CHECK ("duration_minutes" > 0);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_tolerance_check" CHECK ("tolerance_minutes" >= 0);
--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_version_check" CHECK ("version" > 0);
--> statement-breakpoint

CREATE TABLE "reservation_tables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "reservation_id" uuid NOT NULL REFERENCES "reservations"("id"),
  "table_id" uuid NOT NULL REFERENCES "dining_tables"("id"),
  "is_primary" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_tables_assignment_idx" ON "reservation_tables" ("tenant_id", "reservation_id", "table_id");
--> statement-breakpoint
CREATE INDEX "reservation_tables_schedule_lookup_idx" ON "reservation_tables" ("tenant_id", "table_id");
--> statement-breakpoint
INSERT INTO "reservation_tables" ("tenant_id", "branch_id", "reservation_id", "table_id", "is_primary")
SELECT "tenant_id", "branch_id", "id", "table_id", true
FROM "reservations"
WHERE "table_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

CREATE UNIQUE INDEX "orders_one_active_per_table_idx" ON "orders" ("tenant_id", "table_id")
WHERE "table_id" IS NOT NULL AND "status" IN ('draft', 'opened', 'sent_to_kitchen', 'preparing', 'ready', 'served', 'waiting_payment', 'partially_paid');
--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_version_check" CHECK ("version" > 0);
--> statement-breakpoint

CREATE TABLE "operation_idempotency" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "scope" varchar(80) NOT NULL,
  "idempotency_key" varchar(180) NOT NULL,
  "request_hash" text NOT NULL,
  "status" varchar(24) DEFAULT 'processing' NOT NULL,
  "response" jsonb,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operation_idempotency_scope_key_idx" ON "operation_idempotency" ("tenant_id", "branch_id", "scope", "idempotency_key");
--> statement-breakpoint

CREATE TABLE "operational_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "version" bigserial NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "type" varchar(120) NOT NULL,
  "aggregate_type" varchar(120) NOT NULL,
  "aggregate_id" uuid,
  "actor_user_id" uuid REFERENCES "users"("id"),
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "operational_events_version_idx" ON "operational_events" ("version");
--> statement-breakpoint
CREATE INDEX "operational_events_scope_version_idx" ON "operational_events" ("tenant_id", "branch_id", "version");
--> statement-breakpoint
CREATE FUNCTION "append_operational_event_from_audit"() RETURNS trigger AS $$
BEGIN
  IF NEW.tenant_id IS NOT NULL AND NEW.branch_id IS NOT NULL THEN
    INSERT INTO operational_events (
      tenant_id, branch_id, type, aggregate_type, aggregate_id, actor_user_id, payload, occurred_at
    ) VALUES (
      NEW.tenant_id, NEW.branch_id, NEW.action, NEW.entity_type, NEW.entity_id, NEW.user_id,
      NEW.metadata, NEW.created_at
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "audit_logs_append_operational_event"
AFTER INSERT ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "append_operational_event_from_audit"();
--> statement-breakpoint

ALTER TABLE "operational_shifts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "operational_shifts" ADD COLUMN "close_idempotency_key" varchar(180);
--> statement-breakpoint
ALTER TABLE "operational_shifts" ADD CONSTRAINT "operational_shifts_version_check" CHECK ("version" > 0);
--> statement-breakpoint
CREATE UNIQUE INDEX "operational_shifts_one_open_idx" ON "operational_shifts" ("tenant_id", "branch_id") WHERE "status" = 'open';
--> statement-breakpoint
CREATE UNIQUE INDEX "operational_shifts_close_idempotency_idx" ON "operational_shifts" ("tenant_id", "close_idempotency_key") WHERE "close_idempotency_key" IS NOT NULL;
