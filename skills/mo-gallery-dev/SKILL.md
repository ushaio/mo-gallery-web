---
name: mo-gallery-dev
description: Guide development work in the MO Gallery photo journal and blog system. Use when Codex needs to add or modify gallery, album, story, blog, comment, friend-link, auth, storage, or admin features in this repository; when a change spans Next.js App Router pages, shared React components, Hono API routes, Prisma models, or typed API clients; or when a task needs project-specific guardrails for storage providers, markdown editors, settings, and public/admin behavior.
---

# Mo Gallery Dev

## Overview

Use this skill to make safe, project-aware changes in MO Gallery.
Start by locating the user-facing surface, then trace the matching API contract, persistence model, and storage side effects before editing.

## Quick Start

1. Identify the feature area:
   - Public pages live in `src/app/*`.
   - Admin pages live in `src/app/admin/*`.
   - Shared UI lives in `src/components/*`.
   - API routes live in `hono/*`.
   - Persistent schema lives in `prisma/schema.prisma`.
   - Frontend API helpers and DTOs live in `src/lib/api/*`.
2. Read only the files needed for the task.
3. When a change affects API shape or stored data, read `references/project-map.md`.
4. Keep request and response shapes aligned across Hono handlers, DTOs, and consuming components.
5. Validate with the narrowest useful command, usually `pnpm run lint` or a targeted build-related check.

## Follow the Request Path

- For public gallery behavior, start in `src/app/gallery/page.tsx` and the `src/components/gallery/*` subtree.
- For stories or blogs, inspect the page, the editor or viewer component, then the matching `hono/stories.ts` or `hono/blogs.ts` route and `src/lib/api/stories.ts` or `src/lib/api/blogs.ts`.
- For admin features, start from the relevant tab under `src/app/admin/*` and follow imports into reusable admin components.
- For auth or protected actions, inspect `src/contexts/AuthContext.tsx`, `hono/auth.ts`, and `hono/middleware/auth.ts`.
- For upload and storage behavior, trace `src/contexts/UploadQueueContext.tsx`, `hono/storage.ts` or `hono/photos.ts`, and `server/lib/storage/*`.

## Keep Data and API Consistent

- Treat `src/lib/api/types.ts` as the frontend contract source of truth.
- When changing a route payload, update the Hono route, DTOs, and all call sites in the same pass.
- Preserve the envelope pattern used by the repository: success payloads with `data` and failures with `error`.
- Prefer extending existing API helper modules under `src/lib/api/` instead of calling `fetch` directly from components.

## Respect Project-Specific Guardrails

- Keep client components marked with `'use client'`.
- Keep server-only modules marked with `import 'server-only'` where applicable.
- Reuse existing context providers for auth, settings, theme, language, and upload queue instead of introducing parallel state containers.
- Preserve the current editor split: Milkdown powers blog editing and parts of story editing, while TipTap utilities exist for richer image-oriented editing.
- When changing storage behavior, maintain compatibility with all providers in `server/lib/storage/`: `local`, `github`, and `r2`.
- Avoid schema changes unless the task truly requires them; if the Prisma schema changes, plan to regenerate the Prisma client.

## Handle Common Change Types

- Add a public filtering or listing feature:
  Trace page state, query params, API helper functions, and matching Hono query parsing together.
- Add an admin form field:
  Update the UI tab, local form state, DTO, route validation or parsing, and persistence layer together.
- Add a photo metadata feature:
  Check Prisma `Photo`, EXIF extraction utilities, DTO serialization, and any modal or detail panel that renders metadata.
- Add a publishing workflow:
  Verify both admin visibility and public visibility rules, especially `isPublished` handling in routes and pages.
- Add a storage option or storage-side behavior:
  Mirror interfaces in `server/lib/storage/types.ts`, provider creation in `factory.ts`, and admin settings surfaces.

## Validate Before Finishing

- Run `pnpm run lint` after meaningful TypeScript or React edits.
- If lint is noisy or unrelated failures exist, report that clearly instead of masking it.
- For schema edits, mention that `pnpm run prisma:generate` is required.
- Summarize any assumptions, especially around public versus admin behavior and backward compatibility.

## Reference

- Read `references/project-map.md` when the task crosses feature boundaries, changes a DTO or schema, or touches storage, auth, comments, or editor behavior.
