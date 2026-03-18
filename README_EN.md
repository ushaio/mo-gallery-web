<div align="center">

# 📸 MO Gallery

**A modern photo gallery and narrative blog platform with integrated backend, multiple deployment options, and storage backends**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Hono](https://img.shields.io/badge/Hono-API-orange?style=flat-square)](https://hono.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS_4-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

English | [中文](README.md)

</div>

Vercel deployment recommended. Docker deployment has not been fully tested.

---

## ✨ Features

### 📷 Photo Gallery
- **Multiple View Modes** — Grid, Masonry, and Timeline views with smooth transitions
- **EXIF Data Extraction** — Automatically extracts camera, lens, aperture, shutter speed, ISO, and more
- **Dominant Color Extraction** — Extracts primary colors from images for beautiful placeholders
- **Album Management** — Organize photos into albums with cover images and album detail pages
- **Batch Upload** — Upload multiple photos with compression and progress tracking, select target album
- **Duplicate Detection** — Client-side deduplication via SHA-256 hashing
- **Photo Pagination** — Efficient pagination for large photo collections
- **Responsive Design** — Optimized for desktop, tablet, and mobile devices

### 📖 Stories / Narratives
- Combine multiple photos into stories with rich text narrative content
- **TipTap Rich Text Editor** — WYSIWYG editing with image resizing, tables, alignment, and more
- Immersive editing mode for long-form writing
- Photo management within stories (add / remove / reorder)
- Cover photo selection
- Local draft auto-save (IndexedDB)

### ✍️ Blog System
- Shares the **TipTap WYSIWYG editor** with the narrative system for a unified editing experience
- Consistent content rendering between editor and published pages
- One-click photo insertion from gallery
- Publish / draft status management
- Local draft auto-save

### 👥 Friend Links (They Page)
- Showcase friends and their websites
- Customizable avatars and descriptions
- Admin management interface
- Card-based display layout

### 💬 Comment System
- **Dual Backend Support** — Local database comments or Waline (LeanCloud)
- **Linux DO OAuth Integration** — Seamless authentication with Linux DO accounts
- Comment moderation in admin panel (pending → approved / rejected)
- Display Linux DO usernames and trust levels
- Optional: restrict comments to Linux DO users only

### 🔐 Admin Dashboard
- **Photo Management** — Comprehensive photo management with filtering and pagination
- **Album Management** — Create, edit, and organize albums
- **Story Management** — Create and manage photo stories with photo selection and ordering
- **Blog Editor** — TipTap WYSIWYG editor
- **Friend Links Management** — Add, edit, and remove friend links
- **Storage Management** — Scan storage status, detect orphaned and missing files
- **System Settings** — Configure site title, description, social links, and more
- **Comment Moderation** — Review and manage user comments

### 🏠 Homepage
- **Dynamic Hero Section** — Random hero images from your gallery
- **Particle Effects** — Animated particle background
- **Auto Carousel** — Automatic image slideshow
- **Scroll Animations** — Smooth scroll-triggered animations

### 🌍 Internationalization
- Chinese and English
- Client-side i18n via React Context

### 🎨 Theming
- Dark / Light / System preference
- Smooth theme transitions
- Consistent styling across all components

### ☁️ Multiple Storage Backends
- **Local Storage** — Store files on local filesystem
- **Cloudflare R2** — S3-compatible object storage
- **GitHub** — Use a GitHub repository as storage

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 16 (App Router) + React 19 |
| **Language** | TypeScript 5 (strict mode) |
| **API** | Hono.js (embedded in Next.js) |
| **Database** | PostgreSQL + Prisma 6 |
| **Styling** | Tailwind CSS 4 |
| **Animation** | Framer Motion |
| **Image Processing** | Sharp, ExifReader |
| **Rich Text Editor** | TipTap 3 |
| **Authentication** | JWT + Linux DO OAuth |
| **State Management** | React Context |
| **Build Optimization** | React Compiler |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- PostgreSQL

### Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/mo-gallery.git
cd mo-gallery

# Install dependencies
pnpm install

# Configure environment variables
cp .env.example .env
# Edit .env with your database connection and admin credentials

# Generate Prisma client and initialize database
pnpm run prisma:generate
pnpm run prisma:dev

# Start development server
pnpm run dev
```

Visit `http://localhost:3000` to see your gallery, and `/login/admin` to access the admin dashboard.

### Minimal Environment Variables

```env
# Database (required)
DATABASE_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
DIRECT_URL="postgresql://postgres:password@localhost:5432/mo_gallery"

# Admin credentials
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="admin123"
```

---

## ⚙️ Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql://postgres:password@localhost:5432/mo_gallery` |
| `DIRECT_URL` | Direct database URL (for migrations) | Same as above |

### Site Configuration (Optional)

| Variable | Description | Default |
|----------|-------------|---------|
| `ADMIN_USERNAME` | Admin username | `admin` |
| `ADMIN_PASSWORD` | Admin password | `admin123` |
| `NEXT_PUBLIC_ADMIN_LOGIN_URL` | Hidden admin login path | `admin` |
| `SITE_TITLE` | Site title | `MO GALLERY` |
| `SITE_URL` | Site URL (for SEO) | — |
| `NEXT_PUBLIC_SITE_URL` | Public site URL (client-side) | — |
| `SITE_AUTHOR` | Author name (shown on homepage) | `MO` |
| `CDN_DOMAIN` | CDN domain for assets | — |
| `API_ORIGIN_CHECK` | Enable API origin check | `false` |

### Comments (Optional)

| Variable | Description |
|----------|-------------|
| `COMMENTS_STORAGE` | Comment storage: empty for local DB, `LEANCLOUD` for Waline |
| `WALINE_SERVER_URL` | Waline server URL (when using LeanCloud) |
| `LEAN_ID` | LeanCloud App ID |
| `LEAN_KEY` | LeanCloud App Key |
| `LEAN_MASTER_KEY` | LeanCloud Master Key |

### Linux DO OAuth (Optional)

| Variable | Description |
|----------|-------------|
| `LINUXDO_CLIENT_ID` | OAuth Client ID |
| `LINUXDO_CLIENT_SECRET` | OAuth Client Secret |
| `LINUXDO_REDIRECT_URI` | Callback URL (e.g., `https://your-domain.com/login/callback`) |
| `LINUXDO_ADMIN_USERNAMES` | Allowed admin usernames (comma-separated) |
| `LINUXDO_COMMENTS_ONLY` | Restrict comments to Linux DO users (`true`/`false`) |

### Social Links (Optional)

```env
SOCIAL_LINKS='[
    {"title":"GitHub","url":"https://github.com/username","icon":"lucide:github"},
    {"title":"Twitter","url":"https://twitter.com/username","icon":"lucide:twitter"}
]'
```

Icons use [Iconify](https://icon-sets.iconify.design/) format.

---

## 🐳 Docker Deployment

### Using Docker Compose (Recommended)

```bash
# Configure environment variables
cp .env.example .env
# Edit .env file

# Start with PostgreSQL
docker-compose up -d

# View logs
docker-compose logs -f
```

### Manual Docker Build

```bash
docker build -t mo-gallery .
docker run -p 3000:3000 --env-file .env mo-gallery
```

---

## ▲ Vercel Deployment

1. **Fork** this repository
2. **Import** the project in Vercel
3. **Configure** environment variables (see `.env.example`)
4. **Set** build command to `pnpm run build:vercel`
5. **Use** Neon or Supabase as your database

> ⚠️ **Note**: Local storage is not supported on Vercel. Use Cloudflare R2 or GitHub storage instead.

### Database Options for Vercel

- **[Neon](https://neon.tech/)** — Serverless PostgreSQL (recommended)
- **[Supabase](https://supabase.com/)** — PostgreSQL with additional features

---

## 📁 Project Structure

```
mo-gallery-web/
├── prisma/                  # Database schema and migrations
│   ├── schema.prisma        # Prisma model definitions
│   ├── seed.ts              # Database seeding script
│   └── migrations/          # Migration history
├── server/lib/              # Server-side utilities
│   ├── db.ts                # Prisma client singleton (with timezone handling)
│   ├── jwt.ts               # JWT utilities
│   ├── exif.ts              # EXIF extraction
│   ├── colors.ts            # Dominant color extraction
│   └── storage/             # Storage abstraction layer (local / R2 / GitHub)
├── hono/                    # API routes (Hono.js)
│   ├── index.ts             # Route registration
│   ├── auth.ts              # Authentication & OAuth
│   ├── photos.ts            # Photo management
│   ├── albums.ts            # Album management
│   ├── stories.ts           # Stories / Narratives
│   ├── blogs.ts             # Blog posts
│   ├── comments.ts          # Comments
│   ├── friends.ts           # Friend links
│   ├── storage.ts           # Storage management
│   ├── equipment.ts         # Equipment management
│   ├── settings.ts          # System settings
│   ├── waline.ts            # Waline comment proxy
│   └── middleware/          # Auth and origin-check middleware
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/             # API entry point (Hono integration)
│   │   ├── admin/           # Admin dashboard pages
│   │   ├── gallery/         # Public gallery
│   │   ├── story/           # Story pages
│   │   ├── blog/            # Blog pages
│   │   ├── they/            # Friend links page
│   │   ├── about/           # About page
│   │   └── login/           # Login (admin & OAuth callback)
│   ├── components/          # React components
│   │   ├── NarrativeTipTapEditor.tsx  # TipTap rich text editor
│   │   ├── StoryRichContent.tsx       # Unified content renderer
│   │   ├── tiptap-extensions/         # Custom TipTap extensions
│   │   ├── admin/           # Admin-specific components
│   │   ├── gallery/         # Gallery views (Grid / Masonry / Timeline)
│   │   └── ui/              # Common UI components
│   ├── contexts/            # React Context providers
│   │   ├── AuthContext.tsx
│   │   ├── ThemeContext.tsx
│   │   ├── LanguageContext.tsx
│   │   ├── SettingsContext.tsx
│   │   └── UploadQueueContext.tsx
│   └── lib/                 # Frontend utilities
│       ├── api/             # API client modules (domain-based)
│       ├── i18n.ts          # Internationalization dictionaries
│       └── utils.ts         # Helper functions
└── public/                  # Static assets
```

---

## 📜 License

[MIT](LICENSE)
