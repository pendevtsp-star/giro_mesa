CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"order_item_id" uuid,
	"seat_label" varchar(80),
	"amount_cents" integer NOT NULL,
	"allocated_by_user_id" uuid NOT NULL,
	"idempotency_key" varchar(180) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_amount_check" CHECK ("payment_allocations"."amount_cents" > 0),
	CONSTRAINT "payment_allocations_target_check" CHECK (("payment_allocations"."order_item_id" is not null and "payment_allocations"."seat_label" is null) or ("payment_allocations"."order_item_id" is null and "payment_allocations"."seat_label" is not null))
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "idempotency_key" varchar(180);--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_allocated_by_user_id_users_id_fk" FOREIGN KEY ("allocated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_idempotency_idx" ON "payment_allocations" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_allocations_tenant_order_idx" ON "payment_allocations" USING btree ("tenant_id","order_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_tenant_payment_idx" ON "payment_allocations" USING btree ("tenant_id","payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_tenant_item_idx" ON "payment_allocations" USING btree ("tenant_id","order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_items_idempotency_idx" ON "order_items" USING btree ("tenant_id","idempotency_key");