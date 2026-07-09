ALTER TABLE "products" ADD COLUMN "is_club_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "bottle_volume_ml" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "default_dose_ml" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "spirit_type" varchar(60);