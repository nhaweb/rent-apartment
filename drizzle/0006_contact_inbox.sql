CREATE TABLE "contact_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
DROP INDEX "contact_requests_room_id_idx";--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "status" SET DEFAULT 'hidden';--> statement-breakpoint
CREATE INDEX "contact_requests_room_id_status_created_at_idx" ON "contact_requests" USING btree ("room_id","status","created_at");--> statement-breakpoint
CREATE INDEX "contact_requests_room_id_phone_idx" ON "contact_requests" USING btree ("room_id","renter_phone");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_amounts_valid" CHECK ("rooms"."price" >= 0 and "rooms"."deposit" >= 0 and "rooms"."area" > 0);