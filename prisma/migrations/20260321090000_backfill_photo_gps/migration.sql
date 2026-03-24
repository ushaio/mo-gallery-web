-- Backfill GPS JSON from existing latitude/longitude values.
-- Only fill rows that do not already have gps data.
UPDATE "Photo"
SET "gps" = CONCAT(
  '{"latitude":',
  "latitude"::text,
  ',"longitude":',
  "longitude"::text,
  ',"altitude":0}'
)
WHERE COALESCE(BTRIM("gps"), '') = ''
  AND "latitude" IS NOT NULL
  AND "longitude" IS NOT NULL;

-- Drop legacy coordinate columns after successful backfill.
ALTER TABLE "Photo"
DROP COLUMN "latitude",
DROP COLUMN "longitude";
