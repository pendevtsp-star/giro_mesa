ALTER TABLE "tenants"
ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "tenants"
SET "is_demo" = true
WHERE "slug" = 'bar-aurora-demo';
