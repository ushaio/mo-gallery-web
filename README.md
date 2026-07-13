<div align="center">

# 📸 MO Gallery

**面向摄影作品展示、内容叙事与图库管理的一体化平台**

同时提供 **Next.js Web 站点**与 **Wails Desktop 管理端**，覆盖照片、相册、胶卷、故事、博客、AI 辅助创作、评论和多存储后端。

[![Version](https://img.shields.io/badge/version-0.7.0--beta-2563eb?style=flat-square)](RELEASE.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react)](https://react.dev/)
[![Wails](https://img.shields.io/badge/Wails-2-cb2d3e?style=flat-square)](https://wails.io/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](#-许可证)

[中文](README.md) · [English](README_EN.md) · [更新日志](RELEASE.md) · [Releases](https://github.com/ushaio/mo-gallery-web/releases)

</div>

---

## 📌 项目概览

MO Gallery 将公开摄影站点、后台管理系统和桌面工作台整合在同一个仓库中：

| 模块 | 定位 | 主要能力 |
|------|------|----------|
| **Web 公开站点** | 摄影作品与内容展示 | 图库、精选、相册、胶卷、故事、博客、友链、评论、多语言与主题切换 |
| **Web 管理后台** | 浏览器内内容管理 | 照片上传、相册与胶卷管理、故事编辑、存储整理、评论审核、系统设置和操作日志 |
| **Desktop 管理端** | 原生桌面工作流 | Wails + Go + React，支持图库管理、批量上传、照片日志、Zine、AI 助手和本地文件处理 |
| **API 与数据层** | 统一业务与数据访问 | Hono API、Prisma/GORM、PostgreSQL、JWT、Linux DO OAuth |
| **存储层** | 多后端媒体存储 | 本地文件系统、S3 兼容对象存储、Cloudflare R2、GitHub 仓库 |

> 当前版本为 `v0.7.0-beta`。项目支持 Vercel、Docker 和 Node.js 自托管；Desktop 发布工作流当前构建 Windows 版本。

---

## 🖼️ 界面预览

### Web 端

> Web 端截图待补充。

### Desktop 端

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

| Zine | AI对话 |
|:----:|:------:|
| <img src="./README.assets/image-20260706145001773.png" alt="Zine" width="100%" /> | <img src="./README.assets/image-20260706145011594.png" alt="AI对话" width="100%" /> |

| 存储整理 | 系统配置 |
|:--------:|:--------:|
| <img src="./README.assets/image-20260706145024281.png" alt="存储整理" width="100%" /> | <img src="./README.assets/image-20260706145052073.png" alt="系统配置" width="100%" /> |

<p align="center"><strong>友链管理</strong></p>
<p align="center"><img src="./README.assets/image-20260706145108246.png" alt="友链管理" width="72%" /></p>

---

## ✨ 核心功能

### 📷 照片、相册与胶卷

- **多种图库视图** — 提供宫格、瀑布流和时间线视图，并支持平滑切换。
- **EXIF 信息提取** — 自动提取相机、镜头、光圈、快门、ISO、拍摄时间和 GPS 等参数。
- **主色调提取** — 从图片中提取主色，用于生成更自然的加载占位效果。
- **相册管理** — 将照片组织到相册中，支持封面、详情页和照片排序。
- **胶卷管理** — 模拟胶片卷展示方式，支持胶卷封面、元数据、帧排序和批量添加照片。
- **批量上传** — 支持多图拖拽、压缩、进度展示，并可选择目标相册或胶卷。
- **重复检测** — 使用 SHA-256 哈希进行客户端去重。
- **照片分页与可见性** — 面向大规模图库提供分页、筛选、精选和公开状态管理。
- **响应式展示** — 针对桌面、平板和移动设备优化。

### 📖 故事、博客、照片日志与 Zine

- **故事 / 叙事** — 将多张照片组合成长篇故事，并附加富文本叙事内容。
- **TipTap 富文本编辑器** — 所见即所得编辑，支持图片缩放、表格、对齐和结构化 JSON 内容。
- **故事地图** — 使用 MapLibre GL 展示带有地理位置信息的故事照片。
- **沉浸式写作** — 提供长篇编辑模式、封面选择和故事内照片添加、移除与排序。
- **本地草稿** — 通过 IndexedDB 自动保存故事和博客草稿。
- **博客系统** — 与故事共用编辑器和渲染链路，支持图库照片插入、草稿和发布状态。
- **照片日志** — 在 Desktop 端快速整理日常摄影记录。
- **Zine** — 在 Desktop 端编排摄影刊物，并支持预览与导出工作流。

### 🤖 AI 辅助创作

- 集成 AI 对话与编辑辅助能力，支持多轮会话和上下文管理。
- 支持 OpenAI 兼容 API，可接入 OpenAI、DeepSeek 或其他兼容服务。
- 支持自定义服务地址、API Key、模型和系统提示词。
- 支持多模态图片输入、编辑器内 AI 操作和图片生成工作流。
- Web 与 Desktop 共用 `packages/ai-agent` 和 `packages/tiptap-editor` 中的核心能力。

### 🔐 管理后台与 Desktop 工作台

- **概览面板** — 汇总内容、图库与系统状态。
- **照片管理** — 支持筛选、分页、批量操作、可见性和精选状态管理。
- **相册与胶卷管理** — 创建、编辑、组织照片并调整顺序。
- **上传中心** — 支持数码/胶片上传模式、压缩、重试和进度追踪。
- **存储整理** — 扫描存储状态，检测孤立文件和缺失文件，并管理存储源。
- **系统设置** — 配置站点信息、社交链接、存储后端、AI 服务和 Desktop 连接参数。
- **友链管理** — 添加、编辑、删除和排序友链。
- **评论审核** — 管理待审核、已通过和已拒绝评论。
- **操作日志** — 查看后台关键操作记录。

### 💬 评论、认证与社交

- **双评论后端** — 支持本地数据库评论或 Waline（LeanCloud）。
- **Linux DO OAuth** — 支持 Linux DO 用户登录、用户名和信任等级展示。
- **评论访问控制** — 可选择仅允许 Linux DO 用户评论。
- **管理员认证** — 使用账号密码、JWT 和可配置的隐藏登录路径。
- **友链页面** — 展示朋友及其网站，支持头像、描述和卡片式布局。

### 🎨 展示体验

- **动态首页** — 从图库随机展示英雄图片，并提供粒子背景、自动轮播和滚动动画。
- **国际化** — 内置中文和英文界面，通过客户端 i18n 字典管理。
- **主题切换** — 支持深色、浅色和跟随系统，并保持组件视觉一致。
- **多存储后端** — 支持本地、S3 兼容对象存储、Cloudflare R2 和 GitHub 存储，并可在后台管理存储源。

---

## 🧱 技术架构

```text
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ Web：Next.js + React         │       │ Desktop：Wails + Go + React │
│ 公开站点 / 管理后台          │       │ 原生窗口 / 本地文件工作流    │
└──────────────┬───────────────┘       └──────────────┬───────────────┘
               │                                      │
               ▼                                      ├── GORM 直连 PostgreSQL
        Hono API / JWT                                └── HTTP 调用 Web API
               │
               ▼
       Prisma 7 / PostgreSQL
               │
               ▼
   Local / S3 / R2 / GitHub Storage

共享包：packages/tiptap-editor · packages/ai-agent
```

### 技术栈

| 分类 | 技术 |
|------|------|
| Web 框架 | Next.js 16、React 19、App Router、React Compiler |
| Desktop | Wails 2、Go 1.24、React 19、Vite 6、GORM |
| API | Hono.js，嵌入 Next.js Route Handler |
| 数据库 | PostgreSQL 16、Prisma 7 |
| 样式与动画 | Tailwind CSS 4、Framer Motion |
| 编辑器 | TipTap 3、共享编辑器包 |
| 图片处理 | Sharp、ExifReader、JS/WASM 图片压缩 |
| 地图 | MapLibre GL、react-map-gl |
| 认证 | JWT、Linux DO OAuth |
| 状态管理 | React Context、Zustand、IndexedDB |
| 存储 | Local、S3、Cloudflare R2、GitHub |

---

## 🚀 快速开始

### 环境要求

| 工具 | 建议版本 | 用途 |
|------|----------|------|
| Node.js | 24.x | 与 CI 构建环境保持一致 |
| pnpm | 10.x | Monorepo 依赖管理 |
| PostgreSQL | 16.x | Web 与 Desktop 数据库 |
| Go | 1.24.x | 仅 Desktop 开发需要 |
| Wails CLI | 2.12.0 | 仅 Desktop 开发和构建需要 |

### 1. 获取项目

```bash
git clone https://github.com/ushaio/mo-gallery-web.git
cd mo-gallery-web
pnpm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

至少需要设置数据库、管理员账号和 JWT 密钥：

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
DIRECT_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="replace-with-a-strong-password"
JWT_SECRET="replace-with-a-long-random-secret"
```

### 3. 初始化数据库并启动 Web

```bash
pnpm run prisma:generate
pnpm run prisma:dev
pnpm run prisma:seed
pnpm run dev
```

打开以下地址：

- 公开站点：`http://localhost:3000`
- 未配置安全后缀时的管理员登录：`http://localhost:3000/login`
- 配置安全后缀后的管理员登录：`http://localhost:3000/login/{ADMIN_LOGIN_URL}`

Desktop 和 Flutter 连接管理员 API 时遵循相同门禁。配置安全后缀后，客户端必须填写完整的 `/login/{ADMIN_LOGIN_URL}` 地址；只填写站点根地址会被拒绝。修改安全后缀会立即使旧管理员会话失效。

### 4. 启动 Desktop 开发模式

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
cd desktop
wails dev
```

Desktop 的数据库、Web API、JWT、存储和 AI 配置可在应用设置中维护。Desktop 与 Web 使用同一个 JWT 密钥时，`desktop` 配置中的 `api.jwt_secret` 必须与 Web 的 `JWT_SECRET` 一致。

---

## 🖥️ Desktop 构建与分发

### Windows 构建

```bash
cd desktop

# 免安装版：生成可直接运行的 EXE
wails build

# 安装版：生成带安装向导的 NSIS 安装程序
wails build -nsis
```

构建产物位于 `desktop/build/bin/`。

| 发布方式 | 适用场景 | 特点 |
|----------|----------|------|
| **Portable / 免安装版** | Beta 测试、内部使用、临时使用、无管理员权限环境 | 下载后直接运行；更新时手动替换 EXE；不自动创建开始菜单和卸载入口 |
| **Setup / 安装版** | 稳定发布、普通用户、频繁更新、需要系统集成 | 支持安装路径、快捷方式、卸载入口，并可在安装阶段处理 WebView2 等依赖 |

当前 GitHub Release 工作流执行 `wails build`，默认发布免安装 EXE。Desktop 前端资源通过 Go `embed` 内置到可执行文件中，因此不需要额外携带静态资源目录。

### Desktop 配置目录

| 系统 | 默认路径 |
|------|----------|
| Windows | `%APPDATA%\mo-gallery-desktop\config.json` |
| macOS | `~/Library/Application Support/mo-gallery-desktop/config.json` |
| Linux | `~/.config/mo-gallery-desktop/config.json` |

当前 Portable 版本属于“免安装应用”，但不是完全无痕的绿色软件：移动或替换 EXE 后配置仍会保留，删除 EXE 也不会自动删除配置目录。Beta 阶段建议优先提供 Portable；稳定版本建议以 Setup 为默认下载，同时保留 Portable 供高级用户选择。

---

## ⚙️ 配置说明

完整示例见 [`.env.example`](.env.example)。

### 必需配置

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 运行时连接地址 |
| `DIRECT_URL` | Prisma 迁移使用的直连地址 |
| `ADMIN_USERNAME` | 默认管理员用户名 |
| `ADMIN_PASSWORD` | 默认管理员密码，生产环境必须修改 |
| `JWT_SECRET` | JWT 签名密钥，生产环境必须使用高强度随机字符串 |

### 站点与安全

| 变量 | 说明 | 默认/示例 |
|------|------|-----------|
| `ADMIN_LOGIN_URL` | 服务端管理员登录安全后缀；留空时从 `/login` 登录 | 留空 |
| `NEXT_PUBLIC_ADMIN_LOGIN_URL` | 旧部署兼容项；未设置 `ADMIN_LOGIN_URL` 时作为回退值 | 留空 |
| `SITE_TITLE` | 站点标题 | `MO GALLERY` |
| `SITE_URL` | 服务端使用的公开站点地址 | `https://your-domain.com` |
| `NEXT_PUBLIC_SITE_URL` | 浏览器可访问的公开站点地址 | `https://your-domain.com` |
| `SITE_AUTHOR` | 首页显示的作者名称 | `MO` |
| `CDN_DOMAIN` | 媒体 CDN 域名 | 留空 |
| `API_ORIGIN_CHECK` | 是否限制 API 请求来源 | `false` |

### AI 编辑器

| 变量 | 说明 |
|------|------|
| `AI_BASE_URL` | OpenAI 兼容 API 根地址，例如 `https://api.openai.com/v1` |
| `AI_API_KEY` | AI 服务密钥 |
| `AI_MODEL` | 默认聊天或编辑模型 |

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

## 📦 部署

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
4. 使用 S3/R2 或 GitHub 存储媒体文件。
5. `vercel.json` 会执行 Prisma 部署、客户端生成和 Next.js 构建。

> Vercel 的运行文件系统不适合持久化本地上传，请勿在生产环境使用 Local 存储后端。

### Node.js / 自托管

```bash
pnpm run build:node
pnpm run start
```

反向代理、HTTPS、进程守护和备份策略请根据部署环境自行配置。

---

## 🧰 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm run dev` | 启动 Next.js 开发服务器 |
| `pnpm run build` | 构建 Web 生产版本 |
| `pnpm run build:vercel` | 执行 Prisma 部署、生成、种子数据和 Vercel 构建 |
| `pnpm run build:node` | 执行 Prisma 部署、生成并构建自托管版本 |
| `pnpm run start` | 启动 Web 生产服务器 |
| `pnpm run lint` | 运行 ESLint |
| `pnpm run prisma:generate` | 生成 Prisma Client |
| `pnpm run prisma:dev` | 创建并应用开发迁移 |
| `pnpm run prisma:deploy` | 应用生产迁移 |
| `pnpm run prisma:seed` | 写入种子数据 |
| `cd desktop && wails dev` | 启动 Desktop 开发模式 |
| `cd desktop && wails build` | 构建 Desktop Portable EXE |
| `cd desktop && wails build -nsis` | 构建 Desktop NSIS 安装包 |
| `cd desktop/frontend && pnpm build` | 单独验证 Desktop 前端构建 |

基础验证要求：

```bash
pnpm run lint
pnpm run build
cd desktop/frontend && pnpm build
```

---

## 📁 项目结构

```text
mo-gallery-web/
├── src/app/                   # Next.js App Router、公开页面与管理后台
├── src/components/            # Web 共享组件、图库、编辑器和管理组件
├── src/lib/                   # API 客户端、i18n 字典和内容工具
├── hono/                      # Hono API 路由与中间件
├── server/                    # 数据库、存储、EXIF 和服务端基础设施
├── prisma/                    # Prisma Schema、迁移与种子脚本
├── packages/
│   ├── ai-agent/              # Web/Desktop 共用 AI Agent
│   └── tiptap-editor/         # Web/Desktop 共用 TipTap 编辑器
├── desktop/                   # Go + Wails Desktop 客户端
│   ├── frontend/              # React/Vite 前端
│   ├── config/                # Desktop 配置管理
│   ├── db/                    # GORM 数据访问与模型
│   ├── services/              # 照片、上传、AI、存储和导出服务
│   ├── build/                 # 图标、Windows 清单和构建产物
│   ├── main.go                # Wails 入口与前端资源嵌入
│   └── wails.json             # Wails 构建配置
├── public/                    # Web 静态资源与本地上传目录
├── README.assets/             # README 截图
├── tests/                     # 聚焦功能测试
├── docker-compose.yml         # Web + PostgreSQL 编排
├── Dockerfile                 # Web 容器镜像
└── RELEASE.md                 # 版本说明
```

---

## 🔒 安全建议

- 不要提交 `.env`、数据库密码、JWT 密钥、AI Key 或对象存储凭证。
- 生产环境必须修改默认管理员密码，并使用高强度 `JWT_SECRET`。
- Desktop 与 Web 共用认证时，确保双方 JWT 配置一致。
- 对公开部署启用 HTTPS，并根据需要开启 `API_ORIGIN_CHECK`。
- 定期备份 PostgreSQL、媒体文件和存储源配置。
- 正式分发 Windows Desktop 时建议进行代码签名，以减少 SmartScreen 警告。

---

## ❓ 常见问题

<details>
<summary><strong>为什么 Desktop 下载后可以直接运行？</strong></summary>

`wails build` 默认生成免安装 EXE。React/Vite 前端通过 Go `embed` 被打包进可执行文件，Windows 通常已经安装 WebView2 Runtime，因此可以直接启动。

</details>

<details>
<summary><strong>Portable 和 Setup 应该选择哪一个？</strong></summary>

Beta 测试、内部使用和无管理员权限环境优先选择 Portable；面向普通用户的稳定版本优先选择 Setup。正式发布时可以同时提供两种构建。

</details>

<details>
<summary><strong>为什么 Vercel 不能使用本地存储？</strong></summary>

Vercel 函数文件系统不用于持久化用户上传。请使用 S3、Cloudflare R2、GitHub 或其他外部存储后端。

</details>

---

## 📜 许可证

本项目以 **MIT License** 发布。
