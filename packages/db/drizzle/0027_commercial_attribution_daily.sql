CREATE TABLE "commercial_attribution_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"day" date NOT NULL,
	"source" varchar(40) DEFAULT 'qr_organic' NOT NULL,
	"destination" varchar(40) NOT NULL,
	"campaign" varchar(80) DEFAULT 'organic_attribution' NOT NULL,
	"visits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "commercial_attribution_daily_visits_check" CHECK ("commercial_attribution_daily"."visits" >= 0)
);
--> statement-breakpoint
ALTER TABLE "commercial_attribution_daily" ADD CONSTRAINT "commercial_attribution_daily_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "commercial_attribution_daily" ADD CONSTRAINT "commercial_attribution_daily_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_attribution_daily_rollup_idx" ON "commercial_attribution_daily" USING btree ("tenant_id","branch_id","day","source","destination","campaign");
--> statement-breakpoint
CREATE INDEX "commercial_attribution_daily_tenant_day_idx" ON "commercial_attribution_daily" USING btree ("tenant_id","day");
