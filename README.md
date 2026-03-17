<div align="center">

# 📸 MO Gallery

**一个现代化的图片画廊应用，前后端集成，支持多种部署方式和存储后端**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Hono](https://img.shields.io/badge/Hono-API-orange?style=flat-square)](https://hono.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[English](README_EN.md) | 中文

</div>

建议vercel部署，docker部署未做测试！！
---

## ✨ 功能特性

### 📷 照片画廊
- **多种视图模式** - 宫格、瀑布流、时间线视图，支持平滑切换
- **EXIF 信息提取** - 自动提取相机、镜头、光圈、快门、ISO 等信息
- **主色调提取** - 自动提取图片主色调，用于美观的占位符显示
- **相册管理** - 将照片组织到相册中，支持封面图片
- **批量上传** - 支持多图上传，显示上传进度，可选择目标相册
- **照片分页** - 高效的分页加载，适合大量照片
- **响应式设计** - 针对桌面、平板和移动设备优化

### 📖 故事/叙事
- 将多张照片组合成故事
- **Tiptap 富文本编辑器** - 所见即所得的编辑体验，支持图片缩放、表格、对齐等
- 精美的故事展示布局
- 故事内照片管理（添加/移除/排序照片）
- 支持设置封面照片

### ✍️ 博客系统
- **Tiptap WYSIWYG 编辑器** - 所见即所得的富文本编辑
- 支持工具栏格式化
- 支持可调整大小的图片和图片组
- 一键插入图库照片
- 发布/草稿状态管理

### 👥 友链功能（They 页面）
- 展示朋友及其网站
- 可自定义头像和描述
- 后台友链管理界面
- 精美的卡片式展示布局

### 💬 评论系统
- **Linux DO OAuth 集成** - 无缝对接 Linux DO 账号认证
- 后台评论审核
- 显示 Linux DO 用户名和信任等级
- 可选：仅限 Linux DO 用户评论

### 🔐 后台管理系统
- **照片管理** - 全面的照片管理，支持筛选和分页
- **可复用照片选择器** - 模态框组件，可在应用各处选择照片
- **相册管理** - 创建、编辑和组织相册
- **故事管理** - 创建和管理照片故事，支持照片选择和排序
- **友链管理** - 添加、编辑和删除友链
- **博客编辑器** - Tiptap 所见即所得编辑器
- **系统设置** - 配置站点标题、描述、社交链接等
- **评论审核** - 审核和管理用户评论
- **操作日志** - 追踪管理员操作和系统事件

### 🏠 首页
- **动态英雄区域** - 从图库随机展示英雄图片
- **粒子效果** - 精美的动画粒子背景
- **自动轮播** - 自动图片轮播展示
- **滚动动画** - 平滑的滚动触发动画

### 🌍 多语言支持
- 中文和英文支持
- 易于扩展更多语言
- 全面的国际化覆盖

### 🎨 主题切换
- 深色/浅色模式
- 平滑的主题过渡
- 跟随系统偏好
- 所有组件风格统一

### ☁️ 多种存储后端
- **本地存储** - 存储在本地文件系统
- **GitHub** - 使用 GitHub 仓库作为存储
- **Cloudflare R2** - S3 兼容的对象存储

---

## 🛠️ 技术栈

| 分类 | 技术 |
|------|------|
| **框架** | Next.js 16 (App Router) |
| **语言** | TypeScript 5 |
| **API** | Hono.js |
| **数据库 ORM** | Prisma |
| **样式** | Tailwind CSS 4 |
| **动画** | Framer Motion |
| **数据库** | PostgreSQL |
| **图片处理** | Sharp, ExifReader |
| **富文本编辑器** | Tiptap |
| **认证** | JWT, Linux DO OAuth |
| **状态管理** | React Context |

---

## 🚀 快速开始

### 前置要求

- Node.js 18+
- pnpm（推荐）或 npm
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
# 编辑 .env 文件

# 初始化数据库
pnpm run prisma:dev

# 启动开发服务器
pnpm run dev
```

访问 `http://localhost:3000` 查看你的画廊！

### 最小环境变量配置

```env
# 数据库
DATABASE_URL="postgre:xxx"
DIRECT_URL="postgre:xxx"

# JWT 密钥（生产环境请修改！）
JWT_SECRET="your-secret-key"

# 管理员凭据（用于初始化）
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
```

---

## ⚙️ 环境变量

### 必需

| 变量 | 描述 | 示例 |
|------|------|------|
| `DATABASE_URL` | 数据库连接 URL | `file:./dev.db` 或 PostgreSQL URL |
| `DIRECT_URL` | 直接数据库 URL（用于迁移） | 与 DATABASE_URL 相同 |
| `JWT_SECRET` | JWT 令牌密钥 | `your-secret-key` |

### 可选

| 变量 | 描述 | 默认值 |
|------|------|--------|
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | `admin123` |
| `NEXT_PUBLIC_ADMIN_LOGIN_URL` | 隐藏的管理员登录路径 | - |
| `SITE_TITLE` | 站点标题 | `MO GALLERY` |
| `CDN_DOMAIN` | CDN 域名 | - |

### Linux DO OAuth（可选）

| 变量 | 描述 |
|------|------|
| `LINUXDO_CLIENT_ID` | OAuth 客户端 ID |
| `LINUXDO_CLIENT_SECRET` | OAuth 客户端密钥 |
| `LINUXDO_REDIRECT_URI` | 回调 URL（如 `https://your-domain.com/login/callback`） |
| `LINUXDO_COMMENTS_ONLY` | 仅限 Linux DO 用户评论（`true`/`false`） |

---

## 🐳 Docker 部署

### 使用 Docker Compose（推荐）

```bash
# 启动（包含 PostgreSQL）
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 手动 Docker 构建

```bash
# 构建镜像
docker build -t mo-gallery .

# 运行容器
docker run -p 3000:3000 --env-file .env mo-gallery
```

---

## ▲ Vercel 部署

1. **Fork** 此仓库
2. 在 Vercel 中 **导入** 项目
3. **配置** 环境变量（参见 `.env.example`）
4. **设置** 构建命令为 `pnpm run build:vercel`
5. **使用** Neon 或 Supabase 作为数据库

> ⚠️ **注意**: Vercel 不支持本地存储。请使用 GitHub 或 R2 存储。

### Vercel 数据库选项

- **[Neon](https://neon.tech/)** - 无服务器 PostgreSQL（推荐）
- **[Supabase](https://supabase.com/)** - PostgreSQL 及附加功能
- **[PlanetScale](https://planetscale.com/)** - MySQL 兼容的无服务器数据库

---

## 📁 项目结构

```
mo-gallery-web/
├── prisma/                  # 数据库模式和迁移
│   ├── schema.prisma        # Prisma 模型定义
│   ├── seed.ts              # 数据库初始化脚本
│   └── migrations/          # 迁移历史
├── server/lib/              # 服务端工具
│   ├── db.ts                # Prisma 客户端单例
│   ├── jwt.ts               # JWT 工具
│   ├── exif.ts              # EXIF 提取
│   ├── colors.ts            # 主色调提取
│   └── storage/             # 存储抽象层
│       ├── types.ts         # 接口定义
│       ├── factory.ts       # 工厂函数
│       ├── local.ts         # 本地存储实现
│       ├── github.ts        # GitHub 存储实现
│       └── r2.ts            # R2 存储实现
├── hono/                    # API 路由 (Hono.js)
│   ├── index.ts             # 路由聚合
│   ├── auth.ts              # 认证 & Linux DO OAuth
│   ├── photos.ts            # 照片管理（含分页）
│   ├── albums.ts            # 相册管理
│   ├── stories.ts           # 故事/叙事
│   ├── blogs.ts             # 博客文章
│   ├── comments.ts          # 评论（含用户信息）
│   ├── friends.ts           # 友链管理
│   ├── settings.ts          # 系统设置
│   └── middleware/          # 认证中间件
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/             # API 入口（Hono 集成）
│   │   ├── admin/           # 后台管理页面
│   │   │   ├── photos/      # 照片管理
│   │   │   ├── albums/      # 相册管理
│   │   │   ├── friends/     # 友链管理
│   │   │   ├── settings/    # 系统设置
│   │   │   ├── upload/      # 照片上传
│   │   │   ├── storage/     # 存储管理
│   │   │   └── logs/        # 故事编辑器、博客编辑器、操作日志
│   │   ├── gallery/         # 公开画廊页面
│   │   ├── story/           # 故事页面
│   │   ├── blog/            # 博客页面
│   │   ├── they/            # 友链页面
│   │   └── login/           # 登录页面（管理员 & OAuth 回调）
│   ├── components/          # React 组件
│   │   ├── NarrativeTipTapEditor.tsx  # Tiptap 富文本编辑器
│   │   ├── StoryRichContent.tsx       # 故事内容渲染
│   │   ├── tiptap-extensions/         # Tiptap 自定义扩展
│   │   ├── admin/           # 后台专用组件
│   │   │   ├── PhotoSelectorModal.tsx  # 可复用照片选择器
│   │   │   ├── PhotoDetailPanel.tsx    # 照片详情编辑
│   │   │   └── AdminSidebar.tsx        # 后台导航
│   │   ├── gallery/         # 画廊视图组件
│   │   │   ├── GridView.tsx
│   │   │   ├── MasonryView.tsx
│   │   │   └── TimelineView.tsx
│   │   └── ui/              # 通用 UI 组件
│   ├── contexts/            # React Context 提供者
│   │   ├── AuthContext.tsx          # 认证状态
│   │   ├── ThemeContext.tsx         # 主题管理
│   │   ├── LanguageContext.tsx      # 国际化状态
│   │   ├── SettingsContext.tsx      # 站点设置
│   │   └── UploadQueueContext.tsx   # 上传队列管理
│   └── lib/                 # 前端工具
│       ├── api/             # API 客户端模块（按领域拆分）
│       ├── i18n.ts          # 国际化字符串
│       └── utils.ts         # 辅助函数
└── public/                  # 静态资源
```

---

## 📝 开发命令

```bash
# 开发
pnpm run dev           # 启动开发服务器
pnpm run build         # 生产构建
pnpm run start         # 启动生产服务器
pnpm run lint          # 运行 ESLint

# 数据库
pnpm run prisma:dev      # 创建并应用迁移（开发）
pnpm run prisma:deploy   # 应用迁移（生产）
pnpm run prisma:generate # 生成 Prisma 客户端
pnpm run prisma:seed     # 初始化管理员账户
pnpm run prisma:studio   # 打开 Prisma Studio
```

---

## 🔄 最近更新

### 2026-03
- ✏️ **编辑器迁移** - 从 Milkdown/Vditor 迁移到 Tiptap 富文本编辑器
- 🖼️ **可调整大小的图片** - Tiptap 自定义扩展，支持图片缩放和图片组
- 📦 **依赖清理** - 移除 Milkdown 和 Vditor 相关包

### 2026-01
- ✨ **Milkdown 编辑器** - 集成所见即所得 Markdown 编辑器，支持 Slash 命令、拖拽手柄、工具栏
- 📖 **MilkdownViewer** - 新增只读 Markdown 渲染组件，展示页面样式与编辑器一致
- 📸 **照片选择器** - 可复用的照片选择模态框，支持筛选和相册过滤
- 🖼️ **照片管理增强** - 上传时可选择相册，照片网格 UI 优化
- 📄 **照片分页** - 高效的分页加载，故事照片管理改进
- 👥 **友链功能** - 新增友链管理和公开展示页面 (`/they`)
- 🔐 **Linux DO OAuth** - 集成 Linux DO 账号绑定和认证
- 🏠 **首页增强** - 动态粒子效果、自动轮播、随机英雄图片
- 🌐 **国际化更新** - 所有新功能的全面国际化支持
- 🐛 **Bug 修复** - 修复移动端菜单状态、登录页 Suspense 包装

---

## 🤝 贡献

欢迎贡献！请随时提交 Pull Request。

1. Fork 此仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

---

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

<div align="center">

**Made with ❤️ by MO Gallery Contributors**

[报告 Bug](https://github.com/yourusername/mo-gallery/issues) · [功能请求](https://github.com/yourusername/mo-gallery/issues)

</div>
