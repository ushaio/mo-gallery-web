-- 公众号图文（草稿箱 / 发表记录）的本地投影：后台「文章创作 → 公众号」页签读这张表，
-- 只有首次进入 / 点「同步」/ 双击页签时才去微信拉一次（单页 20 条、最多 3 页）。
-- 站点级绑定：按 appId 区分，换绑后旧公众号的行不会被读出来。回滚 = DROP TABLE。
CREATE TABLE "WeChatArticle" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL DEFAULT '',
    "author" TEXT NOT NULL DEFAULT '',
    "digest" TEXT NOT NULL DEFAULT '',
    "coverUrl" TEXT NOT NULL DEFAULT '',
    "articleUrl" TEXT NOT NULL DEFAULT '',
    "sourceUrl" TEXT NOT NULL DEFAULT '',
    "updateTime" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeChatArticle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeChatArticle_appId_kind_itemId_position_key" ON "WeChatArticle"("appId", "kind", "itemId", "position");

-- CreateIndex
CREATE INDEX "WeChatArticle_appId_kind_updateTime_idx" ON "WeChatArticle"("appId", "kind", "updateTime");
