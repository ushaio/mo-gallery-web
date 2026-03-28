# Mobile Upload App Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the first Android mobile upload workflow by adding photo origin tracking to the existing backend and scaffolding a Flutter mobile client that reuses current APIs.

**Architecture:** Keep the backend API surface stable and make only a schema-plus-upload-path change in `mo-gallery-web`. Build a separate Flutter app in `mo-gallery-mobile` for login, target selection, local queue persistence, and upload orchestration.

**Tech Stack:** Next.js, Hono, Prisma, PostgreSQL, Flutter, Riverpod, GoRouter, Dio, Drift, Photo Manager

---

### Task 1: Freeze the approved design in docs

**Files:**
- Create: `docs/plans/2026-03-28-mobile-upload-app-design.md`
- Create: `docs/plans/2026-03-28-mobile-upload-app-implementation-plan.md`

**Step 1: Write the approved scope**

- Document Android-only scope, admin login, local recent-target persistence, no new backend endpoints, and `Photo.originFlag`.

**Step 2: Save the implementation plan**

- Capture backend and Flutter workstreams so later execution can stay aligned with the frozen scope.

### Task 2: Add photo origin tracking in `mo-gallery-web`

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_photo_origin_flag/migration.sql`
- Modify: `hono/photos.ts`
- Modify: `src/lib/api/types.ts`

**Step 1: Extend Prisma schema**

- Add `originFlag String @default("web")` to `Photo`.

**Step 2: Write migration**

- Add the column as non-null with default `web`.
- Backfill existing rows to `web`.
- Add an index only if later proven necessary.

**Step 3: Update upload path**

- Read `origin_flag` from multipart form data.
- Accept `mobile` and `web`, fallback to `web`.
- Persist `originFlag` when creating `Photo`.

**Step 4: Update DTO typing**

- Expose `originFlag` on `PhotoDto`.

**Step 5: Verify**

- Run `pnpm run prisma:generate`
- Run `pnpm run lint`
- Run `pnpm run build`

### Task 3: Scaffold the Flutter Android app in `mo-gallery-mobile`

**Files:**
- Create: Flutter project files under `D:\Projects\mo-gallery-mobile`

**Step 1: Create project skeleton**

- Generate a Flutter app configured for Android.

**Step 2: Add baseline dependencies**

- Add Riverpod, GoRouter, Dio, Drift, Photo Manager, Secure Storage, Shared Preferences, and crypto helpers.

**Step 3: Add shared app shell**

- Create app bootstrap, router, theme, environment config, and provider setup.

### Task 4: Implement auth and target loading

**Files:**
- Create: `lib/features/auth/...`
- Create: `lib/features/targets/...`
- Create: `lib/shared/api/...`

**Step 1: Implement login client**

- Call `/api/auth/login`.
- Persist JWT securely.

**Step 2: Implement target repositories**

- Load albums and stories from existing admin endpoints.

**Step 3: Implement local recent-target storage**

- Store selected album and story IDs locally after successful batch completion.

### Task 5: Implement upload queue core

**Files:**
- Create: `lib/features/gallery_picker/...`
- Create: `lib/features/upload_queue/...`
- Create: `lib/shared/storage/...`

**Step 1: Add gallery multi-select**

- Use `photo_manager` to select multiple photos from Android gallery.

**Step 2: Persist queue tasks locally**

- Store task snapshots with enough data to resume after restart.

**Step 3: Implement queue runner**

- Compute SHA-256.
- Call duplicate-check API.
- Upload non-duplicate files with `origin_flag=mobile`.
- Link resulting `photoId`s to selected albums and stories using existing endpoints.

**Step 4: Add retry and resume**

- Retry transient failures.
- Resume unfinished tasks on app launch.

### Task 6: Build the MVP UI

**Files:**
- Create: login, upload setup, queue, and result screens

**Step 1: Login screen**

- Username/password form with session restore.

**Step 2: Upload setup screen**

- Multi-select albums and stories.
- Restore recent defaults.
- Launch picker and create a batch.

**Step 3: Queue and result screens**

- Show progress, retryable failures, and final summary.

### Task 7: Verify end-to-end behavior

**Files:**
- No dedicated test files yet; rely on lint/build/manual checks

**Step 1: Backend verification**

- `pnpm run prisma:generate`
- `pnpm run lint`
- `pnpm run build`

**Step 2: Flutter verification**

- `flutter pub get`
- `flutter analyze`

**Step 3: Manual Android checks**

- login
- target restore
- multi-image upload
- duplicate detection
- album and story linking
- resume after app restart
