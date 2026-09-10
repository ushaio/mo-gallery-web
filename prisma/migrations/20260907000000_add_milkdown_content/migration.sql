-- Keep Milkdown Markdown independent from the existing editors' content.
ALTER TABLE "Blog" ADD COLUMN "milk_content" TEXT;
ALTER TABLE "Story" ADD COLUMN "milk_content" TEXT;
