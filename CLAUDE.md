# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MO Gallery is a photo gallery application with integrated frontend and backend. It supports photo management, albums, stories (photo narratives), blogs, friend links, and comments with multiple storage backends (local, GitHub, Cloudflare R2).

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build
pnpm run build:vercel    # Build for Vercel (includes migrations + seed)
pnpm run build:node      # Build for Node.js deployment

# Lint
pnpm run lint

# Database commands
pnpm run prisma:dev      # Create migration and apply (development)
pnpm run prisma:deploy   # Apply migrations (production)
pnpm run prisma:generate # Generate Prisma client
pnpm run prisma:seed     # Seed database with admin user
pnpm run prisma:studio   # Open Prisma Studio for database inspection
```

## Architecture

### Tech Stack
- **Frontend**: Next.js 16, React 19, Tailwind CSS 4
- **Backend**: Hono.js (runs as Next.js API route)
- **Database**: Prisma ORM with PostgreSQL
- **Storage**: Pluggable providers (local/GitHub/R2)

### Directory Structure

```
├── hono/                 # API routes (Hono.js)
│   ├── index.ts          # Route aggregator
│   ├── auth.ts           # Authentication & Linux DO OAuth
│   ├── photos.ts         # Photo CRUD with pagination
│   ├── albums.ts         # Album management
│   ├── stories.ts        # Photo stories/narratives
│   ├── blogs.ts          # Blog posts
│   ├── comments.ts       # Comment system with moderation
│   ├── friends.ts        # Friend links management
│   ├── settings.ts       # Admin settings
│   └── middleware/auth.ts
├── server/lib/           # Server-side utilities
│   ├── db.ts             # Prisma client singleton
│   ├── jwt.ts            # JWT utilities
│   ├── exif.ts           # EXIF extraction
│   ├── colors.ts         # Dominant color extraction
│   └── storage/          # Storage abstraction layer
│       ├── types.ts      # StorageProvider interface
│       ├── factory.ts    # Provider factory
│       ├── local.ts      # Local filesystem
│       ├── github.ts     # GitHub repository
│       └── r2.ts         # Cloudflare R2
├── prisma/
│   └── schema.prisma     # Database schema
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── api/[[...route]]/route.ts  # Hono → Next.js adapter
│   │   ├── admin/        # Admin dashboard pages
│   │   ├── gallery/      # Public gallery
│   │   └── blog/         # Blog pages
│   ├── components/       # React components
│   ├── contexts/         # React contexts (Auth, Theme, Settings, Language, UploadQueue)
│   └── lib/
│       ├── api.ts        # Frontend API client with typed DTOs
│       ├── i18n.ts       # Internationalization
│       └── utils.ts
```

### Key Patterns

**API Integration**: Hono.js routes are mounted at `/api` via Next.js catch-all route. The frontend uses `src/lib/api.ts` which provides typed functions for all API calls.

**Path Aliases**:
- `@/*` → `./src/*`
- `~/*` → `./*` (root)

**Storage Abstraction**: All file operations go through `StorageProvider` interface. Provider is selected via `STORAGE_PROVIDER` env var and configured through admin settings.

**Authentication**: JWT-based. Admin routes require `Authorization: Bearer <token>` header. Auth middleware in `hono/middleware/auth.ts`.

## Database Schema (Key Models)

- `Photo`: Core entity with EXIF data, categories, dominant colors, file hash for deduplication
- `Album`: Photo collections with cover image and publish status
- `Story`: Markdown narratives linked to multiple photos
- `Blog`: Standalone markdown posts with categories/tags
- `Comment`: Photo comments with moderation status (pending/approved/rejected)
- `Camera` / `Lens`: Equipment entities linked to photos
- `FriendLink`: Friend/partner site links with avatars
- `Setting`: Key-value store for app configuration

## Environment Setup

Copy `.env.example` to `.env` and configure:
- `DATABASE_URL` / `DIRECT_URL`: Database connection
- `JWT_SECRET`: Token signing key
- `ADMIN_USERNAME` / `ADMIN_PASSWORD`: Initial admin credentials
- Storage provider settings (R2, GitHub) configured via admin UI after setup
