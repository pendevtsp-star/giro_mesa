ALTER TABLE "dining_tables"
ADD COLUMN IF NOT EXISTS "group_id" uuid;
--> statement-breakpoint
ALTER TABLE "dining_tables"
ADD COLUMN IF NOT EXISTS "reserved_name" varchar(120);
