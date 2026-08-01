ALTER TABLE "dining_tables" ADD COLUMN "area_id" uuid;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "shape" varchar(20) DEFAULT 'rounded' NOT NULL;--> statement-breakpoint
ALTER TABLE "dining_tables" ADD COLUMN "archived_at" timestamp with time zone;