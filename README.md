<div align="center">

# 📸 MO Gallery

**现代化的摄影画廊与叙事博客平台，前后端集成，支持多种部署方式和存储后端**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Hono](https://img.shields.io/badge/Hono-API-orange?style=flat-square)](https://hono.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS_4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[English](README_EN.md) | 中文

</div>

建议 Vercel 部署，Docker 部署未做充分测试！

---

## ✨ 功能特性

### 📷 照片画廊
- **多种视图模式** — 宫格、瀑布流、时间线视图，支持平滑切换
- **EXIF 信息提取** — 自动提取相机、镜头、光圈、快门、ISO 等拍摄参数
- **主色调提取** — 自动提取图片主色调，用于美观的占位符显示
- **相册管理** — 将照片组织到相册中，支持封面图片和相册详情页
- **批量上传** — 多图上传，显示压缩和上传进度，可选择目标相册
- **重复检测** — 基于 SHA-256 哈希的客户端去重
- **照片分页** — 高效分页加载，适合大量照片
- **响应式设计** — 针对桌面、平板和移动设备优化

### 📖 故事 / 叙事
- 将多张照片组合成故事，附以富文本叙事内容
- **TipTap 富文本编辑器** — 所见即所得编辑，支持图片缩放、表格、对齐等
- 沉浸式编辑模式，优化长篇写作体验
- 故事内照片管理（添加 / 移除 / 排序）
- 支持设置封面照片
- 本地草稿自动保存（IndexedDB）

### ✍️ 博客系统
- 与叙事共用 **TipTap WYSIWYG 编辑器**，统一编辑体验
- 内容渲染与叙事一致，前后端预览无差异
- 一键插入图库照片
- 发布 / 草稿状态管理
- 本地草稿自动保存

### 👥 友链（They 页面）
- 展示朋友及其网站
- 可自定义头像和描述
- 后台友链管理界面
- 精美的卡片式展示布局

### 💬 评论系统
- **双重后端支持** — 本地数据库评论 或 Waline（LeanCloud）
- **Linux DO OAuth 集成** — 无缝对接 Linux DO 账号认证
- 后台评论审核（待审核 → 通过 / 拒绝）
- 显示 Linux DO 用户名和信任等级
- 可选：仅限 Linux DO 用户评论

### 🔐 后台管理系统
- **照片管理** — 全面的照片管理，支持筛选和分页
- **相册管理** — 创建、编辑和组织相册
- **故事管理** — 创建和管理照片故事，支持照片选择和排序
- **博客编辑器** — TipTap 所见即所得编辑器
- **友链管理** — 添加、编辑和删除友链
- **存储整理** — 扫描存储状态，检测孤立文件和缺失文件
- **系统设置** — 配置站点标题、描述、社交链接等
- **评论审核** — 审核和管理用户评论

### 🏠 首页
- **动态英雄区域** — 从图库随机展示英雄图片
- **粒子效果** — 动画粒子背景
- **自动轮播** — 图片轮播展示
- **滚动动画** — 平滑的滚动触发动画

### 🌍 多语言支持
- 中文和英文
- 基于 React Context 的客户端 i18n

### 🎨 主题切换
- 深色 / 浅色 / 跟随系统
- 平滑的主题过渡
- 所有组件风格统一

### ☁️ 多种存储后端
- **本地存储** — 存储在本地文件系统
- **Cloudflare R2** — S3 兼容的对象存储
- **GitHub** — 使用 GitHub 仓库作为存储

---

## 🛠️ 技术栈

| 分类 | 技术 |
|------|------|
| **框架** | Next.js 16 (App Router) + React 19 |
| **语言** | TypeScript 5（严格模式） |
| **API** | Hono.js（嵌入 Next.js） |
| **数据库** | PostgreSQL + Prisma 6 |
| **样式** | Tailwind CSS 4 |
| **动画** | Framer Motion |
| **图片处理** | Sharp、ExifReader |
| **富文本编辑器** | TipTap 3 |
| **认证** | JWT + Linux DO OAuth |
| **状态管理** | React Context |
| **编译优化** | React Compiler |

---

## 🚀 快速开始

### 前置要求

- Node.js 18+
- pnpm
- PostgreSQL

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/yourusername/mo-gallery.git
cd mo-gallery

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，配置数据库连接和管理员凭据

# 生成 Prisma 客户端并初始化数据库
pnpm run prisma:generate
pnpm run prisma:dev

# 启动开发服务器
pnpm run dev
```

访问 `http://localhost:3000` 查看画廊，访问 `/login/admin` 进入管理后台。

### 最小环境变量配置

```env
# 数据库（必填）
DATABASE_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
DIRECT_URL="postgresql://postgres:password@localhost:5432/mo_gallery"

# 管理员凭据
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
```

---

## ⚙️ 环境变量

### 必需

| 变量 | 描述 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接 URL | `postgresql://postgres:password@localhost:5432/mo_gallery` |
| `DIRECT_URL` | 直接数据库 URL（用于迁移） | 同上 |

### 站点配置（可选）

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123` |
| `NEXT_PUBLIC_ADMIN_LOGIN_URL` | 隐藏的管理员登录路径 | `admin` |
| `SITE_TITLE` | 站点标题 | `MO GALLERY` |
| `SITE_URL` | 站点 URL（SEO） | — |
| `NEXT_PUBLIC_SITE_URL` | 公开站点 URL（客户端） | — |
| `SITE_AUTHOR` | 站点作者名称（首页显示） | `MO` |
| `CDN_DOMAIN` | CDN 域名 | — |
| `API_ORIGIN_CHECK` | 启用 API 来源检查 | `false` |

### 评论系统（可选）

| 变量 | 描述 |
|------|------|
| `COMMENTS_STORAGE` | 评论存储源：留空为本地数据库，`LEANCLOUD` 使用 Waline |
| `WALINE_SERVER_URL` | Waline 服务器 URL（使用 LeanCloud 时配置） |
| `LEAN_ID` | LeanCloud App ID |
| `LEAN_KEY` | LeanCloud App Key |
| `LEAN_MASTER_KEY` | LeanCloud Master Key |

### Linux DO OAuth（可选）

| 变量 | 描述 |
|------|------|
| `LINUXDO_CLIENT_ID` | OAuth 客户端 ID |
| `LINUXDO_CLIENT_SECRET` | OAuth 客户端密钥 |
| `LINUXDO_REDIRECT_URI` | 回调 URL（如 `https://your-domain.com/login/callback`） |
| `LINUXDO_ADMIN_USERNAMES` | 允许的管理员用户名（逗号分隔） |
| `LINUXDO_COMMENTS_ONLY` | 仅限 Linux DO 用户评论（`true`/`false`） |

### 社交链接（可选）

```env
SOCIAL_LINKS='[
    {"title":"GitHub","url":"https://github.com/username","icon":"lucide:github"},
    {"title":"Twitter","url":"https://twitter.com/username","icon":"lucide:twitter"}
]'
```

图标使用 [Iconify](https://icon-sets.iconify.design/) 格式。

---

## 🐳 Docker 部署

### 使用 Docker Compose（推荐）

```bash
# 配置环境变量
cp .env.example .env
# 编辑 .env 文件

# 启动（包含 PostgreSQL）
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 手动 Docker 构建

```bash
docker build -t mo-gallery .
docker run -p 3000:3000 --env-file .env mo-gallery
```

---

## ▲ Vercel 部署

1. **Fork** 此仓库
2. 在 Vercel 中 **导入** 项目
3. **配置** 环境变量（参见 `.env.example`）
4. **设置** 构建命令为 `pnpm run build:vercel`
5. **使用** Neon 或 Supabase 作为数据库

> ⚠️ **注意**: Vercel 不支持本地存储，请使用 Cloudflare R2 或 GitHub 存储。

### Vercel 数据库选项

- **[Neon](https://neon.tech/)** — 无服务器 PostgreSQL（推荐）
- **[Supabase](https://supabase.com/)** — PostgreSQL 及附加功能

---

## 📁 项目结构

```
mo-gallery-web/
├── prisma/                  # 数据库 Schema 和迁移
│   ├── schema.prisma        # Prisma 模型定义
│   ├── seed.ts              # 数据库种子脚本
│   └── migrations/          # 迁移历史
├── server/lib/              # 服务端工具
│   ├── db.ts                # Prisma 客户端单例（含时区处理）
│   ├── jwt.ts               # JWT 工具
│   ├── exif.ts              # EXIF 提取
│   ├── colors.ts            # 主色调提取
│   └── storage/             # 存储抽象层（local / R2 / GitHub）
├── hono/                    # API 路由（Hono.js）
│   ├── index.ts             # 路由注册
│   ├── auth.ts              # 认证 & OAuth
│   ├── photos.ts            # 照片管理
│   ├── albums.ts            # 相册管理
│   ├── stories.ts           # 故事 / 叙事
│   ├── blogs.ts             # 博客
│   ├── comments.ts          # 评论
│   ├── friends.ts           # 友链
│   ├── storage.ts           # 存储管理
│   ├── equipment.ts         # 器材管理
│   ├── settings.ts          # 系统设置
│   ├── waline.ts            # Waline 评论代理
│   └── middleware/          # 认证与来源检查中间件
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/             # API 入口（Hono 集成）
│   │   ├── admin/           # 后台管理页面
│   │   ├── gallery/         # 公开画廊
│   │   ├── story/           # 故事页面
│   │   ├── blog/            # 博客页面
│   │   ├── they/            # 友链页面
│   │   ├── about/           # 关于页面
│   │   └── login/           # 登录（管理员 & OAuth 回调）
│   ├── components/          # React 组件
│   │   ├── NarrativeTipTapEditor.tsx  # TipTap 富文本编辑器
│   │   ├── StoryRichContent.tsx       # 统一内容渲染
│   │   ├── tiptap-extensions/         # TipTap 自定义扩展
│   │   ├── admin/           # 后台专用组件
│   │   ├── gallery/         # 画廊视图（Grid / Masonry / Timeline）
│   │   └── ui/              # 通用 UI 组件
│   ├── contexts/            # React Context
│   │   ├── AuthContext.tsx
│   │   ├── ThemeContext.tsx
│   │   ├── LanguageContext.tsx
│   │   ├── SettingsContext.tsx
│   │   └── UploadQueueContext.tsx
│   └── lib/                 # 前端工具
│       ├── api/             # API 客户端模块（按领域拆分）
│       ├── i18n.ts          # 国际化字典
│       └── utils.ts         # 辅助函数
└── public/                  # 静态资源
```

---

## 📜 许可证

[MIT](LICENSE)
