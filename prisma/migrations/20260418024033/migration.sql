-- AlterTable
ALTER TABLE "StorageSource" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "AiConversation_scopeId_updatedAt_idx" ON "AiConversation"("scopeId", "updatedAt");
