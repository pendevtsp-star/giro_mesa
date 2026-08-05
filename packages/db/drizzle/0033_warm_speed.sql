CREATE TABLE "branch_inventory_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"transfer_mode" varchar(24) DEFAULT 'immediate' NOT NULL,
	"manager_approval_threshold" numeric(14, 3) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transfer_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"quantity_sent" numeric(14, 3) NOT NULL,
	"quantity_received" numeric(14, 3),
	"divergence_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"origin_location_id" uuid NOT NULL,
	"destination_location_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"received_by_user_id" uuid,
	"status" varchar(24) DEFAULT 'draft' NOT NULL,
	"mode" varchar(24) DEFAULT 'immediate' NOT NULL,
	"reason" text NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"dispatched_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "returnable_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"full_inventory_item_id" uuid NOT NULL,
	"empty_inventory_item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_locations" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "branch_inventory_settings" ADD CONSTRAINT "branch_inventory_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_inventory_settings" ADD CONSTRAINT "branch_inventory_settings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_transfer_id_inventory_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."inventory_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_origin_location_id_stock_locations_id_fk" FOREIGN KEY ("origin_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_destination_location_id_stock_locations_id_fk" FOREIGN KEY ("destination_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returnable_mappings" ADD CONSTRAINT "returnable_mappings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returnable_mappings" ADD CONSTRAINT "returnable_mappings_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returnable_mappings" ADD CONSTRAINT "returnable_mappings_full_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("full_inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returnable_mappings" ADD CONSTRAINT "returnable_mappings_empty_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("empty_inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_inventory_settings_scope_idx" ON "branch_inventory_settings" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "inventory_transfer_lines_transfer_idx" ON "inventory_transfer_lines" USING btree ("tenant_id","transfer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_transfers_tenant_key_idx" ON "inventory_transfers" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "inventory_transfers_branch_status_idx" ON "inventory_transfers" USING btree ("tenant_id","branch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "returnable_mappings_product_idx" ON "returnable_mappings" USING btree ("tenant_id","product_id");