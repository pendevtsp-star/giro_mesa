DROP INDEX "inventory_transfer_lines_transfer_idx";--> statement-breakpoint
ALTER TABLE "branch_inventory_settings" ADD COLUMN "consumption_location_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD COLUMN "transit_location_id" uuid;--> statement-breakpoint
UPDATE "stock_locations" SET "type" = 'stock', "updated_at" = now() WHERE "type" = 'main';--> statement-breakpoint
INSERT INTO "stock_locations" ("tenant_id", "branch_id", "name", "type")
SELECT "tenant_id", "id", 'Estoque principal', 'stock'
FROM "branches" b
WHERE NOT EXISTS (
	SELECT 1 FROM "stock_locations" sl
	WHERE sl."tenant_id" = b."tenant_id"
		AND sl."branch_id" = b."id"
		AND sl."archived_at" IS NULL
		AND sl."type" <> 'transit'
);--> statement-breakpoint
UPDATE "stock_movements" sm
SET "stock_location_id" = (
	SELECT sl."id"
	FROM "stock_locations" sl
	WHERE sl."tenant_id" = sm."tenant_id"
		AND sl."branch_id" = sm."branch_id"
		AND sl."archived_at" IS NULL
		AND sl."type" <> 'transit'
	ORDER BY CASE WHEN sl."type" = 'stock' THEN 0 ELSE 1 END, sl."created_at"
	LIMIT 1
)
WHERE sm."stock_location_id" IS NULL;--> statement-breakpoint
ALTER TABLE "branch_inventory_settings" ADD CONSTRAINT "branch_inventory_settings_consumption_location_id_stock_locations_id_fk" FOREIGN KEY ("consumption_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_transit_location_id_stock_locations_id_fk" FOREIGN KEY ("transit_location_id") REFERENCES "public"."stock_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_transfer_lines_item_idx" ON "inventory_transfer_lines" USING btree ("tenant_id","transfer_id","inventory_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_locations_one_transit_idx" ON "stock_locations" USING btree ("tenant_id","branch_id") WHERE "stock_locations"."type" = 'transit' and "stock_locations"."archived_at" is null;--> statement-breakpoint
ALTER TABLE "branch_inventory_settings" ADD CONSTRAINT "branch_inventory_settings_transfer_mode_check" CHECK ("branch_inventory_settings"."transfer_mode" in ('immediate', 'awaiting_receipt'));--> statement-breakpoint
ALTER TABLE "branch_inventory_settings" ADD CONSTRAINT "branch_inventory_settings_approval_threshold_check" CHECK ("branch_inventory_settings"."manager_approval_threshold" >= 0 and "branch_inventory_settings"."manager_approval_threshold" <= 100);--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_sent_check" CHECK ("inventory_transfer_lines"."quantity_sent" > 0);--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_received_check" CHECK ("inventory_transfer_lines"."quantity_received" is null or ("inventory_transfer_lines"."quantity_received" >= 0 and "inventory_transfer_lines"."quantity_received" <= "inventory_transfer_lines"."quantity_sent"));--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_status_check" CHECK ("inventory_transfers"."status" in ('draft', 'awaiting_receipt', 'completed', 'cancelled'));--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_mode_check" CHECK ("inventory_transfers"."mode" in ('immediate', 'awaiting_receipt'));--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_distinct_locations_check" CHECK ("inventory_transfers"."origin_location_id" <> "inventory_transfers"."destination_location_id");--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_version_check" CHECK ("inventory_transfers"."version" > 0);
