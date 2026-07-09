-- 唯一索引是并发上传去重的最终兜底：应用层的两次检查之间仍存在毫秒级
-- 竞态窗口（见 hono/photos.ts 的 DUPLICATE_PHOTO 处理）。

-- 建索引前先处理历史重复：同一 fileHash 保留最早一条记录，较新记录的
-- fileHash 置空。记录本身不删除——冗余照片及其存储文件由管理员在后台
-- 自行清理（删除时可选择同时删除存储文件）。
UPDATE "Photo" AS p
SET "fileHash" = NULL
WHERE "fileHash" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM "Photo" AS q
    WHERE q."fileHash" = p."fileHash"
      AND q."id" <> p."id"
      AND (q."createdAt" < p."createdAt"
        OR (q."createdAt" = p."createdAt" AND q."id" < p."id"))
  );

-- DropIndex
DROP INDEX "Photo_fileHash_idx";

-- CreateIndex
CREATE UNIQUE INDEX "Photo_fileHash_key" ON "Photo"("fileHash");
