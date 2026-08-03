CREATE TABLE "ecosystem_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid,
	"source_product" varchar(40) NOT NULL,
	"target_product" varchar(40) NOT NULL,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"name" varchar(160) NOT NULL,
	"message" varchar(500) NOT NULL,
	"target_url" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "federation_handoffs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"target_product" varchar(40) NOT NULL,
	"audience" varchar(80) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenant_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"subscription_id" uuid,
	"code" varchar(120) NOT NULL,
	"status" varchar(24) DEFAULT 'active' NOT NULL,
	"source" varchar(40) DEFAULT 'platform' NOT NULL,
	"expires_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ecosystem_campaigns" ADD CONSTRAINT "ecosystem_campaigns_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ecosystem_campaigns" ADD CONSTRAINT "ecosystem_campaigns_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federation_handoffs" ADD CONSTRAINT "federation_handoffs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "federation_handoffs" ADD CONSTRAINT "federation_handoffs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_entitlements" ADD CONSTRAINT "tenant_entitlements_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ecosystem_campaigns_tenant_status_idx" ON "ecosystem_campaigns" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "ecosystem_campaigns_branch_status_idx" ON "ecosystem_campaigns" USING btree ("branch_id","status");--> statement-breakpoint
CREATE INDEX "federation_handoffs_tenant_user_idx" ON "federation_handoffs" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "federation_handoffs_expiry_idx" ON "federation_handoffs" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_entitlements_tenant_code_idx" ON "tenant_entitlements" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE INDEX "tenant_entitlements_tenant_status_idx" ON "tenant_entitlements" USING btree ("tenant_id","status");
