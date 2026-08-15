<div align="center">

# MO Gallery

**面向摄影展示、内容创作与跨端照片管理的一体化平台**

MO Gallery 由 **Next.js Web 站点**、**Wails Desktop 工作台**和 **Flutter Mobile 客户端**组成，覆盖公开展示、云端内容管理、本地照片资源库、移动上传、故事与博客编辑、胶卷归档、Zine 排版及 AI 辅助创作。

<a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
[![Version](https://img.shields.io/badge/version-0.7.0--beta-2563eb?style=flat-square)](RELEASE.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react)](https://react.dev/)
[![Wails](https://img.shields.io/badge/Wails-2-cb2d3e?style=flat-square)](https://wails.io/)
[![Flutter](https://img.shields.io/badge/Flutter-Android--first-02569b?style=flat-square&logo=flutter)](https://flutter.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](#许可证)

[中文](README.md) · [English](README_EN.md) · [更新日志](RELEASE.md) · [Releases](https://github.com/ushaio/mo-gallery-web/releases)

</div>

---

## 项目概览

MO Gallery 不只是一个摄影作品网站，而是一套围绕摄影内容建立的跨端工作流：

| 模块 | 定位 | 主要能力 |
|------|------|----------|
| **Web 公开站点** | 摄影作品与叙事内容展示 | 首页、图库、精选、相册、胶卷、故事、博客、友链、评论、多语言和主题切换 |
| **Web 管理后台** | 浏览器内的云端内容管理 | 统一资源库、上传、相册与胶卷、故事与博客编辑、存储整理、评论与登录配置、系统设置 |
| **Desktop 工作台** | 云端管理与本地照片工作流 | 云端/本地资源库、批量上传、本地文件组织、照片日志、Zine、AI 助手、缓存与存储管理 |
| **Mobile 客户端** | Android-first 移动采集与浏览 | 安全登录、照片选择与预览、后台上传队列、图库浏览、故事阅读、连接设置 |
| **API 与数据层** | 多端共享业务接口 | Hono API、Prisma、PostgreSQL、JWT、Linux DO OAuth、统一媒体与内容接口 |
| **存储层** | 可切换的云端媒体存储 | 本地文件系统、S3 兼容对象存储、Cloudflare R2、GitHub 仓库 |

当前版本为 `v0.7.0-beta`。Web 支持 Vercel、Docker 和 Node.js 自托管；Desktop 当前重点支持 Windows；Mobile 以 Android 为主要目标平台。

---

## 界面预览

### Web

> Web 端新界面截图待补充。

### Desktop

以下截图展示 Desktop 的主要工作区，界面可能随 Beta 版本持续调整。

| 登录页 | 概览 |
|:------:|:----:|
| <img src="./README.assets/image-20260706144644323.png" alt="登录页" width="100%" /> | <img src="./README.assets/image-20260706144716752.png" alt="概览" width="100%" /> |

| 照片库 | 相册管理 |
|:------:|:--------:|
| <img src="./README.assets/image-20260706144824799.png" alt="照片库" width="100%" /> | <img src="./README.assets/image-20260706144840239.png" alt="相册管理" width="100%" /> |

| 胶卷管理 | 图片上传 |
|:--------:|:--------:|
| <img src="./README.assets/image-20260706144908173.png" alt="胶卷管理" width="100%" /> | <img src="./README.assets/image-20260706144919453.png" alt="图片上传" width="100%" /> |

| 照片日志 | Zine |
|:--------:|:----:|
| <img src="./README.assets/image-20260706144944795.png" alt="照片日志" width="100%" /> | <img src="./README.assets/image-20260706144953907.png" alt="Zine" width="100%" /> |

| Zine 编辑 | AI 对话 |
|:---------:|:-------:|
| <img src="./README.assets/image-20260706145001773.png" alt="Zine 编辑" width="100%" /> | <img src="./README.assets/image-20260706145011594.png" alt="AI 对话" width="100%" /> |

| 存储整理 | 系统配置 |
|:--------:|:--------:|
| <img src="./README.assets/image-20260706145024281.png" alt="存储整理" width="100%" /> | <img src="./README.assets/image-20260706145052073.png" alt="系统配置" width="100%" /> |

<p align="center"><strong>友链管理</strong></p>
<p align="center"><img src="./README.assets/image-20260706145108246.png" alt="友链管理" width="72%" /></p>

---

## 核心能力

### 统一资源库

Web 与 Desktop 都以资源库作为照片管理的主要入口：

- 在同一工作区管理照片、相册和胶卷，减少模块之间的来回跳转。
- 支持列表、宫格、瀑布流和时间线等不同浏览方式。
- 支持搜索、分类、类型、可见性、精选状态和存储来源筛选。
- 通过详情侧栏查看和编辑标题、分类、描述、EXIF、拍摄位置及关联信息。
- 支持批量操作、照片预览、相册组织、胶卷帧排序和资源状态同步。
- Desktop 可在云端资源与本地资源之间切换，并保持相近的交互结构。

### Desktop 本地照片资源库

Desktop 提供独立于云端图库的本地照片管理能力：

- 创建、打开和切换多个本地图库工作区。
- 扫描与导入本地文件，使用 SQLite 保存索引、组织信息和图库状态。
- 使用物理文件夹、逻辑集合和标签组织照片。
- 支持搜索、筛选、排序、批量选择和大规模图库浏览。
- 支持重命名、移动、删除、恢复、缺失文件处理和外部文件变更协调。
- 生成缩略图与预览缓存，并提供缓存查看和清理能力。
- 支持手动备份、自动备份、恢复及数据库完整性检查。
- 针对 RAW、JPEG、PNG、GIF、AVIF 等格式提供分级预览与原图访问策略。

本地资源库保存的是本机图库索引和组织信息，不会自动等同于 Web 云端图库。需要发布到站点的照片可通过 Desktop 上传工作流进入云端。

### 照片、相册与胶卷

- 自动提取相机、镜头、光圈、快门、ISO、拍摄时间和 GPS 等 EXIF 信息。
- 提取图片主色，用于加载占位和界面视觉反馈。
- 支持相册封面、照片关联、排序及公开展示。
- 支持 `135` 与 `120` 胶卷格式、胶片预设、元数据、帧数和照片排序。
- 支持数码与胶片上传模式、批量拖拽、压缩、进度展示、失败重试和目标选择。
- 使用文件哈希辅助重复检测，并支持照片公开、精选和分类管理。
- 云端媒体可以保存在 Local、S3、R2 或 GitHub 存储源中。

### 故事、博客与渐进式编辑器

- 使用 TipTap 3 构建共享的故事和博客编辑体验。
- 支持标题、段落、列表、引用、代码、链接、表格、图片、图片组和媒体嵌入。
- 提供渐进式块编辑交互、上下文工具栏、颜色与格式菜单。
- 支持从图库插入照片、封面裁切、故事内照片排序和 MapLibre 故事地图。
- 通过 IndexedDB 保存 Web/Desktop 编辑草稿，降低意外退出造成的内容丢失。
- Web 与 Desktop 复用 `packages/tiptap-editor`，减少编辑格式和渲染结果差异。

### Zine 编辑器

Desktop 内置摄影 Zine 工作流：

- 创建和管理 Zine 项目，选择页面尺寸与模板。
- 使用跨页画布、页面缩略图和照片托盘完成排版。
- 支持图片槽位、文字槽位、移动、缩放、裁切和直接编辑。
- 提供撤销/重做、编辑历史、保存状态和图片加载状态处理。
- 支持从云端资源库或本地文件导入照片。
- 提供打印/PDF 导出链路及 AI 辅助排版能力。

### AI 辅助创作

- 支持 OpenAI 兼容 API，可连接 OpenAI、DeepSeek 或其他兼容服务。
- 支持自定义服务地址、API Key、模型、上下文窗口和模型能力配置。
- 提供多轮对话、图片输入、内容建议、差异预览和受控直接编辑。
- 对视觉、工具调用和结构化输出能力采用显式模型白名单。
- Web 与 Desktop 共享 `packages/ai-agent` 中的领域模型、执行流程和提示词能力。
- AI 配置为可选功能；未配置 AI 服务时，其余图库与内容功能仍可使用。

### Mobile 移动客户端

Flutter 客户端面向移动采集和轻量浏览：

- 连接 MO Gallery 服务端并保存安全会话。
- 支持管理员登录路径门禁，与 Web/Desktop 使用相同认证规则。
- 从系统图库选择照片，预览并设置上传目标。
- 维护本地上传队列，支持任务恢复、状态追踪和错误提示。
- 浏览云端图库、照片详情、故事列表和故事详情。
- 使用 Riverpod 管理状态、GoRouter 管理多标签导航、SQLite 保存本地队列数据。

Mobile 当前以 Android 为主要开发和发布目标；仓库保留 iOS 工程结构，但实际发布状态以 Release 说明为准。

### 评论、认证与社交

- 评论可使用本地 PostgreSQL 数据库或 Waline/LeanCloud。
- 支持 Linux DO OAuth 登录、用户信息展示和评论访问控制。
- 管理员使用账号密码或允许的 Linux DO 账号登录，并通过 JWT 访问管理 API。
- 可配置隐藏管理员登录路径；Desktop 和 Mobile 连接时必须使用对应的完整登录地址。
- 支持友链展示、管理和排序。

---

## 技术架构

```text
 Public Web / Web Admin             Desktop (Wails)               Mobile (Flutter)
 Next.js 16 + React 19              React 19 + Go                  Riverpod + GoRouter
            │                             │                              │
            ├──────────── HTTP / JWT ─────┼──────── HTTP / JWT ─────────┤
            │                             │                              │
            ▼                             ├── Local Library Manager      └── Local SQLite Queue
      Hono API Routes                     │   SQLite index/cache
            │                             │   local file operations
            ▼                             │
    Prisma 7 + PostgreSQL                 └── Optional direct DB/service access
            │
            ▼
 Local / S3-compatible / R2 / GitHub Storage

 Shared packages:
 packages/tiptap-editor · packages/ai-agent
```

### 数据边界

- **云端业务数据**：照片、相册、胶卷、故事、博客、评论和设置保存在 PostgreSQL。
- **云端媒体文件**：由配置的 Local、S3、R2 或 GitHub 存储提供者保存。
- **Desktop 本地图库**：原图保留在用户选择的本地图库目录，SQLite 保存索引与组织数据。
- **Mobile 本地数据**：安全会话、上传队列和必要缓存保存在设备本地，业务数据通过 API 同步。

### 技术栈

| 分类 | 技术 |
|------|------|
| Web | Next.js 16、React 19、App Router、React Compiler |
| Web API | Hono.js、Next.js Route Handler、Zod |
| Web 数据库 | PostgreSQL 16、Prisma 7 |
| Desktop | Wails 2、Go、React 19、Vite 6、GORM |
| Desktop 本地图库 | Go、SQLite、本地文件系统、缩略图/预览缓存 |
| Mobile | Flutter、Dart、Riverpod、GoRouter、Dio、SQLite |
| 样式与交互 | Tailwind CSS 4、Framer Motion、Lucide Icons |
| 内容编辑 | TipTap 3、React Markdown、Shiki |
| 图片处理 | Sharp、ExifReader、JS/WASM 压缩、Desktop Go 图像处理 |
| 地图 | MapLibre GL、react-map-gl |
| 认证 | JWT、Linux DO OAuth |
| 存储 | Local、S3-compatible、Cloudflare R2、GitHub |

---

## 快速开始

### 环境要求

| 工具 | 建议版本 | 用途 |
|------|----------|------|
| Node.js | 24.x | Web、共享包和 Desktop 前端 |
| pnpm | 10.x | JavaScript Monorepo 依赖管理 |
| PostgreSQL | 16.x | Web 云端数据库 |
| Go | 1.24.x | Desktop 后端开发 |
| Wails CLI | 2.12.0 | Desktop 开发与构建 |
| Flutter SDK | Dart `>=3.5.0 <4.0.0` 对应版本 | Mobile 开发 |
| Android Studio / Android SDK | 当前稳定版 | Android 调试与构建 |

### 1. 获取项目

```bash
git clone https://github.com/ushaio/mo-gallery-web.git
cd mo-gallery-web
pnpm install
```

`pnpm-workspace.yaml` 会同时管理根 Web 应用、`desktop/frontend` 和 `packages/*`。

### 2. 配置 Web 环境变量

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

至少需要配置数据库、管理员账号和 JWT 密钥：

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
DIRECT_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="replace-with-a-strong-password"
JWT_SECRET="replace-with-a-long-random-secret"
```

完整配置见 [`.env.example`](.env.example)。

### 3. 初始化数据库并启动 Web

```bash
pnpm run prisma:generate
pnpm run prisma:dev
pnpm run prisma:seed
pnpm run dev
```

默认地址：

- 公开站点：`http://localhost:3000`
- 未配置安全后缀时的管理员登录：`http://localhost:3000/login`
- 配置安全后缀后的管理员登录：`http://localhost:3000/login/{ADMIN_LOGIN_URL}`

修改管理员登录后缀会使旧管理员会话失效。Desktop 和 Mobile 连接服务端时，也需要填写包含 `/login/{ADMIN_LOGIN_URL}` 的完整地址。

### 4. 启动 Desktop

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
cd desktop
wails dev
```

开发时建议使用独立配置，避免覆盖正式 Desktop 配置：

```bash
wails dev -appargs "-config %APPDATA%\mo-gallery-desktop\config.dev.json"
```

Desktop 可在设置页维护 Web API、数据库、JWT、存储、AI、本地缓存和窗口外观配置。若 Desktop 与 Web 共用认证，Desktop 的 `api.jwt_secret` 必须与 Web 的 `JWT_SECRET` 一致。

### 5. 启动 Mobile

```bash
cd flutter
flutter pub get
flutter run
```

连接服务端时，在应用中填写 Web 管理员登录地址。Android 模拟器访问宿主机服务时，通常需要使用 `10.0.2.2` 替代 `localhost`。

---

## Desktop 构建与配置

### 本地构建

```bash
cd desktop

# 当前主机平台的 Portable 构建
wails build

# Windows NSIS 安装包（仅 Windows）
wails build -nsis

# 指定 Wails 目标平台
wails build -platform windows/amd64
wails build -platform darwin/arm64
wails build -platform linux/amd64 -tags webkit2_41
```

构建产物位于 `desktop/build/bin/`。Desktop 前端资源通过 Go `embed` 内置到可执行文件中，不需要额外携带前端静态目录。

### Release 自动产物

GitHub Release 会使用原生 runner 构建 Wails 支持的桌面目标：

- Windows AMD64/ARM64/x86：Portable EXE 与 NSIS Setup 安装包
- macOS AMD64/ARM64/Universal：`.zip`、`.dmg`、`.pkg`
- Linux AMD64/ARM64：`.tar.gz`、`.deb`、`.rpm`、`.AppImage`

NSIS 是 Windows 专用安装器格式；macOS DMG/PKG 和 Linux 包由 Release workflow 在原生 runner 上生成。Linux 用户仍需要系统提供 GTK3/WebKitGTK 运行库。

| 发布方式 | 适用场景 | 特点 |
|----------|----------|------|
| **Portable** | Beta 测试、内部使用、无管理员权限环境 | 下载后直接运行，更新时替换 EXE |
| **Setup** | Windows 稳定发布、普通用户、需要系统集成 | 提供安装路径、快捷方式和卸载入口 |
| **macOS/Linux archive** | macOS/Linux 用户 | 解压后运行平台对应的 `.app` 或可执行文件 |

### Desktop 配置目录

| 系统 | 默认路径 |
|------|----------|
| Windows | `%APPDATA%\mo-gallery-desktop\config.json` |
| macOS | `~/Library/Application Support/mo-gallery-desktop/config.json` |
| Linux | `~/.config/mo-gallery-desktop/config.json` |

Portable 版本不会把配置保存在 EXE 旁边。删除或替换 EXE 后，用户配置和本地图库数据不会自动删除。

---

## 配置说明

### 必需配置

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | Web 运行时 PostgreSQL 连接地址 |
| `DIRECT_URL` | Prisma 迁移使用的数据库直连地址 |
| `ADMIN_USERNAME` | 默认管理员用户名 |
| `ADMIN_PASSWORD` | 默认管理员密码，生产环境必须修改 |
| `JWT_SECRET` | JWT 签名密钥，生产环境必须使用高强度随机字符串 |

### 站点与安全

| 变量 | 说明 | 默认/示例 |
|------|------|-----------|
| `ADMIN_LOGIN_URL` | 管理员登录安全后缀；留空时从 `/login` 登录 | 留空 |
| `NEXT_PUBLIC_ADMIN_LOGIN_URL` | 旧部署兼容项；服务端配置缺失时作为回退 | 留空 |
| `SITE_TITLE` | 站点标题 | `MO GALLERY` |
| `SITE_URL` | 服务端使用的公开站点地址 | `https://your-domain.com` |
| `NEXT_PUBLIC_SITE_URL` | 浏览器使用的公开站点地址 | `https://your-domain.com` |
| `SITE_AUTHOR` | 首页显示的作者名称 | `MO` |
| `CDN_DOMAIN` | 媒体 CDN 域名 | 留空 |
| `API_ORIGIN_CHECK` | 是否限制 API 请求来源 | `false` |

### AI 编辑器

| 变量 | 说明 |
|------|------|
| `AI_BASE_URL` | OpenAI 兼容 API 根地址 |
| `AI_API_KEY` | AI 服务密钥 |
| `AI_MODEL` | 默认模型 |
| `AI_VISION_MODELS` | 允许图片输入的模型 ID，逗号分隔 |
| `AI_TOOL_MODELS` | 允许工具调用的模型 ID，逗号分隔 |
| `AI_STRUCTURED_OUTPUT_MODELS` | 允许结构化输出的模型 ID，逗号分隔 |
| `AI_MODEL_CONTEXT_WINDOWS` | 模型上下文窗口配置，JSON 对象 |

### 评论与 Linux DO OAuth

| 变量 | 说明 |
|------|------|
| `COMMENTS_STORAGE` | `LOCAL`、留空，或 `LEANCLOUD` |
| `WALINE_SERVER_URL` | Waline 服务地址 |
| `LEAN_ID` / `LEAN_KEY` / `LEAN_MASTER_KEY` | LeanCloud 应用凭证 |
| `LINUXDO_CLIENT_ID` / `LINUXDO_CLIENT_SECRET` | Linux DO OAuth 凭证 |
| `LINUXDO_REDIRECT_URI` | OAuth 回调地址 |
| `LINUXDO_ADMIN_USERNAMES` | 允许成为管理员的 Linux DO 用户名，逗号分隔 |
| `LINUXDO_COMMENTS_ONLY` | 是否仅允许 Linux DO 用户评论 |

---

## 部署

### Docker Compose

Docker Compose 会启动 PostgreSQL 和 MO Gallery，并持久化数据库与本地上传目录。

```bash
cp .env.example .env
# 修改 POSTGRES_PASSWORD、ADMIN_PASSWORD、JWT_SECRET 等生产配置

docker compose up -d --build
docker compose logs -f
```

默认地址：

- Web：`http://localhost:3001`
- PostgreSQL：`localhost:5433`

可通过 `.env` 中的 `APP_PORT` 和 `DB_PORT` 修改外部端口。

### Vercel

1. Fork 本仓库并导入 Vercel。
2. 配置 `.env.example` 中需要的环境变量。
3. 使用 Neon、Supabase 或其他托管 PostgreSQL。
4. 使用 S3、R2 或 GitHub 存储媒体文件。
5. `vercel.json` 会执行 Prisma 部署、客户端生成和 Next.js 构建。

Vercel 运行文件系统不适合持久化用户上传，生产环境不要使用 Local 云端存储后端。

### Node.js 自托管

```bash
pnpm run build:node
pnpm run start
```

生产环境还应配置反向代理、HTTPS、进程守护、数据库备份和媒体存储备份。

---

## 常用命令

### Web 与共享包

| 命令 | 说明 |
|------|------|
| `pnpm run dev` | 启动 Next.js 开发服务器 |
| `pnpm run build` | 构建 Web 生产版本 |
| `pnpm run build:vercel` | Prisma 部署、生成、种子数据和 Vercel 构建 |
| `pnpm run build:node` | Prisma 部署、生成和 Node.js 自托管构建 |
| `pnpm run start` | 启动 Web 生产服务器 |
| `pnpm run lint` | 运行 ESLint |
| `pnpm run test:editor-ai-routes` | 测试编辑器 AI API 路由 |
| `pnpm run test:editor-ai-images` | 测试编辑器 AI 图片处理 |
| `pnpm run prisma:generate` | 生成 Prisma Client |
| `pnpm run prisma:dev` | 创建并应用开发迁移 |
| `pnpm run prisma:deploy` | 应用生产迁移 |
| `pnpm run prisma:seed` | 写入种子数据 |

### Desktop

| 命令 | 说明 |
|------|------|
| `cd desktop && wails dev` | 启动 Desktop 开发模式 |
| `cd desktop && wails build` | 构建当前主机平台的 Desktop Portable 包 |
| `cd desktop && wails build -nsis` | 构建 Windows Desktop NSIS 安装包 |
| `cd desktop && wails build -platform <os>/<arch>` | 构建指定 Wails 平台/架构 |
| `cd desktop && wails build -platform linux/amd64 -tags webkit2_41` | 构建 Linux AMD64 包 |
| `cd desktop/frontend && pnpm build` | 单独验证 Desktop 前端构建 |
| `cd desktop/frontend && pnpm test:zine` | 运行 Zine 编辑器测试 |
| `cd desktop && go test ./...` | 运行 Desktop Go 测试和本地资源库测试 |

### Mobile

| 命令 | 说明 |
|------|------|
| `cd flutter && flutter pub get` | 安装 Flutter 依赖 |
| `cd flutter && flutter run` | 启动 Mobile 调试 |
| `cd flutter && flutter analyze` | 运行 Dart 静态分析 |
| `cd flutter && flutter test` | 运行 Mobile 测试 |
| `cd flutter && flutter build apk` | 构建 Android APK |

---

## 项目结构

```text
mo-gallery-web/
├── src/app/                       # Next.js App Router、公开页面与 Web 管理后台
├── src/components/                # Web 页面组件、图库和管理组件
├── src/lib/                       # API 客户端、i18n、草稿和内容工具
├── hono/                          # Hono API 路由与认证中间件
├── server/                        # 查询、存储、EXIF、AI 和服务端基础设施
├── prisma/                        # Prisma Schema、迁移与种子脚本
├── packages/
│   ├── ai-agent/                  # Web/Desktop 共用 AI Agent
│   └── tiptap-editor/             # Web/Desktop 共用 TipTap 编辑器
├── desktop/                       # Go + Wails Desktop
│   ├── frontend/                  # React/Vite 桌面前端
│   ├── local_library/             # 本地图库、SQLite、文件操作、缓存和备份
│   ├── services/                  # 云端内容、上传、存储和导出服务
│   ├── config/                    # Desktop 配置管理
│   ├── db/                        # GORM 数据访问与模型
│   └── build/                     # 图标、平台清单和构建产物
├── flutter/                       # Flutter Mobile 客户端
│   ├── lib/features/              # 登录、上传、图库、故事和设置
│   ├── lib/core/                  # API、认证、SQLite 和文件工具
│   └── test/                      # Mobile 单元测试
├── docs/
│   ├── adr/                       # 架构决策记录
│   ├── requirements/              # 功能规格、领域模型和验证矩阵
│   └── glossary/                  # 领域术语说明
├── tests/                         # Web/API 聚焦测试
├── scripts/                       # 数据修复与回归脚本
├── public/                        # Web 静态资源与本地上传目录
├── README.assets/                 # README 截图
├── docker-compose.yml             # Web + PostgreSQL 编排
├── Dockerfile                     # Web 容器镜像
└── RELEASE.md                     # 版本说明
```

---

## 安全建议

- 不要提交 `.env`、数据库密码、JWT 密钥、AI Key 或对象存储凭证。
- 生产环境必须修改默认管理员密码，并使用高强度 `JWT_SECRET`。
- Desktop 与 Web 共用认证时，确保 JWT 配置一致。
- Desktop 本地图库包含索引、缓存和备份，应与原始照片一起纳入备份策略。
- Mobile 应只连接可信 HTTPS 服务端，不要在正式环境使用明文 HTTP。
- 对公开部署启用 HTTPS，并根据需要开启 `API_ORIGIN_CHECK`。
- 定期备份 PostgreSQL、媒体文件、存储源配置和 Desktop 本地图库。
- 正式分发 Windows Desktop 时建议进行代码签名，减少 SmartScreen 警告。

---

## 常见问题

<details>
<summary><strong>Web 云端资源库与 Desktop 本地资源库有什么区别？</strong></summary>

Web 云端资源库管理已经发布到服务端的照片、相册和胶卷，数据保存在 PostgreSQL 和配置的媒体存储中。Desktop 本地资源库管理用户电脑上的原始文件及本地 SQLite 索引；它可以独立整理照片，再通过上传工作流发布到云端。

</details>

<details>
<summary><strong>为什么 Desktop 下载后可以直接运行？</strong></summary>

`wails build` 默认生成 Portable EXE。React/Vite 前端通过 Go `embed` 打包进可执行文件，Windows 安装 WebView2 Runtime 后即可直接启动。

</details>

<details>
<summary><strong>Portable 和 Setup 应该选择哪一个？</strong></summary>

Beta 测试、内部使用和无管理员权限环境优先选择 Portable；面向普通用户的稳定版本优先选择 Setup。正式发布时可以同时提供两种构建。

</details>

<details>
<summary><strong>为什么 Vercel 不能使用本地存储？</strong></summary>

Vercel 函数文件系统不用于持久化用户上传。请使用 S3、Cloudflare R2、GitHub 或其他外部存储后端。

</details>

<details>
<summary><strong>Mobile 为什么无法访问电脑上的 localhost？</strong></summary>

真机或模拟器中的 `localhost` 指向设备自身。Android 模拟器通常使用 `10.0.2.2` 访问宿主机；真机需要使用电脑在局域网中的 IP，并确保防火墙允许访问。

</details>

---

## 支持项目

如果 MO Gallery 对你有帮助，欢迎通过赞赏支持项目持续开发。

<img src="public/donate_weixin.png" alt="赞赏码" width="320" />

---

## 友情链接

- [LINUX DO](https://linux.do) — 新的理想型社区

---

## 许可证

本项目以 **MIT License** 发布。

---

## Star History

<a href="https://www.star-history.com/?repos=ushaio%2Fmo-gallery-web&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ushaio/mo-gallery-web&type=date&theme=dark&legend=top-left&sealed_token=qu9-MEVV8696GiaTdMhvDBhNScK6ZhwW8caUioDSuVscetrFt1dQthCPFrcPTHCOUqoWTqfwAP8mV3lGTyUDDkfObhTjBJ_Y5iWjBhZytO9z-OUmXVdIVrMTwFI2zZR9aEVxtuBiOdnQem5TdO55JVAxDiveM5-AM8ZjYpjQ_wiOh0rbhaiCtwnIlSgK" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ushaio/mo-gallery-web&type=date&legend=top-left&sealed_token=qu9-MEVV8696GiaTdMhvDBhNScK6ZhwW8caUioDSuVscetrFt1dQthCPFrcPTHCOUqoWTqfwAP8mV3lGTyUDDkfObhTjBJ_Y5iWjBhZytO9z-OUmXVdIVrMTwFI2zZR9aEVxtuBiOdnQem5TdO55JVAxDiveM5-AM8ZjYpjQ_wiOh0rbhaiCtwnIlSgK" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ushaio/mo-gallery-web&type=date&legend=top-left&sealed_token=qu9-MEVV8696GiaTdMhvDBhNScK6ZhwW8caUioDSuVscetrFt1dQthCPFrcPTHCOUqoWTqfwAP8mV3lGTyUDDkfObhTjBJ_Y5iWjBhZytO9z-OUmXVdIVrMTwFI2zZR9aEVxtuBiOdnQem5TdO55JVAxDiveM5-AM8ZjYpjQ_wiOh0rbhaiCtwnIlSgK" />
 </picture>
</a>