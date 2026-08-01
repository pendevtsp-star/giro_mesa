ALTER TABLE "cash_sessions" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "close_idempotency_key" varchar(120);--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_close_idempotency_idx" ON "cash_sessions" USING btree ("tenant_id","close_idempotency_key");--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_version_positive" CHECK ("cash_sessions"."version" > 0);
