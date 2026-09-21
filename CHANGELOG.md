# Changelog

本文件记录 **mo-gallery-web**（Web 画廊展示页 / Web 后台管理 / `/api/*` 后端）每个发布版本的更新日志；每个版本一个条目，包含 `feat`（新功能）与 `fix`（问题修复）两部分，条目使用有序列表。面向用户的版本说明见 `RELEASE.md`；桌面端安装包仍在本仓库的 GitHub Release 发布。

## 写法约定

1. 开发中的改动先写在文件顶部的 `[Unreleased]` 下；发布时把它改成 `## [0.8.4] - YYYY-MM-DD`，并在最上方新增一个空的 `## [Unreleased]`。
2. 条目按 Conventional Commits 归类：`feat:` 归 `feat`，`fix:` 归 `fix`；`refactor:` / `perf:` 等只有对用户可见时才归入对应部分。
3. 一条 = 一个用户可感知的变化；同一功能的多条提交合并成一条，不要直接照抄 commit message。
4. `feat` 与 `fix` 两部分始终保留；确实没有对应改动时写 `1. 暂无`。
5. 汇总一个发布窗口内的提交：`git log --no-merges --pretty='%s' <上一个版本 tag>..HEAD`。
6. 涉及 `/api/*` 或 `@mo-gallery/*` 共享包的改动，请标注对 Desktop / App 的影响。

> 本文件于 2026-09-18 启用，不回溯此前的历史。下面的 `[Unreleased]` 收录启用时仍在开发中（2026-09-15 起提交）的改动。

## [Unreleased]

### feat

1. 存储源支持 `vendor` 标识（Prisma schema 迁移 + 接口重构 + 设置页展示）（`e3489d96`）
2. 公共故事编辑同步 `milkdown` 占位卡预览镜像，存储源 `vendor` 支持按类型缺省推导（`07b4dfad`）
3. 照片分类统一更名为标签（API 与后台 UI 全量对齐）（`b5052e9a`）
4. 采用 shared 包镜像同步机制（`276ecd48`）

### fix

1. 修复 Vercel 类型检查失败：依赖 `@mo-gallery/*` 升级至 v0.1.1（现已随镜像同步升级到 v0.1.2）（`2d3087af`）
