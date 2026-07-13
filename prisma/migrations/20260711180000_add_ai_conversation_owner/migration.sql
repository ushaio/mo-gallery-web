-- AlterTable
ALTER TABLE "AiConversation" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE INDEX "AiConversation_userId_scopeId_updatedAt_idx"
ON "AiConversation"("userId", "scopeId", "updatedAt");

-- AddForeignKey
ALTER TABLE "AiConversation"
ADD CONSTRAINT "AiConversation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
