ALTER TABLE "rooms" ADD COLUMN "lat" double precision;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "lng" double precision;--> statement-breakpoint
CREATE INDEX "rooms_status_lat_lng_idx" ON "rooms" USING btree ("status","lat","lng");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_location_pair" CHECK (("rooms"."lat" is null) = ("rooms"."lng" is null));