<div align="center">

# MO Gallery

**一个面向摄影展示与内容创作的自托管站点 —— Next.js 前台 + 浏览器后台**

MO Gallery 是一个开箱即用的个人摄影站点：**公开前台**负责作品展示与叙事阅读，**Web 管理后台**在浏览器里完成照片、相册、胶卷、故事、博客与存储管理。同一套 Hono API 与数据层还能被桌面端、移动端等其他客户端复用。

<a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
[![Version](https://img.shields.io/badge/version-0.8.4-2563eb?style=flat-square)](RELEASE.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react)](https://react.dev/)
[![Hono](https://img.shields.io/badge/Hono-4-e36002?style=flat-square&logo=hono)](https://hono.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](#-许可证)

[中文](README.md) · [English](README_EN.md) · [更新日志](RELEASE.md) · [Releases](https://github.com/ushaio/mo-gallery-web/releases)

</div>

---

## 📌 项目概览

MO Gallery 由两部分组成，共用一套 API 与数据层：

| 模块 | 定位 | 主要能力 |
|------|------|----------|
| **公开站点** | 摄影作品与叙事内容展示 | 首页、图库、精选、相册、胶卷、故事、博客、友链、评论、中英双语与明暗主题 |
| **Web 管理后台** | 浏览器内的内容管理 | 资源库、上传、照片叙事与博客编辑、AI 助手、存储整理、系统设置、友链管理 |
| **API 与数据层** | 前后台共用的业务接口 | Hono 路由、Prisma、PostgreSQL、JWT、Linux DO OAuth |
| **媒体存储** | 可切换的云端存储后端 | 本地文件系统、S3 兼容对象存储、Cloudflare R2、GitHub 仓库 |

> [!NOTE]
> 当前版本 `v0.8.4`，处于 Beta 阶段。Web 应用支持 **Vercel**、**Docker Compose** 与 **Node.js 自托管** 三种部署方式。

> [!IMPORTANT]
> **桌面端与移动端已迁出本仓库。** 自 `v0.8.3` 起，Wails 桌面客户端在 [`ushaio/emulsion-desktop-v3`](https://github.com/ushaio/emulsion-desktop-v3) 独立发版（更早前为 `ushaio/emulsion-desktop`）；Flutter 移动客户端在私有的 `ushaio/emulsion-app` 仓库维护。**本仓库只包含 Web 站点与 Web 后台**，本仓库的 Release 不再附带桌面端/移动端安装包。

---

## ✨ 核心能力

### 🗂 统一资源库

照片、相册与胶卷收敛到同一个工作区，减少模块之间的来回跳转：

- 一处管理照片、相册与胶卷，旧的照片/相册/胶卷入口自动跳转到资源库对应视图。
- 支持宫格、瀑布流、时间线等浏览方式，网格按行/列虚拟化以支撑大规模图库。
- 支持关键词搜索，并按标签、类型、可见性、精选状态与存储来源筛选。
- 右侧信息栏查看与编辑标题、描述、标签、EXIF、拍摄位置与关联信息，色卡紧贴预览图展示、点击即可复制色值。
- 支持批量选择与批量操作、独立的大图预览（含缩放与左右翻页）。

### 📷 照片、相册与胶卷

- **EXIF 提取** —— 自动读取相机、镜头、光圈、快门、ISO、拍摄时间与 GPS。
- **主色提取** —— 提取照片主色，用于加载占位与界面视觉反馈。
- **相册管理** —— 封面、照片关联、排序与公开展示。
- **胶卷管理** —— 支持 `135` 与 `120` 画幅、胶片预设、胶卷元数据、帧数与帧排序。
- **批量上传** —— 数码/胶片两种上传模式，拖拽导入、压缩、进度展示、失败重试与目标选择。
- **重复检测** —— 基于文件哈希识别重复照片。
- **上传管线** —— EXIF 提取、主色、缩略图与目标体积压缩由共享包 `@mo-gallery/image-pipeline` 统一提供。

### ✍️ 故事、博客与编辑器

- **照片叙事** —— 把多张照片与长文叙事组合成一篇故事，支持故事地图、封面裁切与故事内照片排序。
- **博客** —— 与故事共用编辑器与渲染器，支持草稿/已发布状态与图库插图。
- **Milkdown 编辑器** —— 正文编辑器与只读渲染走共享包 `@mo-gallery/milkdown`，支持图片卡、拼图与媒体嵌入。
- **TipTap 编辑器** —— 结构化 JSON 内容，支持标题、列表、引用、代码、表格、图片组、颜色与字号等。
- **AI 辅助** —— 编辑器内直接调用 AI 进行续写、改写与受控直接编辑。
- **本地草稿** —— 通过 IndexedDB 保存草稿，降低意外退出造成的内容丢失。
- **一键复制到公众号** —— 把正文转换为公众号可用的 `text/html`（含内联样式与拼图表格化），粘贴即可保持排版。

### 💬 评论、认证与社交

- **评论后端可切换** —— 使用本地 PostgreSQL 数据库，或 Waline + LeanCloud。
- **Linux DO OAuth** —— 支持 Linux DO 登录、用户信息展示，并可限制仅 Linux DO 用户评论。
- **管理员认证** —— 账号密码（数据库内 bcrypt 校验）、JWT（固定 HS256）、登录限流，以及可配置的隐藏登录路径。
- **友链** —— 前台友链展示与后台友链增删改排序。

### ⚙️ Web 管理后台

侧栏包含七个模块：**资源库 · 上传 · 照片叙事 · AI 助手 · 存储整理 · 系统设置 · 友链管理**。

- **资源库** —— 照片/相册/胶卷统一管理与批量操作。
- **上传** —— 数码影像 / 胶卷 两个 Tab，查看上传进度与结果。
- **照片叙事** —— 叙事与博客列表、草稿恢复、素材库与全屏素材预览。
- **AI 助手** —— 多轮对话、消息编辑与重发、从此处分叉、token 用量显示、系统提示词抽屉。
- **存储整理** —— 扫描存储、发现失控/缺失文件、管理存储源。
- **系统设置** —— 站点信息、社交链接、存储后端、AI 服务、公众号绑定与账号配置。
- **友链管理** —— 友链的增删改与排序。

---

## 🔧 可选能力

以下能力默认关闭，按需开启：

> [!TIP]
> 「公众号图文（草稿箱 / 发表记录）」能力已就位但**暂未启用**，需要联调认证公众号后再恢复。**公众号素材管理不受影响，照旧可用。**

| 能力 | 开启方式 | 说明 |
|------|----------|------|
| 公众号素材管理 | 后台「系统设置 → 账号」录入 AppID / AppSecret | 服务端代理微信接口，绑定要求微信侧放行服务端公网出口 IP |
| 公众号图文列表 | 环境变量 `WECHAT_ARTICLES_ENABLED=1` | 默认关闭（返回 403），页面入口暂未挂载 |
| AI 编辑器 | 配置 `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | 未配置时其余功能不受影响 |
| Linux DO 登录 | 配置 `LINUXDO_CLIENT_ID` 等 | 未配置时仅使用账号密码登录 |
| 高德地图 | `NEXT_PUBLIC_MAP_PROVIDER=amap` + `NEXT_AMAP_KEY` | 默认使用 Carto 底图 |

---

## 🧱 技术架构

```text
┌────────────────────────────────────────────────────────┐
│  公开站点 / Web 管理后台                                │
│  Next.js 16 App Router · React 19 · Tailwind CSS 4     │
└───────────────────────────┬────────────────────────────┘
                            │  fetch
                            ▼
                 src/app/api/[[...route]]/route.ts
                            │
                            ▼
              Hono 路由  hono/*  ·  JWT 认证中间件
                            │
                            ▼
                Prisma 7  +  PostgreSQL 16
                            │
                            ▼
        Local / S3 兼容 / Cloudflare R2 / GitHub 存储

共享包（packages/*，由 mo-gallery-shared 同步）
  api-client · ai-agent · milkdown · tiptap-editor · mo-editor
  content-core · image-pipeline · public-site · admin-console
```

### 数据边界

- **云端业务数据** —— 照片、相册、胶卷、故事、博客、评论与系统设置保存在 PostgreSQL。
- **云端媒体文件** —— 由配置的 Local、S3 兼容、R2 或 GitHub 存储源保存。
- **客户端本地数据** —— 桌面端/移动端的本地图库与上传队列保存在客户端自己管理，不属于本仓库范围。

### 技术栈

| 分类 | 技术 |
|------|------|
| 框架 | Next.js 16（App Router）、React 19、React Compiler |
| API | Hono 4、Next.js Route Handler、Zod |
| 数据库 | PostgreSQL 16、Prisma 7（`@prisma/adapter-pg`） |
| 样式与动效 | Tailwind CSS 4、Framer Motion、Lucide / Iconify |
| 富文本 | Milkdown、TipTap 3、React Markdown、Shiki |
| 图片处理 | Sharp、ExifReader、`@jsquash/*`（JS/WASM 压缩）、`@mo-gallery/image-pipeline` |
| 地图 | MapLibre GL、react-map-gl（可切换高德） |
| 认证 | JWT（HS256）、bcrypt、Linux DO OAuth |
| 状态与草稿 | React Context、Zustand、IndexedDB |
| 存储 | Local、S3 兼容、Cloudflare R2、GitHub |

---

## 📦 共享包

`packages/*` 是 **`mo-gallery-shared` 仓库的镜像**，不是本仓库的编辑源：源在 `../mo-gallery-shared`，由该仓库的 `pnpm sync` 单向同步过来，**请勿直接编辑镜像文件**。包间以 `workspace:*` 引用，全部为 TypeScript 源码直出（`main` 指向 `src/index.ts`，无构建产物）。

| 包 | 说明 |
|----|------|
| `@mo-gallery/api-client` | API 客户端、DTO 与端点契约（含 `mo-cloud` 子模块） |
| `@mo-gallery/ai-agent` | 编辑器 AI 领域协议与 Vercel AI SDK 运行时 |
| `@mo-gallery/milkdown` | Milkdown 富文本编辑器封装 |
| `@mo-gallery/tiptap-editor` | TipTap 富文本编辑器 |
| `@mo-gallery/mo-editor` | 编辑器共享组件 |
| `@mo-gallery/content-core` | 个人站内容领域：发布状态机与内容规则（纯 TS，无 Prisma/Next 依赖） |
| `@mo-gallery/image-pipeline` | 服务端图片处理管线：EXIF、主色、缩略图与目标体积压缩 |
| `@mo-gallery/public-site` | 访客站点组件集（网格、灯箱、相册、胶卷、正文、评论），宿主无关 |
| `@mo-gallery/admin-console` | 后台外壳与设计系统（侧栏、顶栏、模态、确认弹窗），导航与路由由宿主注入 |

---

## 🚀 快速开始

### 环境要求

| 工具 | 建议版本 | 用途 |
|------|----------|------|
| Node.js | `>=20.9.0`（建议 24.x） | 运行应用与构建 |
| pnpm | 10.x | 依赖管理 |
| PostgreSQL | 16.x | 业务数据库 |

### 1. 获取项目

```bash
git clone https://github.com/ushaio/mo-gallery-web.git
cd mo-gallery-web
pnpm install
```

`pnpm-workspace.yaml` 只把 `packages/*` 纳入工作区。

### 2. 配置环境变量

```bash
cp .env.example .env
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env
```

至少需要配置数据库、管理员账号、JWT 密钥与密钥加密密钥：

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
DIRECT_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
ADMIN_USERNAME="replace-with-a-non-default-admin-name"
ADMIN_PASSWORD="replace-with-a-long-unique-password"
JWT_SECRET="replace-with-a-long-random-secret"
SECRETS_ENCRYPTION_KEY="replace-with-an-independent-long-random-secret"
```

完整配置见 [`.env.example`](.env.example)。

### 3. 初始化数据库并启动

```bash
pnpm run prisma:generate
pnpm run prisma:dev
pnpm run prisma:seed
pnpm run dev
```

访问地址：

- 公开站点：`http://localhost:3000`
- 管理员登录（未配置安全后缀）：`http://localhost:3000/login`
- 管理员登录（已配置安全后缀）：`http://localhost:3000/login/{ADMIN_LOGIN_URL}`

> [!CAUTION]
> 修改管理员登录后缀会立即使旧管理员会话失效。其他客户端（桌面端/移动端）连接服务端时必须填写包含 `/login/{ADMIN_LOGIN_URL}` 的完整地址，仅站点根地址会被拒绝。

---

## ⚙️ 配置说明

### 必需配置

| 变量 | 说明 |
|------|------|
| `DATABASE_URL` | 运行时 PostgreSQL 连接地址 |
| `DIRECT_URL` | Prisma 迁移使用的数据库直连地址 |
| `ADMIN_USERNAME` | 默认管理员用户名，**禁止使用默认值** |
| `ADMIN_PASSWORD` | 默认管理员密码，**禁止使用默认值** |
| `JWT_SECRET` | JWT 签名密钥（HS256，生产环境至少 32 字节随机串） |
| `SECRETS_ENCRYPTION_KEY` | 数据库内敏感配置（存储密钥等）的 AES-256-GCM 加密密钥；留空时从 `JWT_SECRET` 派生，生产环境建议独立配置 |

快速生成随机密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### 站点与安全

| 变量 | 说明 | 默认/示例 |
|------|------|-----------|
| `ADMIN_LOGIN_URL` | 管理员登录安全后缀；留空时从 `/login` 登录 | 留空 |
| `NEXT_PUBLIC_ADMIN_LOGIN_URL` | 旧部署兼容项；`ADMIN_LOGIN_URL` 未设置时作为回退 | 留空 |
| `SITE_TITLE` | 站点标题 | `MO GALLERY` |
| `SITE_URL` | 服务端使用的公开站点地址 | `https://your-domain.com` |
| `NEXT_PUBLIC_SITE_URL` | 浏览器使用的公开站点地址 | `https://your-domain.com` |
| `SITE_AUTHOR` | 首页显示的作者名称 | `MO` |
| `CDN_DOMAIN` | 媒体 CDN 域名 | 留空 |
| `TRUSTED_PROXY_MODE` | 可信反向代理：`cloudflare` / `vercel` / `forwarded`；未配置时不信任客户端伪造的 `X-Forwarded-For` | `forwarded` |
| `API_ORIGIN_CHECK` | 是否限制 API 请求来源 | `false` |
| `SOCIAL_LINKS` | 页脚社交链接，JSON 数组；`icon` 用 Iconify 图标名 | 见 `.env.example` |

### 地图

| 变量 | 说明 | 默认/示例 |
|------|------|-----------|
| `NEXT_PUBLIC_MAP_PROVIDER` | 故事地图来源：`carto` 或 `amap` | `carto` |
| `NEXT_AMAP_KEY` | `amap` 时的 Web 端（JS API）Key | 留空 |
| `NEXT_AMAP_SECURITY_JS_CODE` | 高德安全密钥（JS API 2.0 推荐） | 留空 |

### AI 编辑器（可选）

| 变量 | 说明 |
|------|------|
| `AI_BASE_URL` | OpenAI 兼容 API 根地址，如 `https://api.openai.com/v1` |
| `AI_API_KEY` | AI 服务密钥 |
| `AI_MODEL` | 默认模型 |
| `AI_VISION_MODELS` | 允许图片输入的模型 ID，逗号分隔 |
| `AI_TOOL_MODELS` | 允许工具调用的模型 ID，逗号分隔 |
| `AI_STRUCTURED_OUTPUT_MODELS` | 允许结构化输出的模型 ID，逗号分隔 |
| `AI_MODEL_CONTEXT_WINDOWS` | 模型上下文窗口，**必须写在单行**的 JSON 对象（`{"模型ID": token 数}`）；键须与 `${AI_BASE_URL}/models` 返回的 id 完全一致，未命中的模型回退 8192 |

> [!WARNING]
> `AI_MODEL_CONTEXT_WINDOWS` 换行写会被 dotenv 只解析成 `{"`，导致 AI 编辑器整体不可用。示例见 [`.env.example`](.env.example)。

### 评论与 Linux DO OAuth（可选）

| 变量 | 说明 |
|------|------|
| `COMMENTS_STORAGE` | `LOCAL`、留空，或 `LEANCLOUD` |
| `WALINE_SERVER_URL` | Waline 服务地址 |
| `LEAN_ID` / `LEAN_KEY` / `LEAN_MASTER_KEY` | LeanCloud 应用凭证 |
| `LINUXDO_CLIENT_ID` / `LINUXDO_CLIENT_SECRET` | Linux DO OAuth 凭证 |
| `LINUXDO_REDIRECT_URI` | OAuth 回调地址，格式 `https://your-domain.com/login/callback` |
| `LINUXDO_ADMIN_USERNAMES` | 允许成为管理员的 Linux DO 用户名，逗号分隔 |
| `LINUXDO_COMMENTS_ONLY` | 是否仅允许 Linux DO 用户评论 |

### 微信公众号（可选）

| 变量 | 说明 |
|------|------|
| `WECHAT_EGRESS_IP` | 服务端自检出口 IP 的兜底值；真实出口 IP 以微信 `40164` 报错回带的为准 |
| `WECHAT_ARTICLES_ENABLED` | 设为 `1` 才开启公众号图文列表接口（默认关闭） |

绑定与素材管理由服务端代理，AppID / AppSecret 在后台「系统设置 → 账号」录入，以 AES-256-GCM 密文落库、永不回显。

---

## 📦 部署

### Docker Compose

Docker Compose 会启动 PostgreSQL 与 MO Gallery，并持久化数据库与本地上传目录。

```bash
cp .env.example .env
# 修改 POSTGRES_PASSWORD、ADMIN_PASSWORD、JWT_SECRET、SECRETS_ENCRYPTION_KEY 等生产配置

docker compose up -d --build
docker compose logs -f
```

默认地址：

- Web：`http://localhost:3001`
- PostgreSQL：`localhost:5433`

可通过 `.env` 中的 `APP_PORT` 与 `DB_PORT` 修改外部端口。

### Vercel

1. Fork 本仓库并导入 Vercel。
2. 按 `.env.example` 配置所需环境变量。
3. 使用 Neon、Supabase 或其他托管 PostgreSQL。
4. 使用 S3、R2 或 GitHub 存储媒体文件。
5. `vercel.json` 会依次执行 Prisma 部署、客户端生成与 Next.js 构建。

> [!IMPORTANT]
> Vercel 运行文件系统不适合持久化用户上传。生产环境**不要**使用 Local 存储后端。

### Node.js 自托管

```bash
pnpm run build:node
pnpm run start
```

生产环境还应配置反向代理、HTTPS、进程守护、数据库备份与媒体存储备份。

---

## 🧰 常用命令

| 命令 | 说明 |
|------|------|
| `pnpm run dev` | 启动 Next.js 开发服务器 |
| `pnpm run build` | 构建生产版本 |
| `pnpm run start` | 启动生产服务器 |
| `pnpm run lint` | 运行 ESLint |
| `pnpm run build:vercel` | Prisma 部署 + 生成 + 种子数据 + Vercel 构建 |
| `pnpm run build:node` | Prisma 部署 + 生成 + 自托管构建 |
| `pnpm run prisma:generate` | 生成 Prisma Client |
| `pnpm run prisma:dev` | 创建并应用开发迁移 |
| `pnpm run prisma:deploy` | 应用生产迁移 |
| `pnpm run prisma:seed` | 写入种子数据 |

聚焦测试（`node --import tsx` 直跑，无需额外测试框架）：

| 命令 | 说明 |
|------|------|
| `pnpm run test:editor-ai-routes` | 编辑器 AI API 路由 |
| `pnpm run test:editor-ai-images` | 编辑器 AI 图片处理 |
| `pnpm run test:story-ai-images` | 故事 AI 图片处理 |
| `pnpm run test:security` | 安全加密（OAuth state、敏感字段加密与脱敏） |

---

## 📁 项目结构

```text
mo-gallery-web/
├── src/app/                    # Next.js App Router：公开页面（gallery / story / blog / curated / they …）与 /admin
├── src/components/             # 前台与后台组件（图库、故事、评论、编辑器、admin/*）
├── src/lib/                    # API 客户端、i18n 字典、草稿与内容工具
├── hono/                       # Hono 路由与认证中间件（photos / stories / blogs / albums / film-rolls / wechat …）
├── server/lib/                 # 查询、存储、EXIF、AI 等基础能力
├── prisma/                     # Prisma Schema、迁移与种子脚本
├── packages/                   # @mo-gallery/* 共享包镜像（源在 mo-gallery-shared，勿直接编辑）
├── docs/                       # 设计文档、需求规格与验证矩阵
├── tests/                      # 聚焦测试
├── scripts/                    # 数据修复与回归脚本
├── public/                     # 静态资源与本地上传目录
├── README.assets/              # README 截图
├── docker-compose.yml          # Web + PostgreSQL 编排
├── Dockerfile                  # Web 容器镜像
├── vercel.json                 # Vercel 构建配置
├── .env.example                # 环境变量模板
└── RELEASE.md                  # 面向用户的版本说明
```

---

## 🔒 安全建议

- 不要提交 `.env`、数据库密码、JWT 密钥、`SECRETS_ENCRYPTION_KEY`、AI Key 或对象存储凭证。
- 生产环境必须修改默认管理员账号密码，并使用高强度随机 `JWT_SECRET`。
- 建议独立配置 `SECRETS_ENCRYPTION_KEY`；已有未加密的存储/设置密钥在重新保存后会转为加密格式。
- 对公开部署启用 HTTPS，并按部署环境正确设置 `TRUSTED_PROXY_MODE`（错误的配置会让客户端伪造的 IP 头被信任）。
- 视需要开启 `API_ORIGIN_CHECK`，限制仅项目前端可调用 API。
- 定期备份 PostgreSQL、媒体文件与存储源配置。

---

## ❓ 常见问题

<details>
<summary><strong>为什么仓库里没有 desktop / flutter 目录？</strong></summary>

自 `v0.8.3` 起，Wails 桌面客户端迁到 [`ushaio/emulsion-desktop-v3`](https://github.com/ushaio/emulsion-desktop-v3) 独立发版，Flutter 移动客户端在私有仓库 `ushaio/emulsion-app` 维护。本仓库只保留 Web 站点与 Web 后台；仓库里的 `flutter/` 仅剩构建缓存，已被 `.gitignore` 忽略。

</details>

<details>
<summary><strong>packages/ 里的代码能直接改吗？</strong></summary>

不能。`packages/*` 是 `mo-gallery-shared` 仓库的镜像，改动会在下次 `pnpm sync` 时被覆盖。请到 `mo-gallery-shared` 修改源文件，再同步到本仓库。

</details>

<details>
<summary><strong>为什么 Vercel 不能使用本地存储？</strong></summary>

Vercel 函数文件系统不用于持久化用户上传。请使用 S3、Cloudflare R2、GitHub 或其他外部存储后端。

</details>

<details>
<summary><strong>AI 编辑器报 <code>AI_MODEL_CONTEXT_WINDOWS must be a valid JSON object</code>？</strong></summary>

该变量必须写成**单行**的 JSON 对象。`.env` 里跨行书写会被 dotenv 只解析成 `{`，导致解析失败、AI 编辑器整体不可用。正确写法：

```env
AI_MODEL_CONTEXT_WINDOWS={"deepseek/deepseek-v4-flash-vision-exp": 1000000, "gpt-5.2": 128000}
```

</details>

<details>
<summary><strong>公众号相关功能为什么用不了？</strong></summary>

- **素材管理**：需先在后台「系统设置 → 账号」录入 AppID / AppSecret 完成绑定，并要求微信侧放行服务端公网出口 IP；未认证订阅号常见的 `48001` 表示缺接口权限。
- **图文列表（草稿箱 / 发表记录）**：能力已就位但暂未启用，需要 `WECHAT_ARTICLES_ENABLED=1` 且页面入口挂载后才可用。

</details>

<details>
<summary><strong>配置了登录后缀后，为什么管理后台打不开？</strong></summary>

配置 `ADMIN_LOGIN_URL` 后必须从 `/login/{ADMIN_LOGIN_URL}` 登录，站点根地址会被拒绝；修改后缀会立即失效所有旧会话。

</details>

---

## ❤️ 支持项目

如果 MO Gallery 对你有帮助，欢迎通过赞赏支持项目持续开发。

<p align="center">
  <img src="public/donate_weixin.png" alt="赞赏码" width="280" />
</p>

---

## 🔗 友情链接

- [LINUX DO](https://linux.do) —— 新的理想型社区

---

## 📜 许可证

本项目以 **MIT License** 发布。

---

## ⭐ Star History

<a href="https://www.star-history.com/?repos=ushaio%2Fmo-gallery-web&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ushaio/mo-gallery-web&type=date&theme=dark&legend=top-left&sealed_token=qu9-MEVV8696GiaTdMhvDBhNScK6ZhwW8caUioDSuVscetrFt1dQthCPFrcPTHCOUqoWTqfwAP8mV3lGTyUDDkfObhTjBJ_Y5iWjBhZytO9z-OUmXVdIVrMTwFI2zZR9aEVxtuBiOdnQem5TdO55JVAxDiveM5-AM8ZjYpjQ_wiOh0rbhaiCtwnIlSgK" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ushaio/mo-gallery-web&type=date&legend=top-left&sealed_token=qu9-MEVV8696GiaTdMhvDBhNScK6ZhwW8caUioDSuVscetrFt1dQthCPFrcPTHCOUqoWTqfwAP8mV3lGTyUDDkfObhTjBJ_Y5iWjBhZytO9z-OUmXVdIVrMTwFI2zZR9aEVxtuBiOdnQem5TdO55JVAxDiveM5-AM8ZjYpjQ_wiOh0rbhaiCtwnIlSgK" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ushaio/mo-gallery-web&type=date&legend=top-left&sealed_token=qu9-MEVV8696GiaTdMhvDBhNScK6ZhwW8caUioDSuVscetrFt1dQthCPFrcPTHCOUqoWTqfwAP8mV3lGTyUDDkfObhTjBJ_Y5iWjBhZytO9z-OUmXVdIVrMTwFI2zZR9aEVxtuBiOdnQem5TdO55JVAxDiveM5-AM8ZjYpjQ_wiOh0rbhaiCtwnIlSgK" />
 </picture>
</a>
