ALTER TABLE "Photo"
    ADD COLUMN "storageRuntime" TEXT NOT NULL DEFAULT 'web',
    ADD COLUMN "storagePluginId" TEXT,
    ADD COLUMN "thumbnailStorageKey" TEXT,
    ADD COLUMN "storageUrlType" TEXT NOT NULL DEFAULT 'public',
    ADD COLUMN "storageUrlExpiresAt" TIMESTAMP(3);

-- Backfill existing photos explicitly so the migration remains deterministic
-- when defaults are changed in a future schema revision. Existing objects are
-- Web-managed; no provider, URL, key, hash, or file content is rewritten.
UPDATE "Photo"
SET "storageRuntime" = 'web',
    "storagePluginId" = NULL,
    "thumbnailStorageKey" = NULL,
    "storageUrlType" = COALESCE(NULLIF("storageUrlType", ''), 'public'),
    "storageUrlExpiresAt" = NULL;

CREATE INDEX "Photo_storageRuntime_storageSourceId_idx"
    ON "Photo"("storageRuntime", "storageSourceId");
