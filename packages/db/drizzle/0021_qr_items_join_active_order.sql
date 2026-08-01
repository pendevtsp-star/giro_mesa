ALTER TABLE "order_items" ADD COLUMN "source_channel" varchar(20) DEFAULT 'pos' NOT NULL;--> statement-breakpoint
CREATE INDEX "order_items_tenant_source_status_idx" ON "order_items" USING btree ("tenant_id","source_channel","status");
