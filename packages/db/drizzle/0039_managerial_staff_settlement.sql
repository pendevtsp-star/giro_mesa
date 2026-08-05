CREATE TABLE "managerial_shift_settlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "branch_id" uuid NOT NULL REFERENCES "branches"("id"),
  "shift_id" uuid NOT NULL REFERENCES "operational_shifts"("id"),
  "revision" integer DEFAULT 1 NOT NULL,
  "supersedes_id" uuid,
  "status" varchar(32) DEFAULT 'checked' NOT NULL,
  "policy_id" uuid REFERENCES "staff_service_policies"("id"),
  "policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "gross_sales_cents" integer DEFAULT 0 NOT NULL,
  "cancelled_cents" integer DEFAULT 0 NOT NULL,
  "discount_cents" integer DEFAULT 0 NOT NULL,
  "net_consumption_cents" integer DEFAULT 0 NOT NULL,
  "net_paid_cents" integer DEFAULT 0 NOT NULL,
  "service_suggested_cents" integer DEFAULT 0 NOT NULL,
  "service_received_cents" integer DEFAULT 0 NOT NULL,
  "pending_cash_cents" integer DEFAULT 0 NOT NULL,
  "breakdown" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "calculate_idempotency_key" varchar(180),
  "calculate_payload_hash" varchar(64),
  "close_idempotency_key" varchar(180),
  "checked_by_user_id" uuid REFERENCES "users"("id"),
  "checked_at" timestamp with time zone,
  "closed_by_user_id" uuid REFERENCES "users"("id"),
  "closed_at" timestamp with time zone,
  "reopen_reason" varchar(500),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "managerial_shift_settlements_supersedes_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "managerial_shift_settlements"("id"),
  CONSTRAINT "managerial_shift_settlements_version_check" CHECK ("version" > 0)
);--> statement-breakpoint
CREATE UNIQUE INDEX "managerial_shift_settlements_revision_idx" ON "managerial_shift_settlements" ("tenant_id", "shift_id", "revision");--> statement-breakpoint
CREATE UNIQUE INDEX "managerial_shift_settlements_calculate_key_idx" ON "managerial_shift_settlements" ("tenant_id", "branch_id", "shift_id", "calculate_idempotency_key");--> statement-breakpoint
CREATE INDEX "managerial_shift_settlements_shift_status_idx" ON "managerial_shift_settlements" ("tenant_id", "branch_id", "shift_id", "status");
--> statement-breakpoint
CREATE UNIQUE INDEX "commission_policies_one_active_idx" ON "commission_policies" ("tenant_id", "branch_id", "name") WHERE "status" = 'active';
