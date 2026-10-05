<div align="center">

# 📸 MO Gallery

**A self-hosted photography site and content platform — Next.js front end + browser admin**

MO Gallery is a ready-to-run personal photography site: the **public front end** publishes photos and long-form stories, while the **web admin** manages photos, albums, film rolls, stories, blogs, and storage right in the browser. The same Hono API and data layer can be reused by other clients such as the desktop and mobile apps.

<a href="https://linux.do/"><img src="https://img.shields.io/badge/Linux.do-Community-2b6de8?style=flat-square" alt="Linux.do"></a>
[![Version](https://img.shields.io/badge/version-0.8.4-2563eb?style=flat-square)](RELEASE.md)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca?style=flat-square&logo=react)](https://react.dev/)
[![Hono](https://img.shields.io/badge/Hono-4-e36002?style=flat-square&logo=hono)](https://hono.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2d3748?style=flat-square&logo=prisma)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169e1?style=flat-square&logo=postgresql)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-MIT-22c55e?style=flat-square)](#-license)

[English](README_EN.md) · [中文](README.md) · [Changelog](RELEASE.md) · [Releases](https://github.com/ushaio/mo-gallery-web/releases)

</div>

---

## 📌 Overview

MO Gallery has two parts that share one API and data layer:

| Module | Purpose | Main capabilities |
|--------|---------|-------------------|
| **Public site** | Publish photography and written content | Home, gallery, curated, albums, film rolls, stories, blogs, friend links, comments, bilingual UI, light/dark themes |
| **Web admin** | Manage content in the browser | Library, uploads, story and blog editing, AI assistant, storage maintenance, settings, friend links |
| **API and data** | Business API shared by both | Hono routes, Prisma, PostgreSQL, JWT, Linux DO OAuth |
| **Media storage** | Pluggable cloud storage backends | Local filesystem, S3-compatible storage, Cloudflare R2, GitHub repositories |

> [!NOTE]
> The current version is `v0.8.4` (Beta). The web app supports **Vercel**, **Docker Compose**, and **self-hosted Node.js**.

> [!IMPORTANT]
> **The desktop and mobile clients have moved out of this repository.** Since `v0.8.3`, the Wails desktop client is released independently from [`ushaio/emulsion-desktop-v3`](https://github.com/ushaio/emulsion-desktop-v3) (previously `ushaio/emulsion-desktop`); the Flutter mobile client lives in the private `ushaio/emulsion-app` repository. **This repository contains the web site and web admin only**, and its releases no longer bundle desktop or mobile installers.

---

## ✨ Core Features

### 🗂 Unified Library

Photos, albums, and film rolls live in a single workspace, so you stop bouncing between modules:

- Manage photos, albums, and film rolls in one place; legacy photo/album/film-roll routes redirect to the matching library view.
- Browse with grid, masonry, or timeline layouts; grids virtualize by row/column to handle large libraries.
- Search by keyword and filter by tag, type, visibility, featured status, and storage source.
- Inspect and edit title, description, tags, EXIF, location, and related info in the detail sidebar; the color palette sits directly under the preview and copies a color on click.
- Batch selection and batch actions, plus a dedicated large preview with zoom and previous/next navigation.

### 📷 Photos, Albums, and Film Rolls

- **EXIF extraction** — Reads camera, lens, aperture, shutter speed, ISO, capture time, and GPS automatically.
- **Dominant color extraction** — Powers loading placeholders and visual feedback.
- **Album management** — Covers, photo association, ordering, and public visibility.
- **Film roll management** — `135` and `120` formats, film presets, roll metadata, frame count, and frame ordering.
- **Batch uploads** — Digital and film upload modes with drag-and-drop, compression, progress, retries, and target selection.
- **Duplicate detection** — Identifies duplicates by file hash.
- **Upload pipeline** — EXIF, dominant colors, thumbnails, and target-size compression are provided by the shared `@mo-gallery/image-pipeline` package.

### ✍️ Stories, Blogs, and Editors

- **Photo narratives** — Combine multiple photos with long-form writing, plus story maps, cover cropping, and in-story photo ordering.
- **Blog** — Shares the editor and renderer with stories, with draft/published states and gallery photo insertion.
- **Milkdown editor** — The body editor and read-only renderer come from the shared `@mo-gallery/milkdown` package, supporting image cards, galleries, and embedded media.
- **TipTap editor** — Structured JSON content with headings, lists, quotes, code, tables, image groups, colors, and font sizes.
- **AI assistance** — Continue, rewrite, and apply controlled direct edits from inside the editor.
- **Local drafts** — Drafts are kept in IndexedDB to reduce loss on unexpected exits.
- **Copy for WeChat Official Account** — Converts the body into `text/html` with inline styles (and table-based galleries) so pasting preserves the layout.

### 💬 Comments, Authentication, and Social

- **Switchable comment backends** — Local PostgreSQL comments, or Waline with LeanCloud.
- **Linux DO OAuth** — Linux DO sign-in with user info display, and an option to restrict commenting to Linux DO users.
- **Admin authentication** — Username/password (bcrypt verified in the database), JWT (HS256), login rate limiting, and a configurable hidden login path.
- **Friend links** — Public showcase plus admin add/edit/reorder.

### ⚙️ Web Admin

The sidebar has seven modules: **Library · Upload · Stories · AI Assistant · Storage · Settings · Friend Links**.

- **Library** — Unified photo/album/film-roll management and batch actions.
- **Upload** — Digital and film tabs with progress and results.
- **Stories** — Story and blog lists, draft recovery, asset panel, and full-screen asset preview.
- **AI Assistant** — Multi-turn chat, message edit-and-resend, fork from message, token usage display, and a system-prompt drawer.
- **Storage** — Scan storage, detect orphaned or missing files, and manage storage sources.
- **Settings** — Site info, social links, storage backends, AI services, WeChat binding, and account configuration.
- **Friend Links** — Add, edit, remove, and reorder friend links.

---

## 🔧 Optional Capabilities

These are off by default; enable them as needed:

> [!TIP]
> "WeChat Official Account articles (draft box / published records)" is implemented but **not enabled yet** — it needs a certified official account to be connected. **WeChat material management is unaffected and remains available.**

| Capability | How to enable | Notes |
|------------|---------------|-------|
| WeChat material management | Enter AppID / AppSecret under **Settings → Account** | The server proxies WeChat APIs; binding requires whitelisting the server's public egress IP on WeChat's side |
| WeChat article list | `WECHAT_ARTICLES_ENABLED=1` | Off by default (returns 403); the UI entry is not mounted yet |
| AI editor | Configure `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` | Other features work without it |
| Linux DO sign-in | Configure `LINUXDO_CLIENT_ID` etc. | Falls back to username/password login |
| AMap tiles | `NEXT_PUBLIC_MAP_PROVIDER=amap` + `NEXT_AMAP_KEY` | Carto is the default |

---

## 🧱 Architecture

```text
┌────────────────────────────────────────────────────────┐
│  Public site / Web admin                               │
│  Next.js 16 App Router · React 19 · Tailwind CSS 4     │
└───────────────────────────┬────────────────────────────┘
                            │  fetch
                            ▼
                 src/app/api/[[...route]]/route.ts
                            │
                            ▼
              Hono routes  hono/*  ·  JWT middleware
                            │
                            ▼
                Prisma 7  +  PostgreSQL 16
                            │
                            ▼
        Local / S3-compatible / Cloudflare R2 / GitHub

Shared packages (packages/*, synced from mo-gallery-shared)
  api-client · ai-agent · milkdown · tiptap-editor · mo-editor
  content-core · image-pipeline · public-site · admin-console
```

### Data Boundaries

- **Cloud business data** — Photos, albums, film rolls, stories, blogs, comments, and settings live in PostgreSQL.
- **Cloud media files** — Stored in the configured Local, S3-compatible, R2, or GitHub storage source.
- **Client-local data** — Desktop/mobile local libraries and upload queues are managed by those clients and are out of scope for this repository.

### Technology Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16 (App Router), React 19, React Compiler |
| API | Hono 4, Next.js Route Handler, Zod |
| Database | PostgreSQL 16, Prisma 7 (`@prisma/adapter-pg`) |
| Styling and animation | Tailwind CSS 4, Framer Motion, Lucide / Iconify |
| Rich text | Milkdown, TipTap 3, React Markdown, Shiki |
| Image processing | Sharp, ExifReader, `@jsquash/*` (JS/WASM compression), `@mo-gallery/image-pipeline` |
| Maps | MapLibre GL, react-map-gl (AMap switchable) |
| Authentication | JWT (HS256), bcrypt, Linux DO OAuth |
| State and drafts | React Context, Zustand, IndexedDB |
| Storage | Local, S3-compatible, Cloudflare R2, GitHub |

---

## 📦 Shared Packages

`packages/*` are **mirrors of the `mo-gallery-shared` repository**, not an editing source: the source lives in `../mo-gallery-shared` and is synced one-way by that repository's `pnpm sync`. **Do not edit the mirrored files directly.** Packages reference each other with `workspace:*` and ship TypeScript sources directly (`main` points at `src/index.ts`, no build output).

| Package | Description |
|---------|-------------|
| `@mo-gallery/api-client` | API client, DTOs, and endpoint contracts (including the `mo-cloud` submodule) |
| `@mo-gallery/ai-agent` | Editor AI domain protocol and Vercel AI SDK runtime |
| `@mo-gallery/milkdown` | Milkdown rich-text editor wrapper |
| `@mo-gallery/tiptap-editor` | TipTap rich-text editor |
| `@mo-gallery/mo-editor` | Shared editor components |
| `@mo-gallery/content-core` | Personal-site content domain: publication state machine and rules (pure TS, no Prisma/Next) |
| `@mo-gallery/image-pipeline` | Server-side image pipeline: EXIF, dominant colors, thumbnails, target-size compression |
| `@mo-gallery/public-site` | Visitor-site components (grid, lightbox, album, film roll, article, comments), host-agnostic |
| `@mo-gallery/admin-console` | Admin shell and design system (rail, top bar, modal, confirm dialog) with host-injected navigation and routing |

---

## 🚀 Quick Start

### Requirements

| Tool | Recommended version | Purpose |
|------|---------------------|---------|
| Node.js | `>=20.9.0` (24.x recommended) | Running and building the app |
| pnpm | 10.x | Dependency management |
| PostgreSQL | 16.x | Business database |

### 1. Clone and Install

```bash
git clone https://github.com/ushaio/mo-gallery-web.git
cd mo-gallery-web
pnpm install
```

`pnpm-workspace.yaml` includes only `packages/*`.

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

At minimum, configure the database, admin credentials, JWT secret, and secrets encryption key:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
DIRECT_URL="postgresql://postgres:password@localhost:5432/mo_gallery"
ADMIN_USERNAME="replace-with-a-non-default-admin-name"
ADMIN_PASSWORD="replace-with-a-long-unique-password"
JWT_SECRET="replace-with-a-long-random-secret"
SECRETS_ENCRYPTION_KEY="replace-with-an-independent-long-random-secret"
```

See [`.env.example`](.env.example) for the complete template.

### 3. Initialize the Database and Start

```bash
pnpm run prisma:generate
pnpm run prisma:dev
pnpm run prisma:seed
pnpm run dev
```

Open:

- Public site: `http://localhost:3000`
- Admin login (no security suffix): `http://localhost:3000/login`
- Admin login (with security suffix): `http://localhost:3000/login/{ADMIN_LOGIN_URL}`

> [!CAUTION]
> Changing the admin login suffix immediately invalidates existing admin sessions. Other clients (desktop/mobile) must connect with the full `/login/{ADMIN_LOGIN_URL}` URL; the site root alone is rejected.

---

## ⚙️ Configuration

### Required

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL runtime connection URL |
| `DIRECT_URL` | Direct PostgreSQL URL used by Prisma migrations |
| `ADMIN_USERNAME` | Admin username; **do not keep the default** |
| `ADMIN_PASSWORD` | Admin password; **do not keep the default** |
| `JWT_SECRET` | JWT signing secret (HS256, at least 32 random bytes in production) |
| `SECRETS_ENCRYPTION_KEY` | AES-256-GCM key for secrets stored in the database (e.g. storage credentials). Derived from `JWT_SECRET` when empty; configure independently in production |

Generate a random key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Site and Security

| Variable | Description | Default/example |
|----------|-------------|-----------------|
| `ADMIN_LOGIN_URL` | Admin login security suffix; empty uses `/login` | Empty |
| `NEXT_PUBLIC_ADMIN_LOGIN_URL` | Legacy fallback used when `ADMIN_LOGIN_URL` is unset | Empty |
| `SITE_TITLE` | Site title | `MO GALLERY` |
| `SITE_URL` | Public site URL used by the server | `https://your-domain.com` |
| `NEXT_PUBLIC_SITE_URL` | Public site URL exposed to the browser | `https://your-domain.com` |
| `SITE_AUTHOR` | Author name shown on the homepage | `MO` |
| `CDN_DOMAIN` | Media CDN domain | Empty |
| `TRUSTED_PROXY_MODE` | Trusted reverse proxy: `cloudflare` / `vercel` / `forwarded`; client-supplied `X-Forwarded-For` is ignored when unset | `forwarded` |
| `API_ORIGIN_CHECK` | Restrict API request origins | `false` |
| `SOCIAL_LINKS` | Footer social links, JSON array; `icon` is an Iconify name | See `.env.example` |

### Maps

| Variable | Description | Default/example |
|----------|-------------|-----------------|
| `NEXT_PUBLIC_MAP_PROVIDER` | Story map provider: `carto` or `amap` | `carto` |
| `NEXT_AMAP_KEY` | Web (JS API) key when using `amap` | Empty |
| `NEXT_AMAP_SECURITY_JS_CODE` | AMap security code (recommended for JS API 2.0) | Empty |

### AI Editor (optional)

| Variable | Description |
|----------|-------------|
| `AI_BASE_URL` | OpenAI-compatible API root, e.g. `https://api.openai.com/v1` |
| `AI_API_KEY` | AI provider key |
| `AI_MODEL` | Default model |
| `AI_VISION_MODELS` | Comma-separated model IDs allowed to accept images |
| `AI_TOOL_MODELS` | Comma-separated model IDs allowed to call tools |
| `AI_STRUCTURED_OUTPUT_MODELS` | Comma-separated model IDs allowed to return structured output |
| `AI_MODEL_CONTEXT_WINDOWS` | Context windows as a **single-line** JSON object (`{"model-id": tokens}`); keys must match the ids returned by `${AI_BASE_URL}/models`, unknown ids fall back to 8192 |

> [!WARNING]
> Writing `AI_MODEL_CONTEXT_WINDOWS` across multiple lines makes dotenv parse it as `{"`, which breaks the AI editor entirely. See [`.env.example`](.env.example).

### Comments and Linux DO OAuth (optional)

| Variable | Description |
|----------|-------------|
| `COMMENTS_STORAGE` | `LOCAL`, empty, or `LEANCLOUD` |
| `WALINE_SERVER_URL` | Waline service URL |
| `LEAN_ID` / `LEAN_KEY` / `LEAN_MASTER_KEY` | LeanCloud credentials |
| `LINUXDO_CLIENT_ID` / `LINUXDO_CLIENT_SECRET` | Linux DO OAuth credentials |
| `LINUXDO_REDIRECT_URI` | OAuth callback URL, e.g. `https://your-domain.com/login/callback` |
| `LINUXDO_ADMIN_USERNAMES` | Comma-separated Linux DO users allowed to become admins |
| `LINUXDO_COMMENTS_ONLY` | Restrict comments to Linux DO users |

### WeChat Official Account (optional)

| Variable | Description |
|----------|-------------|
| `WECHAT_EGRESS_IP` | Fallback for the server's self-checked egress IP; the authoritative IP comes from WeChat's `40164` error |
| `WECHAT_ARTICLES_ENABLED` | Set to `1` to enable the article list API (off by default) |

Binding and material management are proxied by the server. AppID / AppSecret are entered under **Settings → Account**, stored as AES-256-GCM ciphertext, and never echoed back.

---

## 📦 Deployment

### Docker Compose

Docker Compose starts PostgreSQL and MO Gallery with persistent volumes for the database and local uploads.

```bash
cp .env.example .env
# Set POSTGRES_PASSWORD, ADMIN_PASSWORD, JWT_SECRET, SECRETS_ENCRYPTION_KEY, and other production values

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
4. Store media in S3, R2, or GitHub.
5. `vercel.json` runs Prisma deployment, client generation, and the Next.js build.

> [!IMPORTANT]
> Vercel's runtime filesystem is not suitable for persistent user uploads. Do **not** use the Local storage backend in production on Vercel.

### Node.js / Self-Hosted

```bash
pnpm run build:node
pnpm run start
```

Configure a reverse proxy, HTTPS, process supervision, database backups, and media storage backups for production.

---

## 🧰 Commands

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start the Next.js development server |
| `pnpm run build` | Build the production bundle |
| `pnpm run start` | Start the production server |
| `pnpm run lint` | Run ESLint |
| `pnpm run build:vercel` | Prisma deploy + generate + seed + Vercel build |
| `pnpm run build:node` | Prisma deploy + generate + self-hosted build |
| `pnpm run prisma:generate` | Generate Prisma Client |
| `pnpm run prisma:dev` | Create and apply development migrations |
| `pnpm run prisma:deploy` | Apply production migrations |
| `pnpm run prisma:seed` | Seed the database |

Focused tests (run directly with `node --import tsx`, no extra test framework):

| Command | Description |
|---------|-------------|
| `pnpm run test:editor-ai-routes` | Editor AI API routes |
| `pnpm run test:editor-ai-images` | Editor AI image handling |
| `pnpm run test:story-ai-images` | Story AI image handling |
| `pnpm run test:security` | Secret encryption (OAuth state, field encryption and masking) |

---

## 📁 Project Structure

```text
mo-gallery-web/
├── src/app/                    # Next.js App Router: public pages (gallery / story / blog / curated / they …) and /admin
├── src/components/             # Front-end and admin components (gallery, story, comments, editors, admin/*)
├── src/lib/                    # API clients, i18n dictionaries, draft and content helpers
├── hono/                       # Hono routes and auth middleware (photos / stories / blogs / albums / film-rolls / wechat …)
├── server/lib/                 # Query, storage, EXIF, and AI building blocks
├── prisma/                     # Prisma schema, migrations, and seed script
├── packages/                   # @mo-gallery/* mirrored shared packages (source in mo-gallery-shared; do not edit)
├── docs/                       # Design docs, requirement specs, and verification matrices
├── tests/                      # Focused tests
├── scripts/                    # Data repair and regression scripts
├── public/                     # Static assets and local uploads
├── README.assets/              # README screenshots
├── docker-compose.yml          # Web + PostgreSQL orchestration
├── Dockerfile                  # Web container image
├── vercel.json                 # Vercel build configuration
├── .env.example                # Environment variable template
└── RELEASE.md                  # User-facing release notes
```

---

## 🔒 Security Notes

- Never commit `.env`, database passwords, JWT secrets, `SECRETS_ENCRYPTION_KEY`, AI keys, or object storage credentials.
- Change the default admin credentials and use a strong random `JWT_SECRET` in production.
- Configure `SECRETS_ENCRYPTION_KEY` independently; previously unencrypted storage/setting secrets are converted to ciphertext when saved again.
- Enable HTTPS for public deployments and set `TRUSTED_PROXY_MODE` correctly for your environment (a wrong value causes spoofed client IP headers to be trusted).
- Consider enabling `API_ORIGIN_CHECK` to restrict API access to the site's own front end.
- Back up PostgreSQL, media files, and storage source configuration regularly.

---

## ❓ FAQ

<details>
<summary><strong>Why are there no desktop / flutter directories?</strong></summary>

Since `v0.8.3` the Wails desktop client is released independently from [`ushaio/emulsion-desktop-v3`](https://github.com/ushaio/emulsion-desktop-v3), and the Flutter mobile client lives in the private `ushaio/emulsion-app` repository. This repository keeps the web site and web admin only; the leftover `flutter/` directory holds build cache and is `.gitignore`d.

</details>

<details>
<summary><strong>Can I edit the code under packages/ directly?</strong></summary>

No. `packages/*` are mirrors of the `mo-gallery-shared` repository; changes are overwritten by the next `pnpm sync`. Edit the source in `mo-gallery-shared` and sync it here.

</details>

<details>
<summary><strong>Why should Vercel deployments avoid Local storage?</strong></summary>

Vercel function filesystems are not designed to persist user uploads. Use S3, Cloudflare R2, GitHub, or another external storage backend.

</details>

<details>
<summary><strong>Why does the AI editor throw <code>AI_MODEL_CONTEXT_WINDOWS must be a valid JSON object</code>?</strong></summary>

The variable must be a **single-line** JSON object. Writing it across multiple lines in `.env` makes dotenv parse only `{`, which fails and disables the AI editor. Correct form:

```env
AI_MODEL_CONTEXT_WINDOWS={"deepseek/deepseek-v4-flash-vision-exp": 1000000, "gpt-5.2": 128000}
```

</details>

<details>
<summary><strong>Why don't the WeChat features work?</strong></summary>

- **Material management**: bind an AppID / AppSecret under **Settings → Account** first, and whitelist the server's public egress IP on WeChat's side. `48001` typically means the account lacks the API permission (common for unverified subscription accounts).
- **Article list (draft box / published records)**: implemented but not enabled yet; it needs `WECHAT_ARTICLES_ENABLED=1` and the UI entry mounted.

</details>

<details>
<summary><strong>Why can't the admin area open after configuring a login suffix?</strong></summary>

Once `ADMIN_LOGIN_URL` is set, you must sign in from `/login/{ADMIN_LOGIN_URL}`; the site root is rejected. Changing the suffix immediately invalidates all existing sessions.

</details>

---

## ❤️ Support

If MO Gallery helps you, consider supporting its continued development.

<p align="center">
  <img src="public/donate_weixin.png" alt="Donate" width="280" />
</p>

---

## 🔗 Friend Links

- [LINUX DO](https://linux.do) — A new idealistic community

---

## 📜 License

Released under the **MIT License**.

---

## ⭐ Star History

<a href="https://www.star-history.com/?repos=ushaio%2Fmo-gallery-web&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=ushaio/mo-gallery-web&type=date&theme=dark&legend=top-left&sealed_token=qu9-MEVV8696GiaTdMhvDBhNScK6ZhwW8caUioDSuVscetrFt1dQthCPFrcPTHCOUqoWTqfwAP8mV3lGTyUDDkfObhTjBJ_Y5iWjBhZytO9z-OUmXVdIVrMTwFI2zZR9aEVxtuBiOdnQem5TdO55JVAxDiveM5-AM8ZjYpjQ_wiOh0rbhaiCtwnIlSgK" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=ushaio/mo-gallery-web&type=date&legend=top-left&sealed_token=qu9-MEVV8696GiaTdMhvDBhNScK6ZhwW8caUioDSuVscetrFt1dQthCPFrcPTHCOUqoWTqfwAP8mV3lGTyUDDkfObhTjBJ_Y5iWjBhZytO9z-OUmXVdIVrMTwFI2zZR9aEVxtuBiOdnQem5TdO55JVAxDiveM5-AM8ZjYpjQ_wiOh0rbhaiCtwnIlSgK" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=ushaio/mo-gallery-web&type=date&legend=top-left&sealed_token=qu9-MEVV8696GiaTdMhvDBhNScK6ZhwW8caUioDSuVscetrFt1dQthCPFrcPTHCOUqoWTqfwAP8mV3lGTyUDDkfObhTjBJ_Y5iWjBhZytO9z-OUmXVdIVrMTwFI2zZR9aEVxtuBiOdnQem5TdO55JVAxDiveM5-AM8ZjYpjQ_wiOh0rbhaiCtwnIlSgK" />
 </picture>
</a>
