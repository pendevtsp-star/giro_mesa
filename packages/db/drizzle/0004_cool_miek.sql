CREATE TABLE "fiscal_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"provider" varchar(40) DEFAULT 'mock' NOT NULL,
	"status" varchar(40) DEFAULT 'enabled' NOT NULL,
	"environment" varchar(20) DEFAULT 'homologation' NOT NULL,
	"default_model" varchar(20) DEFAULT 'nfce' NOT NULL,
	"legal_name" varchar(180),
	"trade_name" varchar(180),
	"document" varchar(32),
	"state_registration" varchar(32),
	"municipal_registration" varchar(32),
	"tax_regime" varchar(40) DEFAULT 'simples_nacional' NOT NULL,
	"uf" varchar(2),
	"city_code" varchar(12),
	"city_name" varchar(120),
	"series" varchar(20) DEFAULT '1' NOT NULL,
	"next_number" integer DEFAULT 1 NOT NULL,
	"certificate_secret_ref" varchar(160),
	"csc_secret_ref" varchar(160),
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD COLUMN "branch_id" uuid;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD COLUMN "environment" varchar(20) DEFAULT 'homologation' NOT NULL;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD COLUMN "series" varchar(20);--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD COLUMN "issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD COLUMN "canceled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD COLUMN "payload" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fiscal_ncm" varchar(12);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fiscal_cfop" varchar(8);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fiscal_cest" varchar(12);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fiscal_origin" varchar(2);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fiscal_cst" varchar(8);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fiscal_csosn" varchar(8);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fiscal_icms_rate" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fiscal_pis_rate" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "fiscal_cofins_rate" numeric(7, 4);--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD CONSTRAINT "fiscal_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fiscal_settings" ADD CONSTRAINT "fiscal_settings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_settings_tenant_branch_idx" ON "fiscal_settings" USING btree ("tenant_id","branch_id");--> statement-breakpoint
ALTER TABLE "fiscal_documents" ADD CONSTRAINT "fiscal_documents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fiscal_documents_order_model_idx" ON "fiscal_documents" USING btree ("tenant_id","order_id","model");