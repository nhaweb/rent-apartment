-- Email verification is now required before a room can be "available".
-- Landlords who signed up before it existed are treated as verified, so
-- their listings stay public.
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;
