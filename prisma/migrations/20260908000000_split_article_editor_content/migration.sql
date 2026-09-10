BEGIN;

CREATE TYPE "EditorType" AS ENUM ('tiptap', 'milkdown');

ALTER TABLE "Blog" ADD COLUMN "editorType" "EditorType" NOT NULL DEFAULT 'tiptap';
ALTER TABLE "Story" ADD COLUMN "editorType" "EditorType" NOT NULL DEFAULT 'tiptap';

CREATE TABLE "BlogContent" (
    "id" TEXT NOT NULL,
    "blogId" TEXT NOT NULL,
    "editorType" "EditorType" NOT NULL,
    "tiptapContent" TEXT NOT NULL DEFAULT '',
    "tiptapContentJson" JSONB,
    "milk_content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlogContent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StoryContent" (
    "id" TEXT NOT NULL,
    "storyId" TEXT NOT NULL,
    "editorType" "EditorType" NOT NULL,
    "tiptapContent" TEXT NOT NULL DEFAULT '',
    "tiptapContentJson" JSONB,
    "milk_content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoryContent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogContent_blogId_editorType_key" ON "BlogContent"("blogId", "editorType");
CREATE UNIQUE INDEX "StoryContent_storyId_editorType_key" ON "StoryContent"("storyId", "editorType");

ALTER TABLE "BlogContent" ADD CONSTRAINT "BlogContent_blogId_fkey"
    FOREIGN KEY ("blogId") REFERENCES "Blog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoryContent" ADD CONSTRAINT "StoryContent_storyId_fkey"
    FOREIGN KEY ("storyId") REFERENCES "Story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every existing article is TipTap, including saved empty documents. Reuse the
-- parent ID for this initial content row, without requiring a UUID extension.
INSERT INTO "BlogContent" (
    "id", "blogId", "editorType", "tiptapContent", "tiptapContentJson", "milk_content", "createdAt", "updatedAt"
)
SELECT "id", "id", 'tiptap'::"EditorType", "content", "contentJson", "milk_content", "createdAt", "updatedAt"
FROM "Blog";

INSERT INTO "StoryContent" (
    "id", "storyId", "editorType", "tiptapContent", "tiptapContentJson", "milk_content", "createdAt", "updatedAt"
)
SELECT "id", "id", 'tiptap'::"EditorType", "content", "contentJson", "milk_content", "createdAt", "updatedAt"
FROM "Story";

ALTER TABLE "Blog" DROP COLUMN "content", DROP COLUMN "contentJson", DROP COLUMN "milk_content";
ALTER TABLE "Story" DROP COLUMN "content", DROP COLUMN "contentJson", DROP COLUMN "milk_content";

COMMIT;
