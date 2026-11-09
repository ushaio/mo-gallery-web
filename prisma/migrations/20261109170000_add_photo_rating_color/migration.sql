-- Photo 增加评分与颜色标记（对齐桌面端本地资源库）。
-- rating：0–5 星评分，0 表示未评分。
-- colorLabel：颜色标记，'' 表示无标记；取值 red / orange / yellow / green / blue / purple。

ALTER TABLE "Photo"
  ADD COLUMN "rating" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "colorLabel" TEXT NOT NULL DEFAULT '';
