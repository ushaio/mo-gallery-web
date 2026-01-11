-- AlterTable
ALTER TABLE "Photo" ADD COLUMN     "fileHash" TEXT;

-- CreateIndex
CREATE INDEX "Photo_fileHash_idx" ON "Photo"("fileHash");