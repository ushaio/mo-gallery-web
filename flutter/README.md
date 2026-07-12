# MO Gallery Mobile (Flutter)

Android-first mobile client for **batch photo upload** to a self-hosted [mo-gallery-web](../) instance.

## P0 scope

- Admin login (server URL + JWT Secret + username + password, aligned with Desktop)
- Multi-select from system gallery → durable local upload queue
- SHA-256 hash, duplicate check, multipart upload (`origin_flag=mobile`)
- Attach to albums / stories; optional film roll
- Kill-process resume (task-level, not byte-range)
- Android foreground notification while uploading

**Not in P0:** full gallery browser, album CRUD admin, Zine/AI, iOS release signing.

## Prerequisites

- Flutter 3.24+ (`flutter --version`)
- Android SDK / emulator or device
- Running mo-gallery-web with admin credentials

## Setup

```bash
cd flutter
flutter pub get
flutter run
```

## Login fields

| Field | Notes |
|-------|--------|
| Server URL | e.g. `https://gallery.example.com` or `http://10.0.2.2:3000` (Android emulator → host) |
| JWT Secret | Same value as Desktop / server `JWT_SECRET` (stored locally; not sent on login body) |
| Username / Password | Admin credentials (`ADMIN_USERNAME` / `ADMIN_PASSWORD`) |

## Develop

```bash
flutter analyze
flutter test
```

## Architecture notes

- HTTP only against `{server}/api/*` (no direct DB)
- Queue in SQLite (`sqflite`); files copied under app documents `upload_inbox/`
- Upload worker: hash → check-duplicate → multipart `POST /admin/photos` → attach targets

See design/plan:

- `docs/superpowers/specs/2026-07-12-flutter-mobile-app-design.md`
- `docs/superpowers/plans/2026-07-12-flutter-mobile-app.md`
- `docs/requirements/2026-03-26-mobile-upload-app.md`
