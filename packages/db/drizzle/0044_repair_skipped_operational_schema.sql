ALTER TABLE "operational_devices" ADD COLUMN IF NOT EXISTS "initial_mode" varchar(40) DEFAULT 'table' NOT NULL;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD COLUMN IF NOT EXISTS "station_id" uuid;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD COLUMN IF NOT EXISTS "printer_device_id" uuid;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD COLUMN IF NOT EXISTS "allow_mode_switch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operational_devices_station_id_kds_stations_id_fk') THEN
    ALTER TABLE "operational_devices" ADD CONSTRAINT "operational_devices_station_id_kds_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kds_stations"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'operational_devices_printer_device_id_printer_devices_id_fk') THEN
    ALTER TABLE "operational_devices" ADD CONSTRAINT "operational_devices_printer_device_id_printer_devices_id_fk" FOREIGN KEY ("printer_device_id") REFERENCES "public"."printer_devices"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payment_allocations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "payment_id" uuid NOT NULL,
  "order_item_id" uuid,
  "seat_label" varchar(80),
  "amount_cents" integer NOT NULL,
  "allocated_by_user_id" uuid NOT NULL,
  "idempotency_key" varchar(180) NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "payment_allocations_amount_check" CHECK ("payment_allocations"."amount_cents" > 0),
  CONSTRAINT "payment_allocations_target_check" CHECK (("payment_allocations"."order_item_id" is not null and "payment_allocations"."seat_label" is null) or ("payment_allocations"."order_item_id" is null and "payment_allocations"."seat_label" is not null))
);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(180);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_branch_id_branches_id_fk') THEN
    ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_order_id_orders_id_fk') THEN
    ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_payment_id_payments_id_fk') THEN
    ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_order_item_id_order_items_id_fk') THEN
    ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_allocations_allocated_by_user_id_users_id_fk') THEN
    ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_allocated_by_user_id_users_id_fk" FOREIGN KEY ("allocated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payment_allocations_idempotency_idx" ON "payment_allocations" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_allocations_tenant_order_idx" ON "payment_allocations" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_allocations_tenant_payment_idx" ON "payment_allocations" USING btree ("tenant_id","payment_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_allocations_tenant_item_idx" ON "payment_allocations" USING btree ("tenant_id","order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_items_idempotency_idx" ON "order_items" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "commercial_interests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "product" varchar(32) NOT NULL,
  "plan_code" varchar(32),
  "origin" varchar(80) NOT NULL,
  "establishment_name" varchar(160) NOT NULL,
  "contact_name" varchar(160) NOT NULL,
  "email" varchar(255) NOT NULL,
  "phone" varchar(32),
  "message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "commercial_interests_product_check" CHECK ("commercial_interests"."product" in ('giromesa')),
  CONSTRAINT "commercial_interests_plan_check" CHECK ("commercial_interests"."plan_code" is null or "commercial_interests"."plan_code" in ('starter', 'professional', 'premium'))
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "legal_acceptances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "document_type" varchar(32) NOT NULL,
  "document_version" varchar(80) NOT NULL,
  "document_hash" varchar(64) NOT NULL,
  "origin" varchar(80) NOT NULL,
  "ip_address" varchar(80),
  "user_agent" text,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "legal_acceptances_hash_check" CHECK (length("legal_acceptances"."document_hash") = 64 and "legal_acceptances"."document_hash" ~ '^[0-9a-f]+$')
);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "is_alcoholic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "products"
SET "is_alcoholic" = true
WHERE "spirit_type" IS NOT NULL
   OR "is_club_eligible" = true
   OR regexp_replace(coalesce("fiscal_ncm", ''), '[^0-9]', '', 'g') LIKE ANY (ARRAY['2203%', '2204%', '2205%', '2206%', '2208%']);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'legal_acceptances_tenant_id_tenants_id_fk') THEN
    ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'legal_acceptances_user_id_users_id_fk') THEN
    ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "commercial_interests_created_idx" ON "commercial_interests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "legal_acceptances_tenant_user_idx" ON "legal_acceptances" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "legal_acceptances_document_idx" ON "legal_acceptances" USING btree ("tenant_id","user_id","document_type","document_version","document_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "invitations_token_hash_idx" ON "invitations" USING btree ("token_hash");
