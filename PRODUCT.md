# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

MO Gallery 面向个人摄影师，以及有媒体创作需求的创作者。用户可以使用公开 Web 站点浏览和展示作品，使用 Web 管理后台维护云端内容，使用独立 Desktop 客户端管理本地照片资源与桌面创作工作流，并使用 Mobile 客户端进行移动采集、上传和轻量浏览。

## Product Purpose

MO Gallery 是围绕摄影内容建立的一体化跨端平台，连接公开作品展示、故事与博客叙事、云端内容管理、本地照片资源库、移动上传和桌面创作工具。它的目标是让用户从照片采集、整理、编辑，到发布和阅读，能够在职责清晰的多个客户端之间完成连续工作流。

产品成功意味着用户能够可靠地管理自己的照片资产，组织有上下文的摄影内容，并以作品集、相册、胶卷、故事、博客或 Zine 等形式发布和分享，而不必在彼此割裂的图库、编辑器和发布系统之间重复维护内容。

## Positioning

MO Gallery 的差异化机制是：将公开摄影展示与内容叙事、云端管理、独立 Desktop 本地图库和 Mobile 采集连接为一个跨端摄影工作流，同时保持云端业务数据与本地原图资产的清晰所有权边界。

## Operating Context

- **Public Web** 负责访问者浏览摄影作品、相册、胶卷、故事、博客和其他公开内容。
- **Web Admin** 负责浏览器内的云端资源管理、上传、内容编辑、存储维护、评论管理和系统设置。
- **Desktop** 是独立的桌面客户端，负责云端管理、本地照片资源库、批量上传、照片日志、Zine、AI 辅助创作以及本地文件处理。Desktop 本地图库不是云端图库的镜像。
- **Mobile** 负责移动端登录、照片选择与采集、后台上传队列，以及图库和故事的轻量浏览；当前以 Android 为首要目标平台。
- 多端通过统一的 `/api/*` HTTP API 协作；认证使用服务端校验的会话和 JWT 访问机制。
- 用户可能使用自托管 Node.js、Docker 或 Vercel 部署 Web/API，并为媒体配置 Local、S3-compatible、Cloudflare R2 或 GitHub 存储后端。

## Capabilities and Constraints

- 支持照片、相册、胶卷、故事、博客、评论、友链、多语言和主题等公开内容能力。
- 支持照片 EXIF 提取、主色提取、批量上传、重复检测、可见性和精选状态管理，以及列表、宫格、瀑布流和时间线等浏览方式。
- 支持 TipTap 富文本编辑、照片插入和排序、封面处理、地图叙事、草稿保存，以及 Desktop Zine 排版与导出。
- Desktop 本地图库独立保存用户本机原图，并使用本地 SQLite 保存索引、组织信息和状态；本地图库与云端图库具有不同的数据所有权、删除/恢复和缓存语义。
- Desktop 必须通过 Go service / proxy 调用 Web API 访问云端业务数据，不能直连云端 PostgreSQL；本地文件处理和本地数据属于桌面端职责。
- Mobile 通过 HTTP API 访问业务数据，上传任务和会话状态保存在设备本地。
- AI 能力是可选的；AI prompt、领域模型和编排优先由共享 `packages/ai-agent` 维护，宿主负责编辑器语义、持久化、历史和最终提交。
- Web、Desktop 和 Mobile 是职责不同的客户端；Desktop 仅指独立桌面客户端，不应被描述为 Web 或 Mobile 客户端。
- 当前版本为 `v0.7.0-beta`；Desktop 当前重点支持 Windows，Mobile 当前以 Android 为主要开发和发布目标。实际发布状态以 Release 说明为准。

## Brand Commitments

- 产品名称为 **MO Gallery**。
- 现有产品描述将其定位为摄影展示、视觉叙事与图库管理的一体化平台；后续设计工作应保留这一产品事实。
- 许可证为 MIT；部署支持和版本信息应以仓库中的 README、RELEASE.md 和实际配置为准。

## Evidence on Hand

- 产品总览与能力说明：`README.md`、`README_EN.md`
- 跨端架构、数据边界和模块入口：`docs/PROJECT_CONTEXT.md`
- Web 应用、API、服务端和 Prisma：`src/`、`hono/`、`server/`、`prisma/`
- 独立 Desktop 客户端：`desktop/`、`desktop/frontend/`
- Mobile 客户端：`flutter/`
- 共享编辑器与 AI 能力：`packages/tiptap-editor/`、`packages/ai-agent/`
- 当前仓库有 Desktop 本地图库及相关 UI 的未提交改动；这些改动不属于本次产品事实确认，初始化过程未覆盖或回滚它们。
- 尚未确认可用于对外宣传的客户、案例、性能指标、商业数据或第三方背书；后续表面不得虚构这些证据。

## Product Principles

1. 摄影作品与其叙事上下文应被当作一个连续内容工作流处理。
2. 云端发布资产与本地原图资产必须保持清晰、可解释的数据边界。
3. 多端共享业务契约，但每个客户端只承担适合自身场景的职责。
4. 核心图库与内容能力在未配置 AI 时仍应可用。
5. 真实的照片、内容、存储状态和编辑结果优先于装饰性功能或未经证实的产品主张。
