DROP INDEX "rooms_status_created_at_idx";--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "rooms_status_published_at_idx" ON "rooms" USING btree ("status","published_at");--> statement-breakpoint
-- Backfill: rooms that are or were public (available, rented) count as published when created.
UPDATE "rooms" SET "published_at" = "created_at" WHERE "status" IN ('available', 'rented') AND "published_at" IS NULL;
