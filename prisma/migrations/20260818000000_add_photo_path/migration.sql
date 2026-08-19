-- Photo storage URL refactor.
--
-- * `url`/`thumbnailUrl` (full baked URLs) and `storageKey`/`thumbnailStorageKey`
--   are replaced by `path`/`thumbPath` (relative storage paths). The full URL is
--   now derived at read time from the storage source's public config, so changing
--   a source's base address re-derives every URL without rewriting rows.
--
-- Rows that already carry `storageKey`/`thumbnailStorageKey` migrate exactly.
-- Older rows without a key are recovered from the baked URL (local `/uploads/...`
-- loses the prefix the source adds back; absolute http(s) URLs are reduced to
-- their path component). A source-aware backfill script can repair any remaining
-- legacy rows before production cut-over.

ALTER TABLE "Photo"
    ADD COLUMN "path" TEXT,
    ADD COLUMN "thumbPath" TEXT;

-- 1) Newer rows: the storage key already IS the relative path.
UPDATE "Photo"
SET "path" = "storageKey",
    "thumbPath" = "thumbnailStorageKey"
WHERE "storageKey" IS NOT NULL OR "thumbnailStorageKey" IS NOT NULL;

-- 2) Legacy original path from the baked URL.
UPDATE "Photo"
SET "path" = CASE
        WHEN "url" LIKE '/uploads/%' THEN substring("url" FROM 9)
        WHEN "url" ~ '^https?://[^/]+/(.*)$' THEN substring("url" FROM '^https?://[^/]+/(.*)$')
        WHEN "url" LIKE '/%' THEN substring("url" FROM 2)
        ELSE "url"
    END
WHERE ("storageKey" IS NULL OR "storageKey" = '')
  AND "path" IS NULL
  AND "url" IS NOT NULL AND "url" <> '';

-- 3) Legacy thumbnail path from the baked thumbnail URL.
UPDATE "Photo"
SET "thumbPath" = CASE
        WHEN "thumbnailUrl" LIKE '/uploads/%' THEN substring("thumbnailUrl" FROM 9)
        WHEN "thumbnailUrl" ~ '^https?://[^/]+/(.*)$' THEN substring("thumbnailUrl" FROM '^https?://[^/]+/(.*)$')
        WHEN "thumbnailUrl" LIKE '/%' THEN substring("thumbnailUrl" FROM 2)
        ELSE "thumbnailUrl"
    END
WHERE ("thumbnailStorageKey" IS NULL OR "thumbnailStorageKey" = '')
  AND "thumbPath" IS NULL
  AND "thumbnailUrl" IS NOT NULL AND "thumbnailUrl" <> '';

-- 4) Normalize legacy URL types to the public default.
UPDATE "Photo"
SET "storageUrlType" = COALESCE(NULLIF("storageUrlType", ''), 'public');

-- 5) Drop the replaced columns.
ALTER TABLE "Photo"
    DROP COLUMN "url",
    DROP COLUMN "thumbnailUrl",
    DROP COLUMN "storageKey",
    DROP COLUMN "thumbnailStorageKey";
