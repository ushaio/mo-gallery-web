# MO Gallery 项目上下文索引

> 用途：作为新会话的最小项目上下文入口，帮助 Agent 先定位模块，再按需读取代码，避免默认扫描整个仓库。
>
> 更新时间：2026-08-11
>
> 规则：本文档是导航和稳定架构摘要，不是源码副本。若本文档与当前源码、配置或测试不一致，以当前源码为准，并在任务完成后更新本文档。

## 1. 新会话读取协议

每个新任务按以下顺序执行：

1. 先读取根目录 `AGENTS.md` 或 `CLAUDE.md`（当前 Agent 支持哪个就读取哪个）。
2. 读取本文件。
3. 根据“任务 → 最小读取集合”定位入口文件。
4. 先读入口和直接依赖；只有发现跨边界调用、数据结构不明确或测试失败时，才继续展开。
5. 不要默认递归读取整个 `src/`、`desktop/frontend/src/`、`desktop/` 或 `docs/requirements/`。
6. 代码、配置、测试和数据库 schema 是行为事实来源；本文件只提供定位信息。

推荐新会话开场语句：

```text
先读取 AGENTS.md（或 CLAUDE.md）和 docs/PROJECT_CONTEXT.md。
根据当前任务选择最小相关文件集合，不要扫描整个仓库。
```

## 2. 项目定位

MO Gallery 是跨端摄影展示与照片内容工作台：

- **Web**：公开摄影站点和浏览器管理后台。
- **Desktop**：Wails + Go 的云端管理、本地照片资源库、上传、照片日志、Zine 与 AI 工作台。
- **Mobile**：Flutter Android-first 客户端，负责移动采集、上传队列和轻量浏览。
- **API / 数据层**：Next.js Route Handler 挂载 Hono，Prisma 访问 PostgreSQL。
- **媒体存储**：通过 `server/lib/storage/` 抽象 Local、S3-compatible、Cloudflare R2、GitHub 等后端。
- **共享包**：`packages/tiptap-editor` 提供 Web/Desktop 共用的 TipTap 编辑器；`packages/ai-agent` 提供跨端 AI 领域模型与编排。

## 3. 顶层目录地图

| 路径 | 职责 | 首选入口 |
|---|---|---|
| `src/app/` | Next.js App Router 页面、公开站点、Web 管理后台、API catch-all | `src/app/layout.tsx`、目标页面 `page.tsx` |
| `src/components/` | Web 共享 UI、图库视图、编辑器、评论、管理组件 | 目标页面导入链；富文本优先 `src/components/NarrativeTipTapEditor.tsx` |
| `src/contexts/` | Web 主题、设置、语言、认证等全局状态 | `src/app/layout.tsx` |
| `src/lib/api/` | Web 类型化 API 客户端 | `src/lib/api/core.ts`、对应领域模块 |
| `hono/` | Hono API 路由和中间件 | `hono/index.ts`、`hono/middleware/` |
| `server/lib/` | 服务端数据库、JWT、EXIF、图像、AI、存储实现 | `server/lib/db.ts`、`server/lib/storage/` |
| `prisma/` | PostgreSQL schema、migration、seed | `prisma/schema.prisma` |
| `packages/tiptap-editor/` | Web/Desktop 共享 TipTap 编辑器源码与测试 | `src/index.ts`、`src/NarrativeTipTapEditor.tsx` |
| `packages/ai-agent/` | 共享 AI contract、prompt、direct-edit 编排与测试 | `src/index.ts`、`README.md` |
| `desktop/` | Wails Go 主程序、服务、数据库、本地图库 | `desktop/app.go`、`desktop/main.go` |
| `desktop/frontend/` | Desktop React/Vite UI | `src/App.tsx`、`src/pages/` |
| `flutter/` | Flutter Mobile 客户端 | `lib/main.dart`、`lib/app/router.dart` |
| `tests/` | Web/跨模块聚焦测试 | 目标测试文件；另有各模块邻近测试 |
| `docs/requirements/` | 需求、领域模型、验证矩阵、ADR | 仅在需求或架构决策相关任务中读取 |
| `docs/superpowers/` | 历史设计与实施计划 | 需要追溯背景时按文件读取 |
| `scripts/` | 回归、迁移和维护脚本 | 只读目标脚本 |

## 4. 运行时与数据边界

