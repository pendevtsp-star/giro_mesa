CREATE TYPE "public"."guest_experience_config_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TABLE "guest_experience_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" "guest_experience_config_status" DEFAULT 'draft' NOT NULL,
	"config" jsonb NOT NULL,
	"scheduled_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guest_experience_configs" ADD CONSTRAINT "guest_experience_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_experience_configs" ADD CONSTRAINT "guest_experience_configs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guest_experience_configs" ADD CONSTRAINT "guest_experience_configs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "guest_experience_branch_version_idx" ON "guest_experience_configs" USING btree ("branch_id","version");--> statement-breakpoint
CREATE INDEX "guest_experience_tenant_branch_status_idx" ON "guest_experience_configs" USING btree ("tenant_id","branch_id","status");