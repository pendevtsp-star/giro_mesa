CREATE TYPE "public"."onboarding_step_status" AS ENUM('pending', 'in_progress', 'completed', 'skipped', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."operational_shift_status" AS ENUM('open', 'closed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."cash_movement_type" AS ENUM('supply', 'withdrawal', 'adjustment');--> statement-breakpoint

CREATE TABLE "onboarding_steps" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "branch_id" uuid,
  "step_key" varchar(80) NOT NULL,
  "status" "onboarding_step_status" DEFAULT 'pending' NOT NULL,
  "updated_by_user_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "completed_at" timestamp with time zone,
  "skipped_at" timestamp with time zone,
  "blocked_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "operational_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "opened_by_user_id" uuid NOT NULL,
  "closed_by_user_id" uuid,
  "status" "operational_shift_status" DEFAULT 'open' NOT NULL,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone,
  "notes" text,
  "opening_context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "closing_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "cash_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "branch_id" uuid NOT NULL,
  "cash_session_id" uuid NOT NULL,
  "type" "cash_movement_type" NOT NULL,
  "amount_cents" integer NOT NULL,
  "reason" text NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_shifts" ADD CONSTRAINT "operational_shifts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_shifts" ADD CONSTRAINT "operational_shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_shifts" ADD CONSTRAINT "operational_shifts_opened_by_user_id_users_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_shifts" ADD CONSTRAINT "operational_shifts_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_cash_session_id_cash_sessions_id_fk" FOREIGN KEY ("cash_session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "onboarding_steps_tenant_branch_key_idx" ON "onboarding_steps" USING btree ("tenant_id","branch_id","step_key");--> statement-breakpoint
CREATE INDEX "onboarding_steps_tenant_status_idx" ON "onboarding_steps" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "operational_shifts_tenant_branch_status_idx" ON "operational_shifts" USING btree ("tenant_id","branch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_shifts_one_open_per_branch_idx" ON "operational_shifts" USING btree ("tenant_id","branch_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE INDEX "cash_movements_tenant_session_idx" ON "cash_movements" USING btree ("tenant_id","cash_session_id");--> statement-breakpoint
CREATE INDEX "cash_movements_tenant_branch_idx" ON "cash_movements" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_one_open_per_branch_idx" ON "cash_sessions" USING btree ("tenant_id","branch_id") WHERE "status" = 'open';--> statement-breakpoint
