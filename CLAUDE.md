# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MO Gallery is a photography gallery and narrative blog platform built with **Next.js 16** (App Router), **Hono** API backend, **Prisma** ORM on PostgreSQL, and **Tailwind CSS 4**. React 19 with React Compiler enabled.

## Commands

```bash
pnpm run dev              # Dev server at localhost:3000
pnpm run build            # Production build
pnpm run lint             # ESLint
pnpm run prisma:generate  # Generate Prisma client after schema changes
pnpm run prisma:dev       # Create and apply migrations in development
pnpm run prisma:deploy    # Apply migrations to production
pnpm run prisma:seed      # Seed database (uses tsx prisma/seed.ts)
```

No test framework is configured. Minimum verification: `pnpm run lint` + successful build.

## Architecture

### API Layer (Hono embedded in Next.js)

The backend is a Hono v4 router mounted at `/api/*` via a Next.js catch-all route:
- **Entry**: `src/app/api/[[...route]]/route.ts` — mounts Hono with CORS and logging middleware
- **Router**: `hono/index.ts` — registers all route modules and origin-check middleware
- **Route modules**: `hono/{photos,stories,blogs,albums,comments,auth,storage,equipment,friends,settings}.ts`
- **Auth middleware**: `hono/middleware/auth.ts` — JWT verification via Bearer token

The frontend API client lives in `src/lib/api/`:
- `core.ts` — `apiRequest()`, `apiRequestData<T>()`, `buildApiUrl()`, `resolveAssetUrl()`
- Module files (`photos.ts`, `auth.ts`, etc.) export typed functions
- Re-exported from `src/lib/api.ts`
- Responses use a `{ success, data, meta }` envelope pattern

### Database

- **ORM**: Prisma 6 with PostgreSQL
- **Schema**: `prisma/schema.prisma` — models: User, Photo, Album, Story, Blog, Comment, Category, Camera, Lens, Setting, FriendLink
- **Client singleton**: `server/lib/db.ts` — includes a Prisma extension that adjusts UTC+8 timezone offsets on all DateTime fields
- Import as `import { db } from '~/server/lib/db'` (server-only)

### Provider Hierarchy

Root layout (`src/app/layout.tsx`) nests providers in this order:
```
ThemeProvider → SettingsProvider → LanguageProvider → AuthProvider
```

- **ThemeProvider** — light/dark/system, persisted to localStorage
- **SettingsProvider** — site config from env vars via `getBootConfig()`, plus DB settings
- **LanguageProvider** — zh/en i18n with `t()` function, dictionaries in `src/lib/i18n.ts`
- **AuthProvider** — JWT auth state, login/logout, token in localStorage

### Path Aliases

- `@/*` → `./src/*` (components, hooks, lib, contexts, types)
- `~/*` → `./*` (root-level: hono/, server/, prisma/)

### Storage

Multiple storage backends configured via `STORAGE_PROVIDER` env var: local filesystem, AWS S3/Cloudflare R2, or GitHub. Abstracted in `server/lib/storage/`.

### Rich Text Editor

TipTap v3 with extensions (table, image, link, text-align, underline). Editor component: `src/components/NarrativeTipTapEditor.tsx`. Custom styles in `src/app/tiptap-editor.css`.

### Comments

Dual system: local DB comments or Waline (LeanCloud). Controlled by `COMMENTS_STORAGE` env var. When `LEANCLOUD` without external `WALINE_SERVER_URL`, a local Waline handler is registered in the Hono router.

## Conventions

- TypeScript strict mode; prefer `unknown` over `any`
- 2-space indentation; imports grouped: third-party, `@/*` aliases, type imports
- Client components must have `'use client'` directive; server modules import `'server-only'`
- Tailwind utilities first; custom CSS only for shared editor/content styling
- Components: PascalCase. Functions/variables: camelCase. Constants: `UPPER_SNAKE_CASE`
- Commits: Conventional Commits (`feat:`, `fix:`, `refactor:`, `build:`, `chore(release):`)
- Styling uses CVA (class-variance-authority) for component variants, Radix UI for primitives
- Animations via Framer Motion

## Key Directories

- `src/app/admin/` — protected admin dashboard (upload, photo/album/story/blog management)
- `src/components/gallery/` — GridView, MasonryView, TimelineView, AlbumGrid
- `src/components/ui/` — base UI primitives (button, input, select, etc.)
- `server/lib/` — server utilities (EXIF extraction, color quantization, JWT, storage providers)
- `hono/middleware/` — auth and origin-check middleware
