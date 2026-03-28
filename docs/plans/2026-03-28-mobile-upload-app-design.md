# mo-gallery Mobile Upload App Design

## Scope

- Build the first usable `Android` mobile upload app in `D:\Projects\mo-gallery-mobile`.
- Reuse the existing `mo-gallery-web` APIs without adding new mobile-only endpoints.
- Use existing admin username/password login only.
- Record upload source on photo records with `Photo.originFlag`.
- Backfill all existing photo rows to `web`.

## Product Decisions

- Platform: Android MVP only.
- Auth: existing admin login via `/api/auth/login`.
- Upload recovery: task-level recovery only, not byte-range resume.
- Recent targets: persisted locally on device, not stored on the server.
- Target model: one upload batch can link to zero or more albums and zero or more stories.

## Reused Backend APIs

- `POST /api/auth/login`
- `GET /api/admin/albums`
- `GET /api/admin/stories`
- `POST /api/admin/photos/check-duplicate`
- `POST /api/admin/photos`
- `POST /api/admin/albums/:id/photos`
- `POST /api/admin/stories/:id/photos`

## Minimal Backend Change

No new routes are added.

The backend change is limited to:

- adding `originFlag` to `Photo`
- defaulting old data to `web`
- allowing upload requests to pass `origin_flag=mobile`
- returning `originFlag` in photo DTOs

Accepted values:

- `web`
- `mobile`

If the upload request does not provide an explicit origin, the backend should store `web`.

## Mobile App Architecture

The Flutter app is a focused upload tool, not a full admin client.

Recommended modules:

- `lib/features/auth`
- `lib/features/targets`
- `lib/features/gallery_picker`
- `lib/features/upload_queue`
- `lib/features/settings`
- `lib/shared/api`
- `lib/shared/storage`

Recommended packages:

- `flutter_riverpod`
- `go_router`
- `dio`
- `photo_manager`
- `flutter_secure_storage`
- `shared_preferences`
- `drift` with `sqlite3_flutter_libs`
- `crypto`
- `image_picker` is not required for MVP if `photo_manager` covers gallery access

## Upload State Machine

Each selected photo is tracked as an individual task.

States:

- `queued`
- `hashing`
- `duplicateChecking`
- `uploading`
- `uploaded`
- `linkingTargets`
- `completed`
- `failedRetryable`
- `failedTerminal`

Recovery rules:

- tasks before `uploaded` are retried from the file stage after app restart
- tasks with a known `photoId` resume from target linking only
- duplicate detection uses existing server behavior and treats the known existing photo as an uploaded resource
- retryable failures use bounded retries and then move to `failedTerminal`

## UI Surface

The MVP contains four screens:

- Login
- Upload setup
- Upload queue
- Upload result summary

Upload setup responsibilities:

- load albums and stories
- restore recent target defaults from local storage
- allow multi-select targets
- launch gallery multi-pick

Upload queue responsibilities:

- show overall batch progress
- show per-file status
- auto-retry transient failures
- resume unfinished tasks on app relaunch

## Non-Goals

- Linux DO OAuth
- iOS release support
- server-side mobile preferences API
- chunked upload and byte-level resume
- full mobile story editing or web admin parity

## Verification Targets

Backend:

- Prisma migration applies cleanly
- upload route stores `originFlag`
- existing web uploads still save `originFlag=web`

Android app:

- admin login works
- multiple images can be selected
- duplicate check runs before upload
- successful uploads can be linked to selected albums and stories
- app restart resumes unfinished tasks
- recent targets are restored locally on next session
