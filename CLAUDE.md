# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MO Gallery is a photo gallery application with integrated frontend and backend. It supports photo management, albums, stories (photo narratives), blogs, friend links, and comments with multiple storage backends (local, GitHub, Cloudflare R2).

## Development Commands

```bash
pnpm install            # Install dependencies
pnpm run dev            # Start development server
pnpm run build          # Build for production
pnpm run build:vercel   # Build for Vercel (includes migrations + seed)
pnpm run build:node     # Build for Node.js deployment
pnpm run lint           # Run ESLint

# Database
pnpm run prisma:dev      # Create migration and apply (development)
pnpm run prisma:deploy   # Apply migrations (production)
pnpm run prisma:generate # Generate Prisma client
pnpm run prisma:seed     # Seed database with admin user
pnpm run prisma:studio   # Open Prisma Studio for database inspection
```

## Tech Stack

- **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4, Framer Motion
- **Backend**: Hono.js mounted as Next.js API route
- **Database**: Prisma ORM with PostgreSQL
- **Storage**: Pluggable providers (local/GitHub/R2) via factory pattern
- **Editors**: Milkdown (Crepe) for markdown, Tiptap for rich HTML stories
- **Icons**: `@iconify/react` and `lucide-react`
- **Validation**: Zod (server-side)
- **Auth**: JWT-based, Linux DO OAuth for comments

## Architecture

### Hono ↔ Next.js Adapter

All API routes live in `hono/` as Hono routers. They are aggregated in `hono/index.ts` and mounted at `/api` via a single Next.js catch-all route at `src/app/api/[[...route]]/route.ts` using `hono/vercel`'s `handle()`. Each HTTP method (GET, POST, PUT, PATCH, DELETE) is exported from that file.

### Frontend API Client (`src/lib/api/`)

The API client is split into domain modules (`photos.ts`, `stories.ts`, `albums.ts`, etc.) that import from `core.ts`. Key patterns:
- **Envelope pattern**: All API responses are wrapped as `{ success: true, data: T, meta?: M }` or `{ success: false, message: string }`
- `apiRequestData<T>()` — returns typed data directly
- `apiRequestWithMeta<T, M>()` — returns data + pagination metadata
- Bearer token is injected automatically when passed to these functions
- 401 responses throw `ApiUnauthorizedError`
- DTOs are defined in `types.ts` with `Dto` suffix convention (e.g., `PhotoDto`, `StoryDto`)

### Storage Abstraction (`server/lib/storage/`)

`StorageProvider` interface defines `upload()`, `delete()`, `download()`, `getUrl()`, `move()`, `list()`. `StorageProviderFactory.create(config)` returns the appropriate provider based on config loaded from the database `Setting` table at request time.

### State Management

React Context API only (no Redux). Key contexts in `src/contexts/`:
- **AuthContext**: JWT token + user state with localStorage persistence, exposes `useAuth()` hook
- **ThemeContext**: Dark/light mode with system preference detection
- **SettingsContext**: Site-wide settings (title, CDN domain), loaded server-side as initial props
- **LanguageContext**: i18n with `t()` function using dot-notation paths into `src/lib/i18n.ts` dictionaries
- **UploadQueueContext**: Manages concurrent photo uploads (up to 4 parallel) with compression

### Rich Text Editors

Two editor systems coexist for stories:
- **MilkdownEditor** (`src/components/MilkdownEditor.tsx`): Markdown-native WYSIWYG using Milkdown/Crepe. Uses `useImperativeHandle` to expose `getValue()`, `setValue()`, `insertValue()`. Outputs markdown.
- **NarrativeTipTapEditor** (`src/components/NarrativeTipTapEditor.tsx`): HTML-based rich editor using Tiptap. Accepts markdown input (converts to HTML), outputs HTML. Has custom extensions for resizable images, toolbar formatting, tables, and alignment.

Both handle image pasting via callbacks to parent components and support width modifiers in markdown image syntax: `![alt](url =480x)`.

### i18n

Flat dictionary structure in `src/lib/i18n.ts` with `zh` and `en` locales. `LanguageContext` provides `t('nav.home')` style lookups. Locale persisted in localStorage, defaults to `zh`.

## Path Aliases

- `@/*` → `./src/*`
- `~/*` → `./*` (project root, used for `~/hono`, `~/server/lib`, `~/prisma`)

## Key Configuration

- **React Compiler** enabled (`reactCompiler: true` in next.config.ts)
- **Strict mode** disabled (`reactStrictMode: false`)
- **Standalone output** for containerized deployment
- **Image optimization** disabled (`unoptimized: true`)
- Server external packages: `sharp`, `@waline/vercel`

## Database Schema (Key Relationships)

- `Photo ↔ Story`: Many-to-many via `@relation("PhotoStories")`
- `Photo ↔ Album`: Many-to-many via `@relation("AlbumPhotos")`
- `Photo ↔ Category`: Many-to-many (implicit)
- `Photo → Camera/Lens`: Optional foreign keys
- `Comment → Photo`: Cascade delete
- `Setting`: Key-value store for app configuration (storage provider settings, site config)

## Conventions

- **Component exports**: Default exports for page/component files
- **Client vs Server**: `'use client'` directive for client components; `import 'server-only'` in Hono routes and server utilities
- **Styling**: Tailwind CSS 4 with `cn()` utility from `src/lib/utils.ts` for class merging
- **Error handling (server)**: Hono routes return `c.json({ error: message }, statusCode)`; global error handler in `hono/index.ts` catches `HTTPException`
- **Error handling (client)**: Try-catch with custom error classes (`ApiUnauthorizedError`); `extractErrorMessage()` for consistent error extraction
- **Auth protection**: `authMiddleware` from `hono/middleware/auth.ts` guards admin routes, sets `c.set('user', payload)`
- **API route registration**: Sub-routers mounted in `hono/index.ts` with `route.route('/path', subRouter)`

## Environment Setup

Copy `.env.example` to `.env` and configure:
- `DATABASE_URL` / `DIRECT_URL`: PostgreSQL connection strings
- `JWT_SECRET`: Token signing key
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`: Initial admin credentials
- Storage provider settings (R2, GitHub) are configured via admin UI after initial setup
