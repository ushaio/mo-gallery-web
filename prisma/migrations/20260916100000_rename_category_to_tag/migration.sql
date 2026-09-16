-- Rename Category model to Tag (photo tags), preserving all data.

-- 1) Rename the entity table and its constraints/indexes.
ALTER TABLE "Category" RENAME TO "Tag";
ALTER TABLE "Tag" RENAME CONSTRAINT "Category_pkey" TO "Tag_pkey";
ALTER INDEX "Category_name_key" RENAME TO "Tag_name_key";

-- 2) Rebuild the implicit many-to-many join table with Prisma's expected name
--    and column order. Prisma's implicit relation for Photo.tags <-> Tag.photos
--    is "_PhotoToTag" with A = Photo.id, B = Tag.id.
--    The legacy "_CategoryToPhoto" table stores A = Category.id, B = Photo.id,
--    so we rename it aside, create the new table, copy rows with columns
--    swapped (B -> A, A -> B), then drop the legacy table.
ALTER TABLE "_CategoryToPhoto" RENAME TO "_TagToPhoto_legacy";
ALTER TABLE "_TagToPhoto_legacy" RENAME CONSTRAINT "_CategoryToPhoto_AB_pkey" TO "_TagToPhoto_legacy_AB_pkey";
ALTER INDEX "_CategoryToPhoto_B_index" RENAME TO "_TagToPhoto_legacy_B_index";
ALTER TABLE "_TagToPhoto_legacy" RENAME CONSTRAINT "_CategoryToPhoto_A_fkey" TO "_TagToPhoto_legacy_A_fkey";
ALTER TABLE "_TagToPhoto_legacy" RENAME CONSTRAINT "_CategoryToPhoto_B_fkey" TO "_TagToPhoto_legacy_B_fkey";

CREATE TABLE "_PhotoToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_PhotoToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- Copy rows; legacy A (Tag id) becomes B, legacy B (Photo id) becomes A.
INSERT INTO "_PhotoToTag" ("A", "B")
SELECT "B", "A" FROM "_TagToPhoto_legacy";

CREATE INDEX "_PhotoToTag_B_index" ON "_PhotoToTag"("B");

ALTER TABLE "_PhotoToTag" ADD CONSTRAINT "_PhotoToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_PhotoToTag" ADD CONSTRAINT "_PhotoToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "_TagToPhoto_legacy";