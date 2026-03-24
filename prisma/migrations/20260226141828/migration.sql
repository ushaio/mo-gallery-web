-- AlterTable
ALTER TABLE "Story"
ADD COLUMN "storyDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Story_storyDate_idx" ON "Story"("storyDate");
