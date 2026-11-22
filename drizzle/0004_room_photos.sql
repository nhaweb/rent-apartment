CREATE TABLE "room_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"key" text NOT NULL,
	"thumb_key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_photos_size_positive" CHECK ("room_photos"."width" > 0 and "room_photos"."height" > 0)
);
--> statement-breakpoint
ALTER TABLE "room_photos" ADD CONSTRAINT "room_photos_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "room_photos_room_id_sort_order_idx" ON "room_photos" USING btree ("room_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "room_photos_key_idx" ON "room_photos" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "room_photos_thumb_key_idx" ON "room_photos" USING btree ("thumb_key");--> statement-breakpoint
ALTER TABLE "rooms" DROP COLUMN "photos";--> statement-breakpoint
-- Photos moved to room_photos (old rooms.photos values were bundled mock assets,
-- re-uploaded to R2 by `npm run db:seed`). Every room now has 0 photos, and an
-- available room needs at least one, so hide them until photos are added.
UPDATE "rooms" SET "status" = 'hidden' WHERE "status" = 'available';
