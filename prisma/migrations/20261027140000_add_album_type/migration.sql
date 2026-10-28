-- Album 增加 type：区分「不区分 / 普通相册 / 策展」。
--
-- 'general'（默认，不区分）：画廊与策展页都展示——迁移前已有的相册全部落在这一档，
-- 因此升级后策展页的内容与升级前一致，不会突然空掉。
-- 'normal'（普通相册）：只进画廊相册视图，不进策展页。
-- 'curated'（策展）：策展页展示，同时仍可在画廊里打开。
--
-- 与 StorageSource.type 同款做法：用 TEXT 存枚举值，不新建 PG 枚举类型，避免后续
-- 加值需要 ALTER TYPE。
--
-- 一张照片可以同时属于多个相册：Album <-> Photo 是隐式多对多（"_AlbumPhotos"），
-- 本迁移不改变这层关系。

ALTER TABLE "Album" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'general';

CREATE INDEX "Album_type_idx" ON "Album"("type");
