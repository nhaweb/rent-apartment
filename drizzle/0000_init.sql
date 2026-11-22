CREATE TYPE "public"."contact_request_status" AS ENUM('new', 'contacted', 'closed');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('available', 'rented', 'hidden');--> statement-breakpoint
CREATE TABLE "contact_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"renter_name" text NOT NULL,
	"renter_phone" text NOT NULL,
	"message" text NOT NULL,
	"preferred_viewing_time" text,
	"status" "contact_request_status" DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "landlords" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"zalo" text,
	"email" text NOT NULL,
	CONSTRAINT "landlords_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"landlord_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"price" integer NOT NULL,
	"deposit" integer NOT NULL,
	"area" integer NOT NULL,
	"address" text NOT NULL,
	"district" text NOT NULL,
	"district_slug" text NOT NULL,
	"ward" text NOT NULL,
	"city" text NOT NULL,
	"amenities" text[] DEFAULT '{}' NOT NULL,
	"photos" text[] DEFAULT '{}' NOT NULL,
	"status" "room_status" DEFAULT 'available' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contact_requests" ADD CONSTRAINT "contact_requests_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_landlord_id_landlords_id_fk" FOREIGN KEY ("landlord_id") REFERENCES "public"."landlords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_requests_room_id_idx" ON "contact_requests" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "rooms_status_created_at_idx" ON "rooms" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "rooms_status_district_slug_idx" ON "rooms" USING btree ("status","district_slug");--> statement-breakpoint
CREATE INDEX "rooms_landlord_id_idx" ON "rooms" USING btree ("landlord_id");