# MO Gallery Project Map

Use this reference when a change touches more than one layer or when you need to understand the repository quickly.

## Core Stack

- Next.js App Router for pages and layouts under `src/app/`
- React 19 with client components and context providers
- Hono for API routes in `hono/`
- Prisma with PostgreSQL in `prisma/schema.prisma`
- Tailwind CSS 4 and Framer Motion for UI
- Milkdown and TipTap for markdown and rich content editing

## Feature Areas

### Public Site

- `src/app/page.tsx`: landing page
- `src/app/gallery/page.tsx`: photo gallery with category filtering, multiple view modes, infinite loading, and album switch
- `src/app/gallery/albums/[id]/page.tsx`: album detail page
- `src/app/story/*`: story list and story detail
- `src/app/blog/*`: blog list and blog detail
- `src/app/they/page.tsx`: friend links page
- `src/app/about/page.tsx`: about page

### Admin

- `src/app/admin/page.tsx`: redirects to `/admin/photos`
- `src/app/admin/photos/PhotosTab.tsx`: photo management
- `src/app/admin/albums/AlbumsTab.tsx`: album management
- `src/app/admin/logs/StoriesTab.tsx`: story management
- `src/app/admin/logs/BlogTab.tsx`: blog management
- `src/app/admin/logs/StoryUploadTab.tsx`: story-oriented upload workflows
- `src/app/admin/friends/page.tsx`: friend link management
- `src/app/admin/settings/SettingsTab.tsx`: site and storage settings
- `src/app/admin/storage/page.tsx`: storage diagnostics and maintenance
- `src/app/admin/upload/UploadTab.tsx`: upload entry point

## API Structure

- `hono/index.ts`: central route registration and error handling
- `hono/photos.ts`: photos, categories, pagination, upload-adjacent behavior
- `hono/albums.ts`: album CRUD and published album behavior
- `hono/stories.ts`: story CRUD and story-photo relationships
- `hono/blogs.ts`: blog CRUD and publishing
- `hono/comments.ts`: comment moderation and public comment reads
- `hono/friends.ts`: friend link CRUD
- `hono/settings.ts`: public and admin settings
- `hono/storage.ts`: storage inspection and maintenance endpoints
- `hono/equipment.ts`: camera and lens metadata endpoints
- `hono/auth.ts`: admin auth and Linux DO OAuth flows
- `hono/waline.ts`: local Waline integration when enabled

## Frontend API Contracts

- `src/lib/api.ts`: barrel file for client API helpers
- `src/lib/api/types.ts`: DTOs used by components
- `src/lib/api/core.ts`: request helpers, error extraction, auth-aware request plumbing
- `src/lib/api/*.ts`: feature-specific API helper modules

When a route changes shape, update the corresponding helper module and DTOs immediately.

## Persistence Model

### Main Prisma Models

- `Photo`: image records, EXIF fields, storage metadata, dominant colors, equipment relations
- `Album`: curated photo groups with publish state and sort order
- `Story`: markdown-based narrative posts with selected photos and optional cover
- `Blog`: markdown blog posts with category, tags, and publish state
- `Comment`: photo comments with moderation status
- `FriendLink`: links shown on the public friends page
- `Setting`: key-value configuration backing admin settings
- `User`: admin or OAuth-authenticated users
- `Camera` and `Lens`: normalized equipment dimensions attached to `Photo`

### Schema Change Checklist

1. Update `prisma/schema.prisma`.
2. Update any Hono serialization code that exposes the field.
3. Update DTOs in `src/lib/api/types.ts`.
4. Update admin forms or public renderers that read or write the field.
5. Mention `pnpm run prisma:generate` and migration needs in the final report.

## Editors and Rich Content

- `src/components/MilkdownEditor.tsx`: reusable markdown editor wrapper with paste-image hooks and imperative helpers
- `src/components/MilkdownViewer.tsx`: markdown rendering for read-only views
- `src/components/NarrativeTipTapEditor.tsx`: richer editing surface for image-heavy narratives
- `src/components/tiptap-extensions/*`: custom image and group extensions

When editing authoring flows, preserve existing paste/upload hooks and toolbar behavior.

## Cross-Cutting Contexts

- `src/contexts/AuthContext.tsx`: token and user persistence in local storage
- `src/contexts/SettingsContext.tsx`: public site settings
- `src/contexts/LanguageContext.tsx`: i18n strings and locale state
- `src/contexts/ThemeContext.tsx`: theme switching
- `src/contexts/UploadQueueContext.tsx`: queued uploads and progress state

Reuse these contexts instead of creating new global state paths unless the existing abstraction is clearly insufficient.

## Storage Architecture

- `server/lib/storage/types.ts`: storage provider interfaces and config shape
- `server/lib/storage/factory.ts`: provider selection
- `server/lib/storage/local.ts`: local filesystem storage
- `server/lib/storage/github.ts`: GitHub-backed storage
- `server/lib/storage/r2.ts`: Cloudflare R2 storage

Storage-related changes usually require touching admin settings, API routes, and provider logic together.

## Common Risks

- Public/admin publish rules drifting apart
- DTOs no longer matching Hono responses
- Upload logic updated in one editor flow but not another
- Storage-specific assumptions breaking non-local providers
- Authenticated admin calls forgetting token plumbing
