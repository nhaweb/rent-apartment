-- Two-level administrative units (province -> ward), see src/lib/locations.ts.
-- Old "district" (already the new ward names) -> "ward"; old "ward" (former
-- ward names) -> optional "neighborhood"; "city" -> "province".
-- Hand-written (drizzle-kit generate --custom) because the renames need answers
-- drizzle-kit can only ask interactively. The snapshot matches src/lib/db/schema.ts.
DROP INDEX "rooms_status_district_slug_idx";--> statement-breakpoint
ALTER TABLE "rooms" RENAME COLUMN "ward" TO "neighborhood";--> statement-breakpoint
ALTER TABLE "rooms" ALTER COLUMN "neighborhood" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" RENAME COLUMN "district" TO "ward";--> statement-breakpoint
ALTER TABLE "rooms" RENAME COLUMN "district_slug" TO "ward_slug";--> statement-breakpoint
ALTER TABLE "rooms" RENAME COLUMN "city" TO "province";--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "neighborhood_slug" text;--> statement-breakpoint
-- Fix the ward of every known neighborhood (some seed rows had the wrong one) and fill the slugs.
UPDATE "rooms" SET
	"ward" = CASE "neighborhood"
		WHEN 'Trần Phú' THEN 'Quy Nhơn'
		WHEN 'Lê Lợi' THEN 'Quy Nhơn'
		WHEN 'Lê Hồng Phong' THEN 'Quy Nhơn'
		WHEN 'Lý Thường Kiệt' THEN 'Quy Nhơn'
		WHEN 'Trần Hưng Đạo' THEN 'Quy Nhơn'
		WHEN 'Thị Nại' THEN 'Quy Nhơn'
		WHEN 'Hải Cảng' THEN 'Quy Nhơn'
		WHEN 'Đống Đa' THEN 'Quy Nhơn'
		WHEN 'Nguyễn Văn Cừ' THEN 'Quy Nhơn Nam'
		WHEN 'Ngô Mây' THEN 'Quy Nhơn Nam'
		WHEN 'Quang Trung' THEN 'Quy Nhơn Nam'
		WHEN 'Ghềnh Ráng' THEN 'Quy Nhơn Nam'
		WHEN 'Trần Quang Diệu' THEN 'Quy Nhơn Bắc'
		WHEN 'Nhơn Phú' THEN 'Quy Nhơn Bắc'
		WHEN 'Nhơn Bình' THEN 'Quy Nhơn Đông'
		WHEN 'Nhơn Hội' THEN 'Quy Nhơn Đông'
		WHEN 'Nhơn Lý' THEN 'Quy Nhơn Đông'
		WHEN 'Nhơn Hải' THEN 'Quy Nhơn Đông'
		WHEN 'Bùi Thị Xuân' THEN 'Quy Nhơn Tây'
		WHEN 'Phước Mỹ' THEN 'Quy Nhơn Tây'
		ELSE "ward"
	END,
	"neighborhood_slug" = CASE "neighborhood"
		WHEN 'Trần Phú' THEN 'tran-phu'
		WHEN 'Lê Lợi' THEN 'le-loi'
		WHEN 'Lê Hồng Phong' THEN 'le-hong-phong'
		WHEN 'Lý Thường Kiệt' THEN 'ly-thuong-kiet'
		WHEN 'Trần Hưng Đạo' THEN 'tran-hung-dao'
		WHEN 'Thị Nại' THEN 'thi-nai'
		WHEN 'Hải Cảng' THEN 'hai-cang'
		WHEN 'Đống Đa' THEN 'dong-da'
		WHEN 'Nguyễn Văn Cừ' THEN 'nguyen-van-cu'
		WHEN 'Ngô Mây' THEN 'ngo-may'
		WHEN 'Quang Trung' THEN 'quang-trung'
		WHEN 'Ghềnh Ráng' THEN 'ghenh-rang'
		WHEN 'Trần Quang Diệu' THEN 'tran-quang-dieu'
		WHEN 'Nhơn Phú' THEN 'nhon-phu'
		WHEN 'Nhơn Bình' THEN 'nhon-binh'
		WHEN 'Nhơn Hội' THEN 'nhon-hoi'
		WHEN 'Nhơn Lý' THEN 'nhon-ly'
		WHEN 'Nhơn Hải' THEN 'nhon-hai'
		WHEN 'Bùi Thị Xuân' THEN 'bui-thi-xuan'
		WHEN 'Phước Mỹ' THEN 'phuoc-my'
	END;--> statement-breakpoint
UPDATE "rooms" SET "ward_slug" = CASE "ward"
		WHEN 'Quy Nhơn' THEN 'quy-nhon'
		WHEN 'Quy Nhơn Nam' THEN 'quy-nhon-nam'
		WHEN 'Quy Nhơn Bắc' THEN 'quy-nhon-bac'
		WHEN 'Quy Nhơn Đông' THEN 'quy-nhon-dong'
		WHEN 'Quy Nhơn Tây' THEN 'quy-nhon-tay'
		WHEN 'Nhơn Châu' THEN 'nhon-chau'
		ELSE "ward_slug"
	END;--> statement-breakpoint
CREATE TYPE "public"."water_unit" AS ENUM('m3', 'person');--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "electricity_state_rate" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "electricity_price" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "water_price" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "water_unit" "water_unit";--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "wifi_price" integer;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "service_fee" integer;--> statement-breakpoint
CREATE INDEX "rooms_status_ward_slug_idx" ON "rooms" USING btree ("status","ward_slug");--> statement-breakpoint
CREATE INDEX "rooms_status_neighborhood_slug_idx" ON "rooms" USING btree ("status","neighborhood_slug");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_water_pair" CHECK (("rooms"."water_price" is null) = ("rooms"."water_unit" is null));--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_electricity_mode" CHECK (not ("rooms"."electricity_state_rate" and "rooms"."electricity_price" is not null));--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_costs_non_negative" CHECK (coalesce("rooms"."electricity_price", 0) >= 0 and coalesce("rooms"."water_price", 0) >= 0 and coalesce("rooms"."wifi_price", 0) >= 0 and coalesce("rooms"."service_fee", 0) >= 0);
