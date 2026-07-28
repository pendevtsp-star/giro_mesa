CREATE TABLE IF NOT EXISTS "public_request_idempotency" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "tenant_id" uuid NOT NULL,
 "table_id" uuid NOT NULL,
 "action" varchar(60) NOT NULL,
 "idempotency_key_hash" text NOT NULL,
 "payload_hash" text NOT NULL,
 "response" jsonb,
 "created_at" timestamp with time zone DEFAULT now() NOT NULL,
 CONSTRAINT "public_request_idempotency_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id"),
 CONSTRAINT "public_request_idempotency_table_id_dining_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."dining_tables"("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "public_request_idempotency_key_idx"
ON "public_request_idempotency" USING btree ("table_id","action","idempotency_key_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_request_idempotency_created_idx"
ON "public_request_idempotency" USING btree ("tenant_id","created_at");
