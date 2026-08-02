CREATE TABLE "purchase_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product" varchar(40) DEFAULT 'giromesa' NOT NULL,
	"plan_code" varchar(40) NOT NULL,
	"status" varchar(32) DEFAULT 'pending' NOT NULL,
	"payment_method" varchar(40) NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"idempotency_key" varchar(180) NOT NULL,
	"billing_email" varchar(255),
	"provider" varchar(40) DEFAULT 'asaas' NOT NULL,
	"provider_reference" varchar(160),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_intents" ADD CONSTRAINT "purchase_intents_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_intents_tenant_key_idx" ON "purchase_intents" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "purchase_intents_tenant_status_idx" ON "purchase_intents" USING btree ("tenant_id","status");