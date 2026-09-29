# Changelog

本文件记录 **mo-gallery-web**（Web 画廊展示页 / Web 后台管理 / `/api/*` 后端）每个发布版本的更新日志；每个版本一个条目，包含 `feat`（新功能）与 `fix`（问题修复）两部分，条目使用有序列表。面向用户的版本说明见 `RELEASE.md`；桌面端安装包仍在本仓库的 GitHub Release 发布。

## 写法约定

1. 开发中的改动先写在文件顶部的 `[Unreleased]` 下；发布时把它改成 `## [0.8.4] - YYYY-MM-DD`，并在最上方新增一个空的 `## [Unreleased]`。
1. 条目按 Conventional Commits 归类：`feat:` 归 `feat`，`fix:` 归 `fix`；`refactor:` / `perf:` 等只有对用户可见时才归入对应部分。
2. 一条 = 一个用户可感知的变化；同一功能的多条提交合并成一条，不要直接照抄 commit message。
3. `feat` 与 `fix` 两部分始终保留；确实没有对应改动时写 `1. 暂无`。
4. 汇总一个发布窗口内的提交：`git log --no-merges --pretty='%s' <上一个版本 tag>..HEAD`。
5. 涉及 `/api/*` 或 `@mo-gallery/*` 共享包的改动，请标注对 Desktop / App 的影响。

> 本文件于 2026-09-18 启用，不回溯此前的历史。下面的 `[Unreleased]` 收录启用时仍在开发中（2026-09-15 起提交）的改动。

## [Unreleased]

### feat
1. 服务端图片处理管线（EXIF / 主色 / 缩略图 / 压缩，原 `server/lib/{exif,colors,image-processing}.ts`）迁移至共享包 `@mo-gallery/image-pipeline`，上传行为不变

2. 存储源支持 `vendor` 标识（Prisma schema 迁移 + 接口重构 + 设置页展示）（`e3489d96`）
3. 公共故事编辑同步 `milkdown` 占位卡预览镜像，存储源 `vendor` 支持按类型缺省推导（`07b4dfad`）
4. 照片分类统一更名为标签（API 与后台 UI 全量对齐）（`b5052e9a`）
5. 采用 shared 包镜像同步机制（`276ecd48`）
6. 图库访客渲染组件接入共享包 `@mo-gallery/public-site`（mo-cloud-parity-plan W1）：网格视图与照片卡片（含虚拟化瀑布流内的卡片）改由共享组件渲染，新增 `src/lib/public-site.ts` 宿主适配器（照片 DTO ↔ 访客领域模型映射、媒体 URL/CDN 解析、站内路由注入）；照片卡片新增主色渐变占位与加载渐显，视图切换 / 分页 / 灯箱行为不变（仅前端渲染层，对 Desktop / App 无影响）
7. 故事 / 博客详情页正文渲染接入共享包 `@mo-gallery/public-site`（mo-cloud-parity-plan W1）：milkdown 正文与携带 `tiptapContentJson` 的 TipTap 正文改由共享 `ArticleBody`（`TiptapJsonView` 结构化渲染，不注入 HTML 字符串）渲染，正文内嵌照片点击、媒体 embed 卡（Spotify / 网易云）与故事引用卡在访客侧保留；仅存量无 JSON 的 TipTap 正文回落本地既有富文本管线，页面框架（封面、地图、照片画廊、评论）不变（仅前端渲染层，对 Desktop / App 无影响）
8. 同步共享包镜像：`@mo-gallery/public-site` 新增 `./theme.css` 主题层导出（`.psw` 作用域令牌与访客侧观感）与导航组合能力（`LinkAdapter` 可选 `about`、`SiteHeader` 新增 `showHomeNav`/`currentPath`/`transparentAtTop`），`@mo-gallery/api-client` 新增 `mo-cloud` 子模块；本仓库暂未消费新增能力，现有页面行为不变（镜像同步，对 Desktop / App 无影响）

### fix
1. 暂无

2. 修复 Vercel 类型检查失败：依赖 `@mo-gallery/*` 升级至 v0.1.1（现已随镜像同步升级到 v0.1.2）（`2d3087af`）
