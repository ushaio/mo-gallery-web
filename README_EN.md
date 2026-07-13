<div align="center">

# 📸 MO Gallery

**An integrated platform for photography publishing, visual storytelling, and gallery management**

MO Gallery combines a **Next.js web application** with a **Wails desktop administration client** for photos, albums, film rolls, stories, blogs, AI-assisted creation, comments, and multiple storage backends.

[![Version](https://img.shields.io/badge/version-0.7.0--beta-2563eb?style=flat-square)](RELEASE.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react)](https://react.dev/)
[![Wails](https://img.shields.io/badge/Wails-2-cb2d3e?style=flat-square)](https://wails.io/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](#-license)

[English](README_EN.md) · [中文](README.md) · [Changelog](RELEASE.md) · [Releases](https://github.com/ushaio/mo-gallery-web/releases)

</div>

---

## 📌 Overview

MO Gallery brings the public photography site, browser-based administration, and a native desktop workspace into one repository:

| Module | Purpose | Main capabilities |
|--------|---------|-------------------|
| **Public Web App** | Publish photography and written content | Gallery, curated photos, albums, film rolls, stories, blogs, friend links, comments, i18n, and themes |
| **Web Admin** | Manage content in the browser | Uploads, album and film-roll management, story editing, storage maintenance, comment moderation, settings, and activity logs |
| **Desktop Admin** | Native desktop workflows | Wails + Go + React, with gallery management, batch uploads, photo journals, Zine, AI assistance, and local file processing |
| **API and Data** | Shared business and data access | Hono API, Prisma/GORM, PostgreSQL, JWT, and Linux DO OAuth |
| **Storage** | Pluggable media storage | Local filesystem, S3-compatible storage, Cloudflare R2, and GitHub repositories |

> The current version is `v0.7.0-beta`. The web application supports Vercel, Docker, and self-hosted Node.js deployments. The current Desktop release workflow builds Windows artifacts.

---

## 🖼️ Screenshots

### Web

> Web screenshots will be added later.

### Desktop

| Sign in | Overview |
|:-------:|:--------:|
| <img src="./README.assets/image-20260706144644323.png" alt="Sign in" width="100%" /> | <img src="./README.assets/image-20260706144716752.png" alt="Overview" width="100%" /> |

| Photo Library | Album Management |
|:-------------:|:----------------:|
| <img src="./README.assets/image-20260706144824799.png" alt="Photo Library" width="100%" /> | <img src="./README.assets/image-20260706144840239.png" alt="Album Management" width="100%" /> |

| Film Roll Management | Image Upload |
|:--------------------:|:------------:|
| <img src="./README.assets/image-20260706144908173.png" alt="Film Roll Management" width="100%" /> | <img src="./README.assets/image-20260706144919453.png" alt="Image Upload" width="100%" /> |

| Photo Journal | Zine |
|:-------------:|:----:|
| <img src="./README.assets/image-20260706144944795.png" alt="Photo Journal" width="100%" /> | <img src="./README.assets/image-20260706144953907.png" alt="Zine" width="100%" /> |

| Zine | AI Chat |
|:----:|:-------:|
| <img src="./README.assets/image-20260706145001773.png" alt="Zine" width="100%" /> | <img src="./README.assets/image-20260706145011594.png" alt="AI Chat" width="100%" /> |

| Storage Maintenance | System Settings |
|:-------------------:|:---------------:|
| <img src="./README.assets/image-20260706145024281.png" alt="Storage Maintenance" width="100%" /> | <img src="./README.assets/image-20260706145052073.png" alt="System Settings" width="100%" /> |

<p align="center"><strong>Friend Link Management</strong></p>
<p align="center"><img src="./README.assets/image-20260706145108246.png" alt="Friend Link Management" width="72%" /></p>

---

## ✨ Core Features

### 📷 Photos, Albums, and Film Rolls

- **Multiple gallery views** — Grid, Masonry, and Timeline layouts with smooth transitions.
- **EXIF extraction** — Automatically reads camera, lens, aperture, shutter speed, ISO, capture time, GPS, and other metadata.
- **Dominant color extraction** — Generates natural-looking loading placeholders from image colors.
- **Album management** — Organize photos into albums with covers, detail pages, and ordering.
- **Film roll management** — Present photos as film rolls with covers, metadata, frame ordering, and batch photo assignment.
- **Batch uploads** — Drag and drop multiple files, compress images, track progress, and select a target album or film roll.
- **Duplicate detection** — Client-side deduplication with SHA-256 hashes.
- **Pagination and visibility** — Efficient large-gallery pagination, filtering, curation, and public visibility controls.
- **Responsive presentation** — Optimized for desktop, tablet, and mobile screens.

### 📖 Stories, Blogs, Photo Journals, and Zine

- **Stories / narratives** — Combine multiple photos with long-form rich-text narratives.
- **TipTap rich-text editor** — WYSIWYG editing with image resizing, tables, alignment, and structured JSON content.
- **Story maps** — Display geotagged story photos with MapLibre GL.
- **Immersive writing** — Long-form editing mode, cover selection, and in-story photo add/remove/reorder workflows.
- **Local drafts** — Automatically preserve story and blog drafts in IndexedDB.
- **Blog system** — Shares the story editor and renderer, with gallery photo insertion and draft/published states.
- **Photo Journal** — Quickly organize everyday photography notes from the Desktop client.
- **Zine** — Compose photography publications in Desktop with preview and export workflows.

### 🤖 AI-Assisted Creation

- Integrated AI chat and editing assistance with multi-turn conversations and context management.
- OpenAI-compatible API support for OpenAI, DeepSeek, and other compatible providers.
- Configurable endpoint, API key, model, and system prompt.
- Multimodal image input, editor AI actions, and image-generation workflows.
- Shared Web and Desktop capabilities through `packages/ai-agent` and `packages/tiptap-editor`.

### 🔐 Web Admin and Desktop Workspace

- **Overview dashboard** — Summarizes content, gallery, and system status.
- **Photo management** — Filtering, pagination, batch actions, visibility, and featured-photo controls.
- **Album and film-roll management** — Create, edit, organize, and reorder related photos.
- **Upload center** — Digital/film upload modes, compression, retries, and progress tracking.
- **Storage maintenance** — Scan storage, detect orphaned or missing files, and manage storage sources.
- **System settings** — Configure site metadata, social links, storage backends, AI services, and Desktop connections.
- **Friend links** — Add, edit, remove, and reorder friend links.
- **Comment moderation** — Manage pending, approved, and rejected comments.
- **Activity logs** — Review important administration actions.

### 💬 Comments, Authentication, and Social Features

- **Dual comment backends** — Local PostgreSQL comments or Waline with LeanCloud.
- **Linux DO OAuth** — Linux DO authentication with username and trust-level display.
- **Comment access control** — Optionally restrict commenting to Linux DO users.
- **Administrator authentication** — Username/password login, JWT, and a configurable hidden login path.
- **Friend links page** — Showcase people and their websites with avatars, descriptions, and cards.

### 🎨 Presentation and Infrastructure

- **Dynamic homepage** — Random hero images, particle effects, an automatic carousel, and scroll-triggered animation.
- **Internationalization** — Built-in Chinese and English interfaces using client-side dictionaries.
- **Theme switching** — Dark, light, and system modes with consistent component styling.
- **Multiple storage backends** — Local, S3-compatible, Cloudflare R2, and GitHub storage with admin-managed storage sources.

---

## 🧱 Architecture

```text
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ Web: Next.js + React         │       │ Desktop: Wails + Go + React │
│ Public site / Web admin      │       │ Native UI / Local workflows │
└──────────────┬───────────────┘       └──────────────┬───────────────┘
               │                                      │
               ▼                                      ├── GORM → PostgreSQL
        Hono API / JWT                                └── HTTP → Web API
               │
               ▼
       Prisma 7 / PostgreSQL
               │
               ▼
   Local / S3 / R2 / GitHub Storage

Shared packages: packages/tiptap-editor · packages/ai-agent
```

### Technology Stack

| Category | Technology |
|----------|------------|
| Web | Next.js 16, React 19, App Router, React Compiler |
| Desktop | Wails 2, Go 1.24, React 19, Vite 6, GORM |
| API | Hono.js embedded in a Next.js Route Handler |
| Database | PostgreSQL 16, Prisma 7 |
| Styling and animation | Tailwind CSS 4, Framer Motion |
| Editor | TipTap 3 and a shared editor package |
| Image processing | Sharp, ExifReader, JS/WASM image compression |
| Maps | MapLibre GL, react-map-gl |
| Authentication | JWT, Linux DO OAuth |
| State and drafts | React Context, Zustand, IndexedDB |
| Storage | Local, S3, Cloudflare R2, GitHub |

---

## 🚀 Quick Start

### Requirements

| Tool | Recommended version | Purpose |
|------|---------------------|---------|
| Node.js | 24.x | Matches the CI build environment |
| pnpm | 10.x | Monorepo dependency management |
| PostgreSQL | 16.x | Web and Desktop database |
| Go | 1.24.x | Required for Desktop development only |
| Wails CLI | 2.12.0 | Required for Desktop development and builds only |

### 1. Clone and Install

```bash
git clone https://github.com/ushaio/mo-gallery-web.git
cd mo-gallery-web
pnpm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

At minimum, configure the database, administrator credentials, and JWT secret:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
DIRECT_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="replace-with-a-strong-password"
JWT_SECRET="replace-with-a-long-random-secret"
```

### 3. Initialize the Database and Start Web

```bash
pnpm run prisma:generate
pnpm run prisma:dev
pnpm run prisma:seed
pnpm run dev
```

Open:

- Public site: `http://localhost:3000`
- Administrator login: `http://localhost:3000/login/admin`
- Custom login route: `/login/{NEXT_PUBLIC_ADMIN_LOGIN_URL}`

### 4. Start Desktop Development

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
cd desktop
wails dev
```

Database, Web API, JWT, storage, and AI settings can be managed from the Desktop settings screen. When Desktop and Web share authentication, Desktop's `api.jwt_secret` must match the Web application's `JWT_SECRET`.

---

## 🖥️ Desktop Builds and Distribution

### Windows Builds

```bash
cd desktop

# Portable: build an EXE that runs without installation
wails build

# Setup: build an NSIS installer with a setup wizard
wails build -nsis
```

Artifacts are written to `desktop/build/bin/`.

| Distribution | Recommended for | Characteristics |
|--------------|-----------------|-----------------|
| **Portable** | Beta testing, internal or temporary use, and environments without administrator access | Runs immediately after download; updates require replacing the EXE manually; no Start menu shortcut or uninstall entry is created automatically |
| **Setup** | Stable releases, general users, frequent updates, and system integration | Supports an installation directory, shortcuts, an uninstall entry, and dependency handling such as WebView2 during setup |

The current GitHub Release workflow runs `wails build`, so it publishes the portable EXE by default. The React/Vite frontend is bundled into the executable with Go `embed`, so no separate static asset directory is required.

### Desktop Configuration Locations

| Platform | Default path |
|----------|--------------|
| Windows | `%APPDATA%\mo-gallery-desktop\config.json` |
| macOS | `~/Library/Application Support/mo-gallery-desktop/config.json` |
| Linux | `~/.config/mo-gallery-desktop/config.json` |

The current Portable build is installation-free, but it is not a completely zero-trace portable application: settings remain after moving or replacing the EXE, and deleting the EXE does not remove the configuration directory. Portable builds are recommended during Beta. For stable releases, use Setup as the default download while continuing to offer Portable for advanced users.

---

## ⚙️ Configuration

See [`.env.example`](.env.example) for the complete template.

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL runtime connection URL |
| `DIRECT_URL` | Direct PostgreSQL URL used by Prisma migrations |
| `ADMIN_USERNAME` | Default administrator username |
| `ADMIN_PASSWORD` | Default administrator password; change it in production |
| `JWT_SECRET` | JWT signing secret; use a strong random value in production |

### Site and Security

| Variable | Description | Default/example |
|----------|-------------|-----------------|
| `NEXT_PUBLIC_ADMIN_LOGIN_URL` | Hidden administrator login path | `admin` |
| `SITE_TITLE` | Site title | `MO GALLERY` |
| `SITE_URL` | Public site URL used by the server | `https://your-domain.com` |
| `NEXT_PUBLIC_SITE_URL` | Public site URL exposed to the browser | `https://your-domain.com` |
| `SITE_AUTHOR` | Author name displayed on the homepage | `MO` |
| `CDN_DOMAIN` | Media CDN domain | Empty |
| `API_ORIGIN_CHECK` | Restrict API request origins | `false` |

### AI Editor

| Variable | Description |
|----------|-------------|
| `AI_BASE_URL` | OpenAI-compatible API root, such as `https://api.openai.com/v1` |
| `AI_API_KEY` | AI provider key |
| `AI_MODEL` | Default chat or editing model |

### Comments and Linux DO OAuth

| Variable | Description |
|----------|-------------|
| `COMMENTS_STORAGE` | `LOCAL`, empty, or `LEANCLOUD` |
| `WALINE_SERVER_URL` | Waline service URL |
| `LEAN_ID` / `LEAN_KEY` / `LEAN_MASTER_KEY` | LeanCloud credentials |
| `LINUXDO_CLIENT_ID` / `LINUXDO_CLIENT_SECRET` | Linux DO OAuth credentials |
| `LINUXDO_REDIRECT_URI` | OAuth callback URL |
| `LINUXDO_ADMIN_USERNAMES` | Comma-separated Linux DO users allowed to become administrators |
| `LINUXDO_COMMENTS_ONLY` | Restrict comments to Linux DO users |

---

## 📦 Deployment

### Docker Compose

Docker Compose starts PostgreSQL and MO Gallery, with persistent volumes for the database and local uploads.

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD, ADMIN_PASSWORD, JWT_SECRET, and other production values

docker compose up -d --build
docker compose logs -f
```

Default addresses:

- Web: `http://localhost:3001`
- PostgreSQL: `localhost:5433`

Change the exposed ports through `APP_PORT` and `DB_PORT` in `.env`.

### Vercel

1. Fork this repository and import it into Vercel.
2. Configure the required values from `.env.example`.
3. Use Neon, Supabase, or another hosted PostgreSQL provider.
4. Store media in S3/R2 or GitHub.
5. `vercel.json` runs Prisma deployment, client generation, and the Next.js build.

> Vercel's runtime filesystem is not suitable for persistent user uploads. Do not use the Local storage backend in production on Vercel.

### Node.js / Self-Hosted

```bash
pnpm run build:node
pnpm run start
```

Configure a reverse proxy, HTTPS, process supervision, and backups according to your environment.

---

## 🧰 Commands

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start the Next.js development server |
| `pnpm run build` | Build the Web production bundle |
| `pnpm run build:vercel` | Deploy/generate/seed Prisma and build for Vercel |
| `pnpm run build:node` | Deploy/generate Prisma and build for self-hosting |
| `pnpm run start` | Start the Web production server |
| `pnpm run lint` | Run ESLint |
| `pnpm run prisma:generate` | Generate Prisma Client |
| `pnpm run prisma:dev` | Create and apply development migrations |
| `pnpm run prisma:deploy` | Apply production migrations |
| `pnpm run prisma:seed` | Seed the database |
| `cd desktop && wails dev` | Start Desktop development mode |
| `cd desktop && wails build` | Build the Desktop Portable EXE |
| `cd desktop && wails build -nsis` | Build the Desktop NSIS installer |
| `cd desktop/frontend && pnpm build` | Validate the Desktop frontend build |

Baseline verification:

```bash
pnpm run lint
pnpm run build
cd desktop/frontend && pnpm build
```

---

## 📁 Project Structure

```text
mo-gallery-web/
├── src/app/                   # Next.js App Router, public pages, and Web admin
├── src/components/            # Shared Web UI, gallery, editor, and admin components
├── src/lib/                   # API clients, i18n dictionaries, and content helpers
├── hono/                      # Hono API routes and middleware
├── server/                    # Database, storage, EXIF, and server infrastructure
├── prisma/                    # Prisma schema, migrations, and seed script
├── packages/
│   ├── ai-agent/              # Shared Web/Desktop AI agent
│   └── tiptap-editor/         # Shared Web/Desktop TipTap editor
├── desktop/                   # Go + Wails Desktop client
│   ├── frontend/              # React/Vite frontend
│   ├── config/                # Desktop configuration management
│   ├── db/                    # GORM data access and models
│   ├── services/              # Photo, upload, AI, storage, and export services
│   ├── build/                 # Icons, Windows manifests, and build artifacts
│   ├── main.go                # Wails entry point and embedded frontend assets
│   └── wails.json             # Wails build configuration
├── public/                    # Web static assets and local uploads
├── README.assets/             # README screenshots
├── tests/                     # Focused feature tests
├── docker-compose.yml         # Web + PostgreSQL orchestration
├── Dockerfile                 # Web container image
└── RELEASE.md                 # Release notes
```

---

## 🔒 Security Notes

- Never commit `.env`, database passwords, JWT secrets, AI keys, or object storage credentials.
- Change the default administrator password and use a strong `JWT_SECRET` in production.
- Keep Desktop and Web JWT configuration aligned when they share authentication.
- Enable HTTPS for public deployments and consider enabling `API_ORIGIN_CHECK`.
- Back up PostgreSQL, media objects, and storage source configuration regularly.
- Code-sign production Windows Desktop releases to reduce SmartScreen warnings.

---

## ❓ FAQ

<details>
<summary><strong>Why does the Desktop app run immediately after download?</strong></summary>

`wails build` produces an installation-free EXE by default. The React/Vite frontend is embedded with Go `embed`, and modern Windows installations generally already include the WebView2 Runtime.

</details>

<details>
<summary><strong>Should I choose Portable or Setup?</strong></summary>

Choose Portable for Beta testing, internal use, and systems without installation privileges. Choose Setup for stable releases aimed at general users. A production release can offer both.

</details>

<details>
<summary><strong>Why should Vercel deployments avoid Local storage?</strong></summary>

Vercel function filesystems are not designed to persist user uploads. Use S3, Cloudflare R2, GitHub, or another external storage backend.

</details>

---

## 📜 License

Released under the **MIT License**.