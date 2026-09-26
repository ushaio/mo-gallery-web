# @mo-gallery/content-core

个人站内容领域的纯 TS 包：站点元数据类型、发布状态机（`publication.ts`）、owner-scoped repository 接口（`repository.ts`）。

约束（PRD 09-25-shared-public-site R10/R11）：

- 租户只用稳定的 `ownerId`，username 由宿主在解析层处理；
- repository 实现必须在数据库查询层按 `ownerId` 过滤；
- 站点发布与文件外部访问正交，本包不感知外部访问；
- 不依赖 Prisma / Next / Wails，Web、Official、Desktop v3 均可引用。
