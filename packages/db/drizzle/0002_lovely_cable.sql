ALTER TABLE "integration_accounts" ADD COLUMN "api_key_hash" text;--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD COLUMN "api_key_last_four" varchar(8);--> statement-breakpoint
ALTER TABLE "integration_accounts" ADD COLUMN "api_key_created_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "integration_accounts_api_key_hash_idx" ON "integration_accounts" USING btree ("api_key_hash");