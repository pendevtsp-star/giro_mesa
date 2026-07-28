DO $$ BEGIN
 CREATE TYPE "public"."qr_table_status" AS ENUM('active', 'revoked');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."service_request_status" AS ENUM('pending', 'acknowledged', 'resolved', 'canceled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "floor_plans"
ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "dining_tables"
ADD COLUMN IF NOT EXISTS "qr_token_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "dining_tables"
ADD COLUMN IF NOT EXISTS "qr_status" "qr_table_status" DEFAULT 'active' NOT NULL;
--> statement-breakpoint
ALTER TABLE "dining_tables"
ADD COLUMN IF NOT EXISTS "qr_rotated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "dining_tables"
ADD COLUMN IF NOT EXISTS "qr_rotated_by_user_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "dining_tables"
 ADD CONSTRAINT "dining_tables_qr_rotated_by_user_id_users_id_fk"
 FOREIGN KEY ("qr_rotated_by_user_id") REFERENCES "public"."users"("id");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "qr_branch_settings" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "tenant_id" uuid NOT NULL,
 "branch_id" uuid NOT NULL,
 "capabilities" jsonb DEFAULT '["menu","order","track_preparation","view_tab","call_waiter","request_pre_bill"]'::jsonb NOT NULL,
 "review_before_kds" boolean DEFAULT false NOT NULL,
 "template" varchar(40) DEFAULT 'classic' NOT NULL,
 "primary_color" varchar(16) DEFAULT '#FFCC00' NOT NULL,
 "instruction" varchar(180) DEFAULT 'Aponte a câmera para acessar o cardápio' NOT NULL,
 "show_logo" boolean DEFAULT true NOT NULL,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "qr_branch_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id"),
 CONSTRAINT "qr_branch_settings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "qr_branch_settings_branch_idx"
ON "qr_branch_settings" USING btree ("branch_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "qr_branch_settings_tenant_branch_idx"
ON "qr_branch_settings" USING btree ("tenant_id","branch_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "service_requests" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "tenant_id" uuid NOT NULL,
 "branch_id" uuid NOT NULL,
 "table_id" uuid NOT NULL,
 "order_id" uuid,
 "type" varchar(40) NOT NULL,
 "status" "service_request_status" DEFAULT 'pending' NOT NULL,
 "requester_key_hash" text,
 "message" varchar(180),
 "acknowledged_by_user_id" uuid,
 "acknowledged_at" timestamp with time zone,
 "resolved_by_user_id" uuid,
 "resolved_at" timestamp with time zone,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "service_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id"),
 CONSTRAINT "service_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id"),
 CONSTRAINT "service_requests_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id"),
 CONSTRAINT "service_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id"),
 CONSTRAINT "service_requests_acknowledged_by_user_id_users_id_fk" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "public"."users"("id"),
 CONSTRAINT "service_requests_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_requests_tenant_branch_status_idx"
ON "service_requests" USING btree ("tenant_id","branch_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_requests_table_created_idx"
ON "service_requests" USING btree ("table_id","created_at");
