CREATE TABLE "zalo_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "landlords" ADD COLUMN "zalo_public_at" timestamp with time zone;