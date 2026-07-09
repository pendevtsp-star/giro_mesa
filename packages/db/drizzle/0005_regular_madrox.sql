CREATE TYPE "public"."print_job_status" AS ENUM('pending', 'printing', 'printed', 'failed', 'canceled');--> statement-breakpoint
CREATE TABLE "print_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"printer_device_id" uuid,
	"print_route_id" uuid,
	"kds_ticket_id" uuid,
	"order_id" uuid,
	"requested_by_user_id" uuid,
	"kind" varchar(60) NOT NULL,
	"status" "print_job_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" varchar(180) NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rendered_text" text NOT NULL,
	"error_message" text,
	"printed_at" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"last_attempt_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "print_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"trigger" varchar(60) NOT NULL,
	"target_type" varchar(60) NOT NULL,
	"station_id" uuid,
	"product_category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"printer_device_id" uuid NOT NULL,
	"copies" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "printer_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"branch_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"role" varchar(40) NOT NULL,
	"connection_type" varchar(40) DEFAULT 'network' NOT NULL,
	"address" varchar(180),
	"port" integer,
	"paper_width" integer DEFAULT 80 NOT NULL,
	"characters_per_line" integer DEFAULT 48 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_printer_device_id_printer_devices_id_fk" FOREIGN KEY ("printer_device_id") REFERENCES "public"."printer_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_print_route_id_print_routes_id_fk" FOREIGN KEY ("print_route_id") REFERENCES "public"."print_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_kds_ticket_id_kds_tickets_id_fk" FOREIGN KEY ("kds_ticket_id") REFERENCES "public"."kds_tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_routes" ADD CONSTRAINT "print_routes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_routes" ADD CONSTRAINT "print_routes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_routes" ADD CONSTRAINT "print_routes_station_id_kds_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kds_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_routes" ADD CONSTRAINT "print_routes_printer_device_id_printer_devices_id_fk" FOREIGN KEY ("printer_device_id") REFERENCES "public"."printer_devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer_devices" ADD CONSTRAINT "printer_devices_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printer_devices" ADD CONSTRAINT "printer_devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "print_jobs_idempotency_idx" ON "print_jobs" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "print_jobs_tenant_status_idx" ON "print_jobs" USING btree ("tenant_id","status","created_at");--> statement-breakpoint
CREATE INDEX "print_jobs_branch_status_idx" ON "print_jobs" USING btree ("branch_id","status","created_at");--> statement-breakpoint
CREATE INDEX "print_routes_tenant_branch_idx" ON "print_routes" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE INDEX "print_routes_station_idx" ON "print_routes" USING btree ("tenant_id","station_id");--> statement-breakpoint
CREATE INDEX "printer_devices_tenant_branch_idx" ON "printer_devices" USING btree ("tenant_id","branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "printer_devices_branch_name_idx" ON "printer_devices" USING btree ("branch_id","name");