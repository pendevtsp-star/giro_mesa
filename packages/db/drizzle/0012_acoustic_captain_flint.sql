-- Custom SQL migration file, put your code below! --

-- Create delivery_status enum
CREATE TYPE "public"."delivery_status" AS ENUM('pending', 'confirmed', 'preparing', 'ready_for_pickup', 'out_for_delivery', 'delivered', 'canceled');--> statement-breakpoint

-- Drop existing delivery_orders table (created in earlier migration with different schema)
DROP TABLE IF EXISTS "delivery_orders";--> statement-breakpoint

-- Recreate delivery_orders table with enhanced delivery fields
CREATE TABLE "delivery_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "channel" varchar(40) NOT NULL,
  "status" "delivery_status" DEFAULT 'pending' NOT NULL,
  "customer_name" varchar(160),
  "customer_phone" varchar(40),
  "delivery_address" text,
  "delivery_fee" integer DEFAULT 0 NOT NULL,
  "estimated_minutes" integer,
  "rider_name" varchar(120),
  "rider_phone" varchar(40),
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Foreign keys
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_orders" ADD CONSTRAINT "delivery_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- Indexes
CREATE INDEX "delivery_orders_tenant_idx" ON "delivery_orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "delivery_orders_order_idx" ON "delivery_orders" USING btree ("order_id");