```text
Web Next.js / Desktop Wails / Mobile Flutter
                  │ HTTP + JWT
                  ▼
        Next.js /api/* → Hono router
                  │
                  ├── Prisma → PostgreSQL（云端业务数据）
                  └── Storage provider（云端媒体文件）

Desktop 另有：Go services → Wails bindings → 本地前端
              Local Library Manager → SQLite 索引 + 用户本地原图/缓存
              Editor AI → `editor-ai.db` SQLite（Zine/独立 AI 助手共用会话与消息表）
              Article/Story Drafts → `drafts.db` SQLite（结构化正文列 + 编辑期元数据/待上传图片；首次运行从 IndexedDB 迁移）
              Zine → `zine.db` SQLite（项目 JSON + 本地导入图片 BLOB；首次运行从 IndexedDB 迁移并清理旧库）
Mobile 另有：本地 SQLite 上传队列 + secure storage 会话
```

### 重要边界

- Desktop 本地图库不是 PostgreSQL 云端图库的镜像；本地原图归用户本地图库目录，SQLite 保存索引、组织和状态。
- Desktop Zine 草稿及其本地导入图片由配置目录中的 `zine.db` 持久化；旧 IndexedDB 数据只补迁缺失记录，不覆盖 SQLite 中的新版本，迁移校验成功后自动删除旧库。
- Desktop 文章与叙事编辑草稿由配置目录中的 `drafts.db` 持久化；`title`、`content`、`contentJson` 等正文属性使用独立列，`cloudSynced` 标记草稿是否已与云端保存版本同步，待上传图片与封面/照片选择等编辑期状态存入元数据。旧 IndexedDB 草稿逐条校验迁移成功后清理，浏览器开发模式仍使用 IndexedDB。
- Desktop 云端业务数据必须由 Go service / proxy 调用 Web API，不能直连 PostgreSQL；仅文件处理、桌面插件对象操作及本地数据通过 Go 直接处理。本地图库能力由 `desktop/local_library/` 负责。
- Desktop 登录和会话恢复由 Web API 校验 token；客户端不得要求、保存或本地使用服务端 JWT 签名密钥。
- Mobile 业务数据通过 HTTP API，上传任务和会话状态保存在设备本地。
- Web API 统一位于 `/api/*`；Hono 处理领域路由和认证，响应通常使用 `{ success, data, meta }` envelope。
- AI 的 prompt、领域模型和编排放在 `packages/ai-agent`；不要把 prompt 逻辑复制到 Go。宿主负责编辑器语义、持久化、历史和最终提交。

## 5. Web 读取索引

### 页面与布局

- 根 providers、主题、站点设置、语言、认证：`src/app/layout.tsx`、`src/contexts/`。
- 公开图库：`src/app/gallery/`、`src/components/gallery/`。
- 公开故事/博客：`src/app/story/`、`src/app/blog/`、`src/components/StoryRichContent.tsx`。
- 管理后台壳与导航：`src/app/admin/layout.tsx`、`src/components/admin/AdminSidebar.tsx`。
- 管理资源库：`src/app/admin/library/`、`src/components/admin/Library*`。
- 管理照片/相册/胶卷：对应 `src/app/admin/{photos,albums,film-rolls}/` 和 `src/components/admin/`。
- 故事/博客编辑：`src/app/admin/logs/`、`src/components/NarrativeTipTapEditor.tsx`。
- 上传：`src/app/admin/upload/`、`src/components/admin/PhotoUploadParams.tsx`、上传相关组件。
- 设置/存储/AI：`src/app/admin/{settings,storage,ai-assistant}/`。

### Web API 与服务端

- API 挂载：`src/app/api/[[...route]]/route.ts`。
- 路由注册：`hono/index.ts`。
- 领域路由：`hono/photos.ts`、`stories.ts`、`blogs.ts`、`albums.ts`、`film-rolls.ts`、`auth.ts`、`storage.ts`、`settings.ts` 等。
- 认证：`hono/middleware/auth.ts`、`server/lib/jwt.ts`、`server/lib/admin-login-gate.ts`。
- 数据库客户端：`server/lib/db.ts`；模型与迁移：`prisma/schema.prisma`、`prisma/migrations/`。
- Web API 客户端：`src/lib/api/core.ts` → `src/lib/api.ts` → 对应领域模块。
- 存储：`server/lib/storage/factory.ts`、`config.ts`、具体 provider 文件。
- 图片上传/处理：`server/lib/photo-upload-assets.ts`、`image-processing.ts`、`exif.ts`、`colors.ts`。
- Web AI：`server/lib/story-ai.ts`、`editor-ai.ts`、`story-ai-prompt.ts`，共享编排仍以 `packages/ai-agent` 为准。

## 6. Desktop 读取索引

### 主程序与远程服务

