-- Add a vendor column to StorageSource.
--
-- `type` names the protocol family only ('local' | 'github' | 's3'), so every
-- S3-compatible product (Cloudflare R2, Qiniu Kodo, Aliyun OSS, Tencent COS,
-- MinIO, AWS S3) collapses to the same value and cannot be told apart. The
-- vendor column carries the concrete product id instead, and both the web
-- admin and the Desktop client write/read the same value.
--
-- Nullable and without a default: pre-existing rows have no known vendor, and
-- backfilling would have to guess. Readers treat NULL as "unknown" and fall
-- back to the protocol family for display.

ALTER TABLE "StorageSource" ADD COLUMN "vendor" TEXT;
