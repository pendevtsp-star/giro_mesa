CREATE TABLE "oauth_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid,
  "user_id" uuid NOT NULL,
  "provider" varchar(40) NOT NULL,
  "provider_user_id" varchar(255) NOT NULL,
  "email" varchar(255),
  "profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_accounts_provider_user_idx" ON "oauth_accounts" USING btree ("provider","provider_user_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_accounts_user_provider_idx" ON "oauth_accounts" USING btree ("user_id","provider");
--> statement-breakpoint
CREATE INDEX "oauth_accounts_tenant_user_idx" ON "oauth_accounts" USING btree ("tenant_id","user_id");
