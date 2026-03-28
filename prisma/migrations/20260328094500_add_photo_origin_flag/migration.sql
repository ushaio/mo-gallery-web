ALTER TABLE "Photo"
ADD COLUMN "originFlag" TEXT NOT NULL DEFAULT 'web';

UPDATE "Photo"
SET "originFlag" = 'web'
WHERE "originFlag" IS NULL OR "originFlag" = '';
