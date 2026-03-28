# Story Cover Crop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a single story cover crop configuration that can be edited in `admin/logs` and rendered consistently on public story surfaces.

**Architecture:** Persist normalized crop rectangle fields on `Story`, expose them through Hono APIs and client DTOs, then use one shared crop helper for admin preview and public story rendering. The admin editor gets a modal-based crop tool that updates the current story draft and saved story state.

**Tech Stack:** Prisma, Hono, Next.js App Router, React, TypeScript, Tailwind CSS

---

### Task 1: Extend Story data model

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260328170000_add_story_cover_crop/migration.sql`
- Modify: `src/lib/api/types.ts`
- Modify: `src/lib/client-db.ts`
- Modify: `src/app/admin/logs/stories/types.ts`

### Task 2: Pass crop fields through story APIs

**Files:**
- Modify: `hono/stories.ts`
- Modify: `src/lib/api/stories.ts`
- Modify: `src/app/admin/logs/stories/utils.ts`
- Modify: `src/app/admin/logs/stories/useStoryDraftState.ts`
- Modify: `src/app/admin/logs/StoriesTab.tsx`

### Task 3: Add reusable crop rendering helpers

**Files:**
- Create: `src/lib/story-cover.ts`

### Task 4: Build admin crop editor

**Files:**
- Create: `src/components/admin/StoryCoverCropModal.tsx`
- Modify: `src/app/admin/logs/stories/StoryEditorView.tsx`
- Modify: `src/app/admin/logs/StoriesTab.tsx`

### Task 5: Apply crop rendering on story surfaces

**Files:**
- Modify: `src/app/story/page.tsx`
- Modify: `src/app/story/[id]/page.tsx`
- Modify: `src/components/admin/StoryPreviewModal.tsx`

### Task 6: Verify

**Run:**
- `pnpm run prisma:generate`
- `pnpm run lint`

Note: repo already has existing lint failures unrelated to this feature, so verification should call those out explicitly.