- Wails 应用生命周期和绑定对象：`desktop/app.go`、`desktop/main.go`。
- 配置：`desktop/config/`。
- Go/GORM 数据库：`desktop/db/`。
- Desktop 本地 SQLite 的版本迁移运行器：`desktop/db/migrate/`；`zine.db`、`drafts.db`、`editor-ai.db` 各自维护独立的 `schema_migrations` 历史，`library.db` 继续使用本地图库专用的 SQL 迁移、备份和资源对账流程。
- 远程 API service：`desktop/services/`；通用代理在 `desktop/services/proxy.go`。
- 上传：`desktop/services/upload.go`、`desktop/frontend/src/pages/UploadPage.tsx`。
- 云端资源库：`desktop/frontend/src/pages/ResourceLibraryPage.tsx`、`CloudLibraryPage.tsx` 与 `features/local-library/` 的对照实现。

### 本地图库

- 核心管理器：`desktop/local_library/manager.go`、`public.go`。
- 数据模型与存储：`types.go`、`store.go`、`organization.go`、`manifest.go`。
- 扫描/对账/文件操作：`reconcile.go`、`operations.go`、`asset_file_operations.go`、`folder_operations.go`。
- 锁与并发：`lock.go`、`path_locks.go`。
- 媒体与派生缓存：`media.go`、`derivative.go`、`desktop/image/`。
- 需求、ADR、验收依据：`docs/requirements/desktop-local-library/`；只读取与当前任务相关的文件。

### Desktop 前端

- 路由和 provider：`desktop/frontend/src/App.tsx`、`contexts/`。
- 页面：`desktop/frontend/src/pages/`。
- 共享管理组件：`desktop/frontend/src/components/admin/`、`components/layout/`。
- 本地图库 feature：`desktop/frontend/src/features/local-library/`。
- API bridge：`desktop/frontend/src/lib/api/`、Wails 生成绑定 `desktop/frontend/wailsjs/`。
- Zine：`components/zine/`、`pages/zine/`、`lib/zine/`、`store/zine.ts`。
- Desktop AI：`lib/api/editor-ai-local.ts`、`lib/api/editor-ai-metadata.ts`、`components/zine/ZineAiAssistant.tsx`；Go 代理在 `desktop/services/editor-ai.go`，会话与消息持久化在配置目录的 `editor-ai.db` SQLite，Zine 和独立 AI 助手通过 `scopeId` 共用 `AiConversation` / `AiMessage` 表。

### Desktop 系统插件

- 产品定位与核心边界、首期规格、验证矩阵和已知问题记录：`docs/plugin-system/`。
- 当前实现仍位于 `desktop/storage_plugins/`，作为系统插件 `storage@1` 能力域的迁移基线；在兼容层完成前不要直接批量重命名目录、Wails API 或 Photo 存储字段。
- GitHub 与 S3 插件源码已迁出主仓库，分别位于 `../mo-gallery-plugin-github/`、`../mo-gallery-plugin-s3/`；插件可由内置官方仓库索引安装，也保留手动导入。
- `desktop/agent_extensions/` 与系统插件共享运行时、凭据、权限和审计需求，但当前仍是独立领域；不要未经 ADR 直接合并 Skill/MCP 协议。

## 7. Mobile 读取索引

- 应用入口、provider、路由、主题：`flutter/lib/main.dart`、`lib/app/`。
- HTTP/API envelope：`flutter/lib/core/api/`。
- 登录和会话：`flutter/lib/core/auth/`、`features/auth/`。
- 本地数据库：`flutter/lib/core/db/app_database.dart`。
- 上传：`flutter/lib/features/upload/`，优先读取 `upload_page.dart`、`upload_worker.dart`、`upload_queue_repository.dart`、`photos_api.dart`。
- 图库和故事：`flutter/lib/features/gallery/`、`features/catalog/`、`features/stories/`。
- 设置：`flutter/lib/features/settings/`。
- 依赖和平台约束：`flutter/pubspec.yaml`、对应 `android/` 或 `ios/` 文件，仅在平台任务中读取。

## 8. 按任务选择最小读取集合

