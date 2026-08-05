ALTER TABLE "waiter_shift_settlements" ADD COLUMN IF NOT EXISTS "calculated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ADD COLUMN IF NOT EXISTS "ledger_hash" varchar(64);--> statement-breakpoint
UPDATE "waiter_shift_settlements"
SET "calculated_at" = COALESCE(("breakdown" ->> 'calculatedAt')::timestamptz, "created_at"),
    "ledger_hash" = COALESCE("calculate_payload_hash", repeat(md5("id"::text), 2))
WHERE "calculated_at" IS NULL OR "ledger_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ALTER COLUMN "calculated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ALTER COLUMN "calculated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "waiter_shift_settlements" ALTER COLUMN "ledger_hash" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "managerial_shift_settlements" ADD COLUMN IF NOT EXISTS "calculated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "managerial_shift_settlements" ADD COLUMN IF NOT EXISTS "ledger_hash" varchar(64);--> statement-breakpoint
UPDATE "managerial_shift_settlements"
SET "calculated_at" = COALESCE(("breakdown" ->> 'calculatedAt')::timestamptz, "created_at"),
    "ledger_hash" = COALESCE("calculate_payload_hash", repeat(md5("id"::text), 2))
WHERE "calculated_at" IS NULL OR "ledger_hash" IS NULL;--> statement-breakpoint
ALTER TABLE "managerial_shift_settlements" ALTER COLUMN "calculated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "managerial_shift_settlements" ALTER COLUMN "calculated_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "managerial_shift_settlements" ALTER COLUMN "ledger_hash" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "staff_service_policies" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(180);--> statement-breakpoint
ALTER TABLE "staff_service_policies" ADD COLUMN IF NOT EXISTS "idempotency_payload_hash" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_service_policies_idempotency_idx" ON "staff_service_policies" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint

ALTER TABLE "commission_policies" ALTER COLUMN "effective_from" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "commission_policies" ALTER COLUMN "effective_from" DROP DEFAULT;--> statement-breakpoint
UPDATE "commission_policies" SET "effective_from" = NULL WHERE "status" = 'draft';--> statement-breakpoint
ALTER TABLE "commission_policies" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(180);--> statement-breakpoint
ALTER TABLE "commission_policies" ADD COLUMN IF NOT EXISTS "idempotency_payload_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "commission_policies" ADD COLUMN IF NOT EXISTS "activation_idempotency_key" varchar(180);--> statement-breakpoint
ALTER TABLE "commission_policies" ADD COLUMN IF NOT EXISTS "activation_payload_hash" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "commission_policies_idempotency_idx" ON "commission_policies" ("tenant_id", "idempotency_key") WHERE "idempotency_key" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "commission_policies_activation_idempotency_idx" ON "commission_policies" ("tenant_id", "activation_idempotency_key") WHERE "activation_idempotency_key" IS NOT NULL;
