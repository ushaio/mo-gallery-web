-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "storyDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Story_storyDate_idx" ON "Story"("storyDate");
