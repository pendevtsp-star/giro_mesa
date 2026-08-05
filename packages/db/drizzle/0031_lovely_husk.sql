CREATE TABLE "commercial_interests" (
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
);
--> statement-breakpoint
CREATE TABLE "legal_acceptances" (
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
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "is_alcoholic" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "products"
SET "is_alcoholic" = true
WHERE "spirit_type" IS NOT NULL
   OR "is_club_eligible" = true
   OR regexp_replace(coalesce("fiscal_ncm", ''), '[^0-9]', '', 'g') LIKE ANY (
     ARRAY['2203%', '2204%', '2205%', '2206%', '2208%']
   );--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commercial_interests_created_idx" ON "commercial_interests" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "legal_acceptances_tenant_user_idx" ON "legal_acceptances" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "legal_acceptances_document_idx" ON "legal_acceptances" USING btree ("tenant_id","user_id","document_type","document_version","document_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_hash_idx" ON "invitations" USING btree ("token_hash");
