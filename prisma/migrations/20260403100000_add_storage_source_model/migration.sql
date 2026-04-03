-- CreateTable
CREATE TABLE "StorageSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accessKey" TEXT,
    "secretKey" TEXT,
    "bucket" TEXT,
    "region" TEXT,
    "endpoint" TEXT,
    "publicUrl" TEXT,
    "basePath" TEXT,
    "branch" TEXT,
    "accessMethod" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageSource_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add storageSourceId to Photo
ALTER TABLE "Photo" ADD COLUMN "storageSourceId" TEXT;

-- Migrate existing settings into StorageSource rows
-- and link existing photos by storageProvider type
DO $$
DECLARE
  local_id  TEXT := gen_random_uuid()::text;
  github_id TEXT := gen_random_uuid()::text;
  s3_id     TEXT := gen_random_uuid()::text;
  v_github_token TEXT;
  v_s3_key       TEXT;
BEGIN
  SELECT value INTO v_github_token FROM "Setting" WHERE key = 'github_token';
  SELECT value INTO v_s3_key       FROM "Setting" WHERE key = 'r2_access_key_id';

  -- ── Local ────────────────────────────────────────────────────────────────
  INSERT INTO "StorageSource"
    ("id", "name", "type", "createdAt", "updatedAt")
  VALUES
    (local_id, 'Local', 'local', NOW(), NOW());

  UPDATE "Photo" SET "storageSourceId" = local_id
  WHERE "storageProvider" = 'local';

  -- ── GitHub ───────────────────────────────────────────────────────────────
  IF v_github_token IS NOT NULL AND v_github_token <> '' THEN
    INSERT INTO "StorageSource"
      ("id", "name", "type",
       "accessKey", "bucket", "basePath", "branch", "accessMethod", "publicUrl",
       "createdAt", "updatedAt")
    VALUES (
      github_id, 'GitHub', 'github',
      NULLIF((SELECT value FROM "Setting" WHERE key = 'github_token'),        ''),
      NULLIF((SELECT value FROM "Setting" WHERE key = 'github_repo'),         ''),
      NULLIF((SELECT value FROM "Setting" WHERE key = 'github_path'),         ''),
      COALESCE(NULLIF((SELECT value FROM "Setting" WHERE key = 'github_branch'),        ''), 'main'),
      COALESCE(NULLIF((SELECT value FROM "Setting" WHERE key = 'github_access_method'), ''), 'jsdelivr'),
      NULLIF((SELECT value FROM "Setting" WHERE key = 'github_pages_url'),    ''),
      NOW(), NOW()
    );

    UPDATE "Photo" SET "storageSourceId" = github_id
    WHERE "storageProvider" = 'github';
  END IF;

  -- ── S3 (was R2) ──────────────────────────────────────────────────────────
  IF v_s3_key IS NOT NULL AND v_s3_key <> '' THEN
    INSERT INTO "StorageSource"
      ("id", "name", "type",
       "accessKey", "secretKey", "bucket", "endpoint", "publicUrl", "basePath",
       "createdAt", "updatedAt")
    VALUES (
      s3_id, 'S3', 's3',
      NULLIF((SELECT value FROM "Setting" WHERE key = 'r2_access_key_id'),     ''),
      NULLIF((SELECT value FROM "Setting" WHERE key = 'r2_secret_access_key'), ''),
      NULLIF((SELECT value FROM "Setting" WHERE key = 'r2_bucket'),            ''),
      NULLIF((SELECT value FROM "Setting" WHERE key = 'r2_endpoint'),          ''),
      NULLIF((SELECT value FROM "Setting" WHERE key = 'r2_public_url'),        ''),
      NULLIF((SELECT value FROM "Setting" WHERE key = 'r2_path'),              ''),
      NOW(), NOW()
    );

    UPDATE "Photo" SET "storageSourceId" = s3_id
    WHERE "storageProvider" = 'r2';
  END IF;
END $$;

-- Rename r2 → s3 in Photo.storageProvider
UPDATE "Photo" SET "storageProvider" = 's3' WHERE "storageProvider" = 'r2';

-- Rename Setting keys r2_* → s3_*
UPDATE "Setting" SET "key" = 's3_access_key_id'     WHERE "key" = 'r2_access_key_id';
UPDATE "Setting" SET "key" = 's3_secret_access_key' WHERE "key" = 'r2_secret_access_key';
UPDATE "Setting" SET "key" = 's3_bucket'            WHERE "key" = 'r2_bucket';
UPDATE "Setting" SET "key" = 's3_endpoint'          WHERE "key" = 'r2_endpoint';
UPDATE "Setting" SET "key" = 's3_public_url'        WHERE "key" = 'r2_public_url';
UPDATE "Setting" SET "key" = 's3_path'              WHERE "key" = 'r2_path';

-- Update storage_provider value r2 → s3
UPDATE "Setting" SET "value" = 's3'
WHERE "key" = 'storage_provider' AND "value" = 'r2';
