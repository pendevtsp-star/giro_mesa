ALTER TYPE "payment_status" ADD VALUE IF NOT EXISTS 'unknown';--> statement-breakpoint

ALTER TABLE "fiscal_settings" ALTER COLUMN "status" SET DEFAULT 'disabled';--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "onboarding_status" varchar(40) DEFAULT 'not_started' NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "provider_company_id" varchar(160);--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "provider_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "production_enabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "production_enabled_by" uuid;--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "production_enabled_reason" text;--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "certificate_fingerprint" varchar(128);--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "certificate_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "provider_certificate_status" varchar(40);--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "last_reconciled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "last_health_status" varchar(40);--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "last_health_error_code" varchar(120);--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE "fiscal_settings" SET "status" = 'disabled', "onboarding_status" = 'action_required' WHERE "provider" = 'mock' OR "status" = 'enabled';--> statement-breakpoint

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "execution_mode" varchar(20) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "terminal_device_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "provider_reference" varchar(160);--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "original_payment_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "payment_type" varchar(20) DEFAULT 'charge' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "result_unknown_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "last_queried_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_check" CHECK ("amount_cents" > 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_version_check" CHECK ("version" > 0);--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_terminal_device_id_operational_devices_id_fk" FOREIGN KEY ("terminal_device_id") REFERENCES "operational_devices"("id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_original_payment_id_payments_id_fk" FOREIGN KEY ("original_payment_id") REFERENCES "payments"("id");--> statement-breakpoint
CREATE INDEX "payments_tenant_original_idx" ON "payments" USING btree ("tenant_id", "original_payment_id");--> statement-breakpoint

CREATE TABLE "fiscal_provider_credentials" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "provider" varchar(40) NOT NULL,
  "environment" varchar(20) NOT NULL,
  "token_encrypted" text NOT NULL,
  "token_fingerprint" varchar(128) NOT NULL,
  "token_last_four" varchar(4) NOT NULL,
  "status" varchar(32) DEFAULT 'active' NOT NULL,
  "rotated_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_by_user_id" uuid REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_provider_credentials_scope_idx" ON "fiscal_provider_credentials" USING btree ("tenant_id", "branch_id", "provider", "environment");--> statement-breakpoint

CREATE TABLE "fiscal_operations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "fiscal_document_id" uuid REFERENCES "fiscal_documents"("id"),
  "type" varchar(20) NOT NULL,
  "environment" varchar(20) NOT NULL,
  "idempotency_key" varchar(180) NOT NULL,
  "provider_reference" varchar(160) NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lease_owner" varchar(120),
  "lease_expires_at" timestamp with time zone,
  "error_code" varchar(120),
  "error_message" varchar(500),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_operations_idempotency_idx" ON "fiscal_operations" USING btree ("tenant_id", "idempotency_key", "type");--> statement-breakpoint
CREATE INDEX "fiscal_operations_claim_idx" ON "fiscal_operations" USING btree ("status", "available_at");--> statement-breakpoint

CREATE TABLE "branch_payment_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "profile" varchar(32) DEFAULT 'external_terminal' NOT NULL,
  "preferred_mode" varchar(20) DEFAULT 'manual' NOT NULL,
  "allow_manual_fallback" boolean DEFAULT true NOT NULL,
  "reconciliation_mode" varchar(20) DEFAULT 'manual' NOT NULL,
  "provider" varchar(40),
  "status" varchar(20) DEFAULT 'disabled' NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "branch_payment_settings_version_check" CHECK ("version" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX "branch_payment_settings_scope_idx" ON "branch_payment_settings" USING btree ("tenant_id", "branch_id");--> statement-breakpoint

UPDATE "roles"
SET "permissions" = "permissions" || '["fiscal:configure", "fiscal:activate_production"]'::jsonb
WHERE "tenant_id" IS NOT NULL AND "code" = 'owner'
  AND NOT "permissions" @> '["fiscal:configure", "fiscal:activate_production"]'::jsonb;
