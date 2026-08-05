ALTER TABLE "operational_devices" ADD COLUMN "initial_mode" varchar(40) DEFAULT 'table' NOT NULL;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD COLUMN "station_id" uuid;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD COLUMN "printer_device_id" uuid;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD COLUMN "allow_mode_switch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD CONSTRAINT "operational_devices_station_id_kds_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kds_stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_devices" ADD CONSTRAINT "operational_devices_printer_device_id_printer_devices_id_fk" FOREIGN KEY ("printer_device_id") REFERENCES "public"."printer_devices"("id") ON DELETE no action ON UPDATE no action;