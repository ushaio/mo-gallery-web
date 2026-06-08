ALTER TABLE "Photo" ADD COLUMN "showFlag" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Photo_showFlag_idx" ON "Photo"("showFlag");