| 任务 | 第一批读取 | 第二批按需读取 |
|---|---|---|
| Web 页面/UI | 目标 `src/app/**/page.tsx`、相关组件 | `contexts/`、`src/lib/i18n/`、CSS、邻近测试 |
| Web API | `src/app/api/[[...route]]/route.ts`、`hono/index.ts`、目标 `hono/*.ts` | `hono/middleware/`、`server/lib/`、API 客户端、测试 |
| 数据库/模型 | `prisma/schema.prisma`、目标 migration、`server/lib/db.ts` | 目标查询、Hono route、seed、测试 |
| Web 上传/媒体 | `hono/photos.ts`、`server/lib/photo-upload-assets.ts`、`image-processing.ts` | storage provider、前端上传组件、EXIF/压缩工具 |
| Desktop 云端功能 | 目标 `desktop/frontend/src/pages/`、对应 `desktop/services/*.go` | `desktop/app.go`、`lib/api/`、Wails bindings、测试 |
| Desktop 本地图库 | 对应 `features/local-library/`、`desktop/local_library/public.go`、`manager.go` | `types.go`、`store.go`、操作/锁/媒体实现、相关 ADR/测试 |
| Desktop 系统插件 | `docs/plugin-system/`、`desktop/storage_plugins/` | 对应 capability broker、SDK、Settings 插件入口、验证矩阵 |
| TipTap/故事博客编辑 | `packages/tiptap-editor/src/index.ts`、`NarrativeTipTapEditor.tsx`、目标宿主 wrapper | `runtime.ts`、extensions、宿主草稿/保存、requirements ADR |
| Zine | 目标页面/组件、`desktop/frontend/src/lib/zine/`、`store/zine.ts` | 导出器、AI host、相关单元测试、Zine 需求文档 |
| AI 编辑 | `packages/ai-agent/README.md`、相关 `src/` 文件、目标 host | Web/Go bridge、metadata persistence、测试 |
| Mobile 上传 | `flutter/lib/features/upload/`、`core/api/`、`core/db/` | auth/session、router、平台工程、测试 |
| 发布/构建 | 根 `package.json`、`pnpm-workspace.yaml`、`desktop/frontend/package.json`、`flutter/pubspec.yaml` | Docker、Vercel、Wails build、GitHub workflow |

## 9. 验证命令

根据改动范围选择，不要无条件运行全部命令：

```bash
# Web 基线
pnpm run lint
pnpm run build

# Web AI/API 聚焦测试
pnpm run test:editor-ai-routes
pnpm run test:editor-ai-images

# Desktop 前端
cd desktop/frontend && npm run build
cd desktop/frontend && npm run test:zine

# Go Desktop
cd desktop && go test ./...

# Flutter
cd flutter && flutter analyze
cd flutter && flutter test
```

仓库现有约定把 `lint` 和成功构建作为 Web 最低基线；Desktop 前端改动至少构建，Go 或 Flutter 改动应运行对应语言的聚焦检查。

## 10. 稳定约束与常见误区

- TypeScript 使用 strict；优先 `unknown` 而非 `any`；2 空格缩进；组件 PascalCase，函数/变量 camelCase。
- Client Component 需要 `'use client'`；服务端模块需要 `server-only`。
- TipTap 编辑器逻辑只能在 `packages/tiptap-editor` 维护，Web/Desktop wrapper 只注入宿主 runtime，不要复制实现。
- AI prompt 和领域编排只能优先扩展 `packages/ai-agent`；Go 侧负责代理、密钥注入和宿主持久化，不负责 prompt 设计。
- 本地图库和云端图库具有不同数据所有权、删除/恢复和缓存语义，修改前必须确认当前边界。
- UI 状态（折叠、选中项、布局）若已有持久化约定，应先搜索现有 preference/store，再新增状态。
- 不要把 `.env` 中的密钥提交到仓库；配置需求变化时只更新 `.env.example`。
- 现有工作树可能包含未提交功能改动；修改前先检查 `git status`，不要覆盖或回滚用户改动。

## 11. 进一步文档导航

- 总体产品和运行方式：`README.md`、`README_EN.md`、`SETUP.md`、`RELEASE.md`
- Agent/仓库约定：`AGENTS.md`、`CLAUDE.md`
- 需求与架构决策：`docs/requirements/**`、`docs/adr/**`
- 领域术语：`docs/glossary/**`
- 设计/实施历史：`docs/superpowers/**`
- Desktop 设计语言：`desktop/DESIGN.md`
- 回归脚本：`scripts/`

## 12. 文档维护规则

以下情况更新本文件：

- 新增或删除顶层应用、共享包、核心 API 边界；
- 目录入口、构建命令或数据所有权发生变化；
- 发现任务索引指向错误文件；
- 完成跨端架构调整或重要 ADR。

不要因为普通组件新增、局部样式调整或单个 bug 修复就扩写本文件。

## 13. Shared API Client

- `packages/api-client/` contains the shared Web/Desktop HTTP API client, DTOs, endpoint modules, and request envelope/error handling.
- `src/lib/api/` and `desktop/frontend/src/lib/api/` are compatibility entrypoints that re-export the package and configure platform runtime hooks.
- Keep platform-specific authentication notifications, cache invalidation, local AI, and upload transport in the corresponding app adapter; keep endpoint paths and shared request/response contracts in `packages/api-client/`.

## 14. Desktop Plugin Core

- `desktop/plugin_core/` contains the system-level protocol version, contribution model, and capability broker.
- `desktop/storage_plugins/` remains the compatibility implementation for the `storage@1` capability domain; do not move object/photo semantics into the core package.
- Desktop Wails exposes system-plugin management names alongside the legacy storage-plugin methods during migration.
