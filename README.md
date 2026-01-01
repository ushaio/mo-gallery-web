<div align="center">

# 📸 MO Gallery

**A modern, feature-rich photo gallery application with integrated backend**

一个现代化的图片画廊应用，前后端集成，支持多种部署方式和存储后端

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Hono](https://img.shields.io/badge/Hono-API-orange?style=flat-square)](https://hono.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

[English](#features) | [中文](#功能特性)

</div>

---

## ✨ Features

### 📷 Photo Gallery
- **Multiple View Modes** - Grid, Masonry (waterfall), and Timeline views
- **EXIF Data Extraction** - Automatically extracts camera, lens, aperture, shutter speed, ISO, and more
- **Dominant Color Extraction** - Automatically extracts primary colors from images
- **Album Management** - Organize photos into albums
- **Batch Upload** - Upload multiple photos with progress tracking

### 📖 Stories / Narratives
- Create photo stories by combining multiple images
- Rich text descriptions with Markdown support
- Beautiful story presentation layout

### 👥 Friend Links (They Page)
- Showcase your friends and their websites
- Customizable avatars and descriptions

### 💬 Comment System
- Support for Linux DO OAuth authentication
- Comment moderation in admin panel
- Optional: Restrict comments to Linux DO users only

### 🔐 Admin Dashboard
- Comprehensive photo management
- Album and story management
- Blog post editor with Markdown
- System settings configuration
- Comment moderation
- Activity logs

### 🌍 Internationalization
- Chinese (中文) and English support
- Easy to extend for more languages

### 🎨 Theming
- Dark and Light mode support
- Smooth theme transitions
- System preference detection

### ☁️ Multiple Storage Backends
- **Local Storage** - Store files on local filesystem
- **GitHub** - Use GitHub repository as storage
- **Cloudflare R2** - S3-compatible object storage

---

## 功能特性

### 📷 照片画廊
- **多种视图模式** - 宫格、瀑布流、时间线视图
- **EXIF 信息提取** - 自动提取相机、镜头、光圈、快门、ISO 等信息
- **主色调提取** - 自动提取图片主色调
- **相册管理** - 将照片组织到相册中
- **批量上传** - 支持多图上传，显示上传进度

### 📖 故事/叙事
- 将多张照片组合成故事
- 支持 Markdown 富文本描述
- 精美的故事展示布局

### 👥 友链功能（They 页面）
- 展示朋友及其网站
- 可自定义头像和描述

### 💬 评论系统
- 支持 Linux DO OAuth 认证
- 后台评论审核
- 可选：仅限 Linux DO 用户评论

### 🔐 后台管理系统
- 全面的照片管理
- 相册和故事管理
- Markdown 博客编辑器
- 系统设置配置
- 评论审核
- 操作日志

### 🌍 多语言支持
- 中文和英文支持
- 易于扩展更多语言

### 🎨 主题切换
- 深色/浅色模式
- 平滑的主题过渡
- 跟随系统偏好

### ☁️ 多种存储后端
- **本地存储** - 存储在本地文件系统
- **GitHub** - 使用 GitHub 仓库作为存储
- **Cloudflare R2** - S3 兼容的对象存储

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 15 (App Router) |
| **API** | Hono.js |
| **Database ORM** | Prisma |
| **Styling** | Tailwind CSS 4 |
| **Animation** | Framer Motion |
| **Database** | SQLite / PostgreSQL |
| **Image Processing** | Sharp, ExifReader |
| **Authentication** | JWT, Linux DO OAuth |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- PostgreSQL (production) or SQLite (development)

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/mo-gallery.git
cd mo-gallery

# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env
# Edit .env file with your settings

# Initialize database
pnpm run prisma:dev

# Start development server
pnpm run dev
```

Visit `http://localhost:3000` to see your gallery!

### Minimal Environment Variables

```env
# Database (SQLite for local development)
DATABASE_URL="file:./dev.db"
DIRECT_URL="file:./dev.db"

# JWT Secret (change in production!)
JWT_SECRET="your-secret-key"

# Admin credentials (for initial seed)
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
```

---

## ⚙️ Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Database connection URL | `file:./dev.db` or PostgreSQL URL |
| `DIRECT_URL` | Direct database URL (for migrations) | Same as DATABASE_URL |
| `JWT_SECRET` | Secret key for JWT tokens | `your-secret-key` |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_USERNAME` | Admin username for seed | `admin` |
| `ADMIN_PASSWORD` | Admin password for seed | `admin123` |
| `NEXT_PUBLIC_ADMIN_LOGIN_URL` | Hidden admin login path | - |
| `SITE_TITLE` | Site title | `MO GALLERY` |
| `CDN_DOMAIN` | CDN domain for assets | - |

### Linux DO OAuth (Optional)

| Variable | Description |
|----------|-------------|
| `LINUXDO_CLIENT_ID` | OAuth Client ID |
| `LINUXDO_CLIENT_SECRET` | OAuth Client Secret |
| `LINUXDO_REDIRECT_URI` | Callback URL (e.g., `https://your-domain.com/login/callback`) |
| `LINUXDO_COMMENTS_ONLY` | Restrict comments to Linux DO users (`true`/`false`) |

---

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Start with PostgreSQL
docker-compose up -d

# View logs
docker-compose logs -f
```

### Manual Docker Build

```bash
# Build image
docker build -t mo-gallery .

# Run container
docker run -p 3000:3000 --env-file .env mo-gallery
```

---

## ▲ Vercel Deployment

1. **Fork** this repository
2. **Import** the project in Vercel
3. **Configure** environment variables (see `.env.example`)
4. **Set** build command to `pnpm run build:vercel`
5. **Use** Neon or Supabase as your database

> ⚠️ **Note**: Local storage is not supported on Vercel. Use GitHub or R2 storage instead.

### Database Options for Vercel

- **[Neon](https://neon.tech/)** - Serverless PostgreSQL (recommended)
- **[Supabase](https://supabase.com/)** - PostgreSQL with additional features
- **[PlanetScale](https://planetscale.com/)** - MySQL-compatible serverless database

---

## 📁 Project Structure

```
mo-gallery-web/
├── prisma/              # Database schema and migrations
│   └── schema.prisma    # Prisma model definitions
├── server/lib/          # Server-side utilities
│   ├── db.ts            # Prisma client
│   ├── jwt.ts           # JWT utilities
│   ├── exif.ts          # EXIF extraction
│   ├── colors.ts        # Dominant color extraction
│   └── storage/         # Storage abstraction layer
│       ├── types.ts     # Interface definitions
│       ├── factory.ts   # Factory function
│       ├── local.ts     # Local storage
│       ├── github.ts    # GitHub storage
│       └── r2.ts        # R2 storage
├── hono/                # API routes (Hono.js)
│   ├── index.ts         # Route aggregation
│   ├── auth.ts          # Authentication
│   ├── photos.ts        # Photo management
│   ├── albums.ts        # Album management
│   ├── stories.ts       # Stories/Narratives
│   ├── blogs.ts         # Blog posts
│   ├── comments.ts      # Comments
│   ├── friends.ts       # Friend links
│   ├── settings.ts      # Settings
│   └── middleware/      # Middleware
├── src/
│   ├── app/             # Next.js App Router
│   │   ├── api/         # API entry point
│   │   ├── admin/       # Admin dashboard
│   │   ├── gallery/     # Gallery page
│   │   ├── story/       # Story pages
│   │   ├── blog/        # Blog pages
│   │   └── they/        # Friend links page
│   ├── components/      # React components
│   │   ├── admin/       # Admin components
│   │   ├── gallery/     # Gallery components
│   │   └── ui/          # Common UI components
│   ├── contexts/        # React Context providers
│   │   ├── AuthContext.tsx
│   │   ├── ThemeContext.tsx
│   │   ├── LanguageContext.tsx
│   │   └── SettingsContext.tsx
│   └── lib/             # Frontend utilities
│       ├── api.ts       # API client
│       ├── i18n.ts      # Internationalization
│       └── utils.ts
└── public/              # Static assets
```

---

## 📝 Development Commands

```bash
# Development
pnpm run dev           # Start development server
pnpm run build         # Build for production
pnpm run start         # Start production server
pnpm run lint          # Run ESLint

# Database
pnpm run prisma:dev      # Create and apply migrations (development)
pnpm run prisma:deploy   # Apply migrations (production)
pnpm run prisma:generate # Generate Prisma client
pnpm run prisma:seed     # Initialize admin account
pnpm run prisma:studio   # Open Prisma Studio
```

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Made with ❤️ by MO Gallery Contributors**

[Report Bug](https://github.com/yourusername/mo-gallery/issues) · [Request Feature](https://github.com/yourusername/mo-gallery/issues)

</div>
