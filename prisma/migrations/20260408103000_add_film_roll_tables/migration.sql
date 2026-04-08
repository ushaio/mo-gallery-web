-- CreateTable
CREATE TABLE "FilmRoll" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "iso" INTEGER NOT NULL,
    "frameCount" INTEGER NOT NULL,
    "notes" TEXT,
    "shootDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilmRoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilmPhoto" (
    "id" TEXT NOT NULL,
    "filmRollId" TEXT NOT NULL,
    "photoId" TEXT NOT NULL,
    "frameNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FilmPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FilmRoll_shootDate_idx" ON "FilmRoll"("shootDate");

-- CreateIndex
CREATE UNIQUE INDEX "FilmPhoto_photoId_key" ON "FilmPhoto"("photoId");

-- CreateIndex
CREATE INDEX "FilmPhoto_filmRollId_idx" ON "FilmPhoto"("filmRollId");

-- AddForeignKey
ALTER TABLE "FilmPhoto" ADD CONSTRAINT "FilmPhoto_filmRollId_fkey" FOREIGN KEY ("filmRollId") REFERENCES "FilmRoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilmPhoto" ADD CONSTRAINT "FilmPhoto_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
