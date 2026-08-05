CREATE TYPE "public"."qr_guest_session_status" AS ENUM('active', 'revoked', 'expired');--> statement-breakpoint
CREATE TYPE "public"."qr_mode" AS ENUM('disabled', 'menu_only', 'waiter_assisted', 'self_service');--> statement-breakpoint
CREATE TYPE "public"."table_service_session_status" AS ENUM('active', 'closed', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."waiter_responsibility_policy" AS ENUM('strict', 'collaborative');--> statement-breakpoint
CREATE TABLE "qr_guest_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"table_service_session_id" uuid NOT NULL,
	"claim_key_hash" text NOT NULL,
	"status" varchar(24) DEFAULT 'pending' NOT NULL,
	"approved_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qr_guest_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"table_service_session_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"validation_method" varchar(24) NOT NULL,
	"status" "qr_guest_session_status" DEFAULT 'active' NOT NULL,
	"approved_by_user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_service_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"shift_id" uuid,
	"table_id" uuid NOT NULL,
	"order_id" uuid,
	"status" "table_service_session_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"mode" "qr_mode" DEFAULT 'waiter_assisted' NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"presence_methods" jsonb DEFAULT '["code"]'::jsonb NOT NULL,
	"tab_visibility" varchar(24) DEFAULT 'shared' NOT NULL,
	"guest_session_ttl_minutes" integer DEFAULT 720 NOT NULL,
	"presence_code_hash" text,
	"presence_code_expires_at" timestamp with time zone,
	"presence_code_attempts" integer DEFAULT 0 NOT NULL,
	"activated_by_user_id" uuid,
	"closed_by_user_id" uuid,
	"revoked_by_user_id" uuid,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoke_reason" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_service_sessions_version_check" CHECK ("table_service_sessions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "table_waiter_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"shift_id" uuid NOT NULL,
	"table_id" uuid NOT NULL,
	"waiter_user_id" uuid NOT NULL,
	"assigned_by_user_id" uuid,
	"source" varchar(32) NOT NULL,
	"reason" varchar(240),
	"version" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"ended_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_waiter_assignments_version_check" CHECK ("table_waiter_assignments"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "branch_operational_settings" ADD COLUMN "waiter_responsibility_policy" "waiter_responsibility_policy" DEFAULT 'collaborative' NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "registered_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "table_service_session_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "qr_guest_session_id" uuid;--> statement-breakpoint
ALTER TABLE "qr_branch_settings" ADD COLUMN "mode" "qr_mode" DEFAULT 'waiter_assisted' NOT NULL;--> statement-breakpoint
ALTER TABLE "qr_branch_settings" ADD COLUMN "presence_methods" jsonb DEFAULT '["code"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "qr_branch_settings" ADD COLUMN "tab_visibility" varchar(24) DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE "qr_branch_settings" ADD COLUMN "guest_session_ttl_minutes" integer DEFAULT 720 NOT NULL;--> statement-breakpoint
ALTER TABLE "qr_branch_settings" ADD COLUMN "presence_code_ttl_minutes" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "qr_branch_settings" ADD COLUMN "trusted_network_cidrs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "table_service_session_id" uuid;--> statement-breakpoint
ALTER TABLE "service_requests" ADD COLUMN "qr_guest_session_id" uuid;--> statement-breakpoint
ALTER TABLE "qr_guest_access_requests" ADD CONSTRAINT "qr_guest_access_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_guest_access_requests" ADD CONSTRAINT "qr_guest_access_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_guest_access_requests" ADD CONSTRAINT "qr_guest_access_requests_table_service_session_id_table_service_sessions_id_fk" FOREIGN KEY ("table_service_session_id") REFERENCES "public"."table_service_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_guest_access_requests" ADD CONSTRAINT "qr_guest_access_requests_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_guest_sessions" ADD CONSTRAINT "qr_guest_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_guest_sessions" ADD CONSTRAINT "qr_guest_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_guest_sessions" ADD CONSTRAINT "qr_guest_sessions_table_service_session_id_table_service_sessions_id_fk" FOREIGN KEY ("table_service_session_id") REFERENCES "public"."table_service_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_guest_sessions" ADD CONSTRAINT "qr_guest_sessions_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qr_guest_sessions" ADD CONSTRAINT "qr_guest_sessions_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_service_sessions" ADD CONSTRAINT "table_service_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_service_sessions" ADD CONSTRAINT "table_service_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_service_sessions" ADD CONSTRAINT "table_service_sessions_shift_id_operational_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."operational_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_service_sessions" ADD CONSTRAINT "table_service_sessions_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_service_sessions" ADD CONSTRAINT "table_service_sessions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_service_sessions" ADD CONSTRAINT "table_service_sessions_activated_by_user_id_users_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_service_sessions" ADD CONSTRAINT "table_service_sessions_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_service_sessions" ADD CONSTRAINT "table_service_sessions_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_waiter_assignments" ADD CONSTRAINT "table_waiter_assignments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_waiter_assignments" ADD CONSTRAINT "table_waiter_assignments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_waiter_assignments" ADD CONSTRAINT "table_waiter_assignments_shift_id_operational_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."operational_shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_waiter_assignments" ADD CONSTRAINT "table_waiter_assignments_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_waiter_assignments" ADD CONSTRAINT "table_waiter_assignments_waiter_user_id_users_id_fk" FOREIGN KEY ("waiter_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_waiter_assignments" ADD CONSTRAINT "table_waiter_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_waiter_assignments" ADD CONSTRAINT "table_waiter_assignments_ended_by_user_id_users_id_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qr_guest_access_requests_claim_key_idx" ON "qr_guest_access_requests" USING btree ("claim_key_hash");--> statement-breakpoint
CREATE INDEX "qr_guest_access_requests_pending_idx" ON "qr_guest_access_requests" USING btree ("tenant_id","branch_id","table_service_session_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_guest_sessions_token_hash_idx" ON "qr_guest_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "qr_guest_sessions_active_idx" ON "qr_guest_sessions" USING btree ("tenant_id","branch_id","table_service_session_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "table_service_sessions_one_active_idx" ON "table_service_sessions" USING btree ("tenant_id","table_id") WHERE "table_service_sessions"."status" = 'active';--> statement-breakpoint
CREATE INDEX "table_service_sessions_branch_table_idx" ON "table_service_sessions" USING btree ("tenant_id","branch_id","table_id");--> statement-breakpoint
CREATE INDEX "table_service_sessions_order_idx" ON "table_service_sessions" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "table_waiter_assignments_one_active_idx" ON "table_waiter_assignments" USING btree ("tenant_id","shift_id","table_id") WHERE "table_waiter_assignments"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "table_waiter_assignments_waiter_idx" ON "table_waiter_assignments" USING btree ("tenant_id","branch_id","shift_id","waiter_user_id");--> statement-breakpoint
CREATE INDEX "table_waiter_assignments_table_idx" ON "table_waiter_assignments" USING btree ("tenant_id","branch_id","shift_id","table_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_registered_by_user_id_users_id_fk" FOREIGN KEY ("registered_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_table_service_session_id_table_service_sessions_id_fk" FOREIGN KEY ("table_service_session_id") REFERENCES "public"."table_service_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_qr_guest_session_id_qr_guest_sessions_id_fk" FOREIGN KEY ("qr_guest_session_id") REFERENCES "public"."qr_guest_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_table_service_session_id_table_service_sessions_id_fk" FOREIGN KEY ("table_service_session_id") REFERENCES "public"."table_service_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_qr_guest_session_id_qr_guest_sessions_id_fk" FOREIGN KEY ("qr_guest_session_id") REFERENCES "public"."qr_guest_sessions"("id") ON DELETE no action ON UPDATE no action;
