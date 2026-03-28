UPDATE "Story"
SET "storyDate" = COALESCE("storyDate", "createdAt", CURRENT_TIMESTAMP)
WHERE "storyDate" IS NULL;

ALTER TABLE "Story"
ALTER COLUMN "storyDate" SET DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "Story"
ALTER COLUMN "storyDate" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "Story_storyDate_idx" ON "Story"("storyDate");
