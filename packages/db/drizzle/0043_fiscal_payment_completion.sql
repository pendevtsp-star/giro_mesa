ALTER TABLE "operational_devices" ADD COLUMN IF NOT EXISTS "provider" varchar(40);--> statement-breakpoint
ALTER TABLE "operational_devices" ADD COLUMN IF NOT EXISTS "provider_terminal_id" varchar(160);--> statement-breakpoint
ALTER TABLE "operational_devices" ADD COLUMN IF NOT EXISTS "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD COLUMN IF NOT EXISTS "paired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD CONSTRAINT "operational_devices_version_check" CHECK ("version" > 0);--> statement-breakpoint

ALTER TABLE "fiscal_provider_credentials" ADD COLUMN IF NOT EXISTS "webhook_secret_hash" varchar(128);--> statement-breakpoint

CREATE TABLE "fiscal_accountant_invitations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "email" varchar(254) NOT NULL,
  "token_hash" varchar(128) NOT NULL,
  "status" varchar(24) DEFAULT 'pending' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_accountant_invitation_token_idx" ON "fiscal_accountant_invitations" ("token_hash");--> statement-breakpoint
CREATE INDEX "fiscal_accountant_invitation_scope_idx" ON "fiscal_accountant_invitations" ("tenant_id", "branch_id", "status");--> statement-breakpoint

CREATE TABLE "payment_reconciliation_imports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "source" varchar(60) DEFAULT 'giromesa_csv' NOT NULL,
  "mode" varchar(20) DEFAULT 'import' NOT NULL,
  "checksum" varchar(64) NOT NULL,
  "period_start" timestamp with time zone,
  "period_end" timestamp with time zone,
  "status" varchar(24) DEFAULT 'processed' NOT NULL,
  "summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reconciliation_import_scope_idx" ON "payment_reconciliation_imports" ("tenant_id", "branch_id", "source", "checksum");--> statement-breakpoint

CREATE TABLE "payment_reconciliation_entries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "import_id" uuid NOT NULL REFERENCES "payment_reconciliation_imports"("id"),
  "payment_id" uuid REFERENCES "payments"("id"),
  "occurrence_id" uuid REFERENCES "operational_occurrences"("id"),
  "external_key" varchar(180) NOT NULL,
  "provider_reference" varchar(160),
  "nsu" varchar(80),
  "authorization_code" varchar(80),
  "gross_cents" integer NOT NULL,
  "fee_cents" integer DEFAULT 0 NOT NULL,
  "net_cents" integer NOT NULL,
  "expected_settlement_at" timestamp with time zone,
  "settled_at" timestamp with time zone,
  "status" varchar(24) DEFAULT 'unmatched' NOT NULL,
  "resolution" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "resolved_by_user_id" uuid REFERENCES "users"("id"),
  "resolved_at" timestamp with time zone,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_reconciliation_entry_amounts_check" CHECK ("gross_cents" > 0 AND "fee_cents" >= 0 AND "net_cents" >= 0),
  CONSTRAINT "payment_reconciliation_entry_version_check" CHECK ("version" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reconciliation_entry_key_idx" ON "payment_reconciliation_entries" ("tenant_id", "import_id", "external_key");--> statement-breakpoint
CREATE INDEX "payment_reconciliation_entry_status_idx" ON "payment_reconciliation_entries" ("tenant_id", "branch_id", "status");--> statement-breakpoint

ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "branch_id" uuid REFERENCES "branches"("id");--> statement-breakpoint
ALTER TABLE "webhook_events" ADD COLUMN IF NOT EXISTS "credential_id" uuid REFERENCES "fiscal_provider_credentials"("id");--> statement-breakpoint

ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(180);--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "lease_owner" varchar(120);--> statement-breakpoint
ALTER TABLE "outbox_events" ADD COLUMN IF NOT EXISTS "lease_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_idempotency_idx" ON "outbox_events" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.fiscal_certificates') IS NOT NULL THEN
    EXECUTE $migration$
      UPDATE "fiscal_certificates"
      SET "metadata" = COALESCE("metadata", '{}'::jsonb) || '{"migrationStatus":"legacy_pending_provider_upload"}'::jsonb
      WHERE NOT COALESCE("metadata", '{}'::jsonb) ? 'migrationStatus'
    $migration$;
  END IF;
END $$;
