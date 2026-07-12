# Flutter Mobile Upload App (P0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Flutter Android-first app under `flutter/` that lets the site owner log in (Desktop-aligned form), multi-select photos, and reliably upload them to the existing mo-gallery-web Hono API with a durable local queue, album/story attach, optional film roll, and resume-after-kill.

**Architecture:** Pure HTTP client (Dio) against `{server}/api/*` with JWT Bearer auth. Local Drift/SQLite queue stores tasks; images are copied into app sandbox on enqueue so URIs remain valid. Upload worker runs sequentially (concurrency 1) with retries; Android uses a foreground service for background progress. Server remains source of truth for EXIF, storage, and photo records.

**Tech Stack:** Flutter 3.24+, Dart 3, Dio, flutter_secure_storage, drift + sqlite3_flutter_libs, path_provider, crypto, image_picker, flutter_image_compress, go_router, flutter_riverpod, flutter_foreground_task (Android), freezed optional (hand-written models OK for P0).

**Specs:**
- Design: `docs/superpowers/specs/2026-07-12-flutter-mobile-app-design.md`
- Requirements freeze: `docs/requirements/2026-03-26-mobile-upload-app.md`

## Global Constraints

- Code lives only under `flutter/` for the app; backend changes only if a hard gap is found (prefer zero backend changes).
- `origin_flag` on every upload must be `mobile` (already allowed in `hono/photos.ts`).
- Login fields match Desktop: server URL, JWT Secret, username, password.
- Resume semantics are **task-level**, not byte-range resumable upload.
- Android is the P0 verification target; keep `ios/` scaffold but do not block on iOS signing.
- API base path is always `{server}/api` (see `src/app/api/[[...route]]/route.ts` `basePath('/api')`).
- Prefer TDD for pure Dart units (hash, queue state, JSON parse); UI verified manually on device/emulator.
- Conventional commits: `feat(flutter): ...`, `test(flutter): ...`, `docs(flutter): ...`.
- Do not commit secrets, `.env`, or real server credentials.

## File Map (P0)

```
flutter/
├── pubspec.yaml
├── analysis_options.yaml
├── README.md
├── .gitignore
├── android/                          # permissions: INTERNET, FOREGROUND_SERVICE, photos
├── ios/                              # scaffold only
├── lib/
│   ├── main.dart
│   ├── app/
│   │   ├── app.dart
│   │   ├── router.dart
│   │   └── theme.dart
│   ├── core/
│   │   ├── api/
│   │   │   ├── api_client.dart       # Dio + interceptors
│   │   │   ├── api_exception.dart
│   │   │   └── envelope.dart         # parse { success, data, error, message, token, user }
│   │   ├── auth/
│   │   │   ├── session.dart
│   │   │   └── session_store.dart    # flutter_secure_storage
│   │   ├── config/
│   │   │   └── app_config.dart
│   │   ├── db/
│   │   │   ├── app_database.dart
│   │   │   ├── app_database.g.dart   # generated
│   │   │   └── tables.dart
│   │   ├── files/
│   │   │   ├── sandbox_copy.dart
│   │   │   └── file_hash.dart
│   │   └── error/
│   │       └── error_messages.dart
│   ├── features/
│   │   ├── auth/
│   │   │   ├── auth_api.dart
│   │   │   ├── auth_controller.dart
│   │   │   └── login_page.dart
│   │   ├── catalog/
│   │   │   ├── albums_api.dart
│   │   │   ├── stories_api.dart
│   │   │   └── film_rolls_api.dart
│   │   ├── upload/
│   │   │   ├── photos_api.dart
│   │   │   ├── upload_models.dart
│   │   │   ├── upload_queue_repository.dart
│   │   │   ├── upload_worker.dart
│   │   │   ├── recent_targets_store.dart
│   │   │   ├── upload_page.dart
│   │   │   ├── target_picker_sheet.dart
│   │   │   └── upload_settings.dart
│   │   ├── shell/
│   │   │   └── home_shell.dart       # bottom nav: Upload | (Gallery placeholder) | Settings
│   │   └── settings/
│   │       └── settings_page.dart
│   └── l10n/
│       └── strings.dart              # simple zh/en map for P0
└── test/
    ├── core/
    │   ├── envelope_test.dart
    │   ├── file_hash_test.dart
    │   └── error_messages_test.dart
    ├── features/
    │   ├── auth_api_test.dart
    │   ├── photos_api_test.dart
    │   └── upload_queue_repository_test.dart
    └── fixtures/
        └── sample.jpg                # tiny fixture for hash tests
```

## API Reference (existing backend — do not invent paths)

| Action | Method | Path | Body / notes |
|--------|--------|------|----------------|
| Login | POST | `/api/auth/login` | JSON `{ "username", "password" }` → `{ success, token, user }` |
| Check duplicates | POST | `/api/admin/photos/check-duplicate` | JSON `{ "fileHashes": string[] }` or single `fileHash` |
| Upload photo | POST | `/api/admin/photos` | multipart: `file`, `title`, `origin_flag=mobile`, `file_hash`, optional `film_roll_id`, `show_flag`, `compression_mode`, `max_size_mb`, `strip_gps`, `category` |
| List albums | GET | `/api/admin/albums` | Bearer |
| Add to album | POST | `/api/admin/albums/:id/photos` | JSON `{ "photoIds": string[] }` |
| List stories | GET | `/api/admin/stories` | Bearer |
| Add to story | POST | `/api/admin/stories/:id/photos` | JSON `{ "photoIds": string[] }` |
| List film rolls | GET | `/api/film-rolls` | public list OK for picker |
| Add to film roll | POST | `/api/admin/film-rolls/:id/photos` | JSON `{ "photoIds": string[] }` (if not already set via `film_roll_id` on upload) |

Auth header on all admin routes: `Authorization: Bearer <token>`.

Envelope shape (typical success): `{ "success": true, "data": T }` or login `{ "success": true, "token", "user" }`.  
Duplicate upload: HTTP 409, body `{ "error": "DUPLICATE_PHOTO", "message": "...", "existingPhotoId": "..." }`.

---

### Task 1: Scaffold Flutter project and dependencies

**Files:**
- Create: `flutter/` (via `flutter create`)
- Create/Modify: `flutter/pubspec.yaml`
- Create: `flutter/.gitignore`, `flutter/analysis_options.yaml`, `flutter/README.md`
- Modify: root `.gitignore` only if needed to ignore Flutter build artifacts that might leak outside `flutter/`

**Interfaces:**
- Produces: runnable empty app `flutter run` (Android)

- [ ] **Step 1: Verify Flutter SDK**

Run:
```bash
flutter --version
```
Expected: Flutter 3.24+ (or project-installed stable). If missing, install Flutter SDK and ensure `flutter` is on PATH.

- [ ] **Step 2: Create project**

Run from repo root:
```bash
flutter create --org com.mogallery --project-name mo_gallery_mobile --platforms=android,ios flutter
```
Expected: `flutter/lib/main.dart` exists.

- [ ] **Step 3: Add dependencies to `flutter/pubspec.yaml`**

Under `dependencies:` add (compatible versions resolved by pub):
```yaml
dependencies:
  flutter:
    sdk: flutter
  flutter_localizations:
    sdk: flutter
  cupertino_icons: ^1.0.8
  dio: ^5.7.0
  flutter_secure_storage: ^9.2.2
  flutter_riverpod: ^2.6.1
  go_router: ^14.6.2
  drift: ^2.22.1
  sqlite3_flutter_libs: ^0.5.28
  path_provider: ^2.1.5
  path: ^1.9.0
  crypto: ^3.0.6
  image_picker: ^1.1.2
  flutter_image_compress: ^2.3.0
  uuid: ^4.5.1
  collection: ^1.18.0
  flutter_foreground_task: ^8.17.0

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^5.0.0
  drift_dev: ^2.22.1
  build_runner: ^2.4.13
  mockito: ^5.4.4
  http_mock_adapter: ^0.6.1
```

- [ ] **Step 4: Install packages**

Run:
```bash
cd flutter && flutter pub get
```
Expected: exit 0.

- [ ] **Step 5: Ensure `flutter/.gitignore` ignores build artifacts**

Confirm contains:
```
.dart_tool/
.packages
build/
*.iml
.flutter-plugins-dependencies
```

- [ ] **Step 6: Smoke analyze**

Run:
```bash
cd flutter && flutter analyze
```
Expected: no errors (info/warnings OK to fix later).

- [ ] **Step 7: Commit**

```bash
git add flutter
git commit -m "feat(flutter): scaffold mobile app project"
```

---

### Task 2: App shell, theme, routing, strings

**Files:**
- Create: `flutter/lib/app/theme.dart`
- Create: `flutter/lib/app/router.dart`
- Create: `flutter/lib/app/app.dart`
- Create: `flutter/lib/l10n/strings.dart`
- Create: `flutter/lib/features/shell/home_shell.dart`
- Create: `flutter/lib/features/settings/settings_page.dart` (stub)
- Create: `flutter/lib/features/upload/upload_page.dart` (stub)
- Create: `flutter/lib/features/auth/login_page.dart` (stub)
- Modify: `flutter/lib/main.dart`

**Interfaces:**
- Produces:
  - `class AppStrings` with `String t(String key, {String lang = 'zh'})`
  - `GoRouter createRouter({required bool isLoggedIn})` routes: `/login`, `/` shell with `/upload`, `/settings`
  - `class MoGalleryApp extends ConsumerWidget`

- [ ] **Step 1: Implement minimal strings**

```dart
// flutter/lib/l10n/strings.dart
class AppStrings {
  static const _zh = {
    'app.title': 'MO Gallery',
    'login.title': '登录',
    'login.server': '服务器地址',
    'login.jwtSecret': 'JWT Secret',
    'login.username': '用户名',
    'login.password': '密码',
    'login.submit': '登录',
    'login.failed': '登录失败',
    'nav.upload': '上传',
    'nav.settings': '设置',
    'settings.logout': '退出登录',
    'upload.add': '添加照片',
    'upload.start': '开始上传',
    'upload.empty': '还没有待上传的照片',
  };

  static const _en = {
    'app.title': 'MO Gallery',
    'login.title': 'Sign in',
    'login.server': 'Server URL',
    'login.jwtSecret': 'JWT Secret',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.failed': 'Sign in failed',
    'nav.upload': 'Upload',
    'nav.settings': 'Settings',
    'settings.logout': 'Sign out',
    'upload.add': 'Add photos',
    'upload.start': 'Start upload',
    'upload.empty': 'No photos in queue',
  };

  static String t(String key, {String lang = 'zh'}) {
    final map = lang == 'en' ? _en : _zh;
    return map[key] ?? key;
  }
}
```

- [ ] **Step 2: Theme + stubs + router + main**

Use Material 3, dark/light system. Router redirects to `/login` when not logged in (for now hardcode `isLoggedIn: false` until Task 4). Shell: `NavigationBar` with Upload + Settings.

- [ ] **Step 3: Run analyzer**

```bash
cd flutter && flutter analyze
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add flutter/lib
git commit -m "feat(flutter): add app shell, theme, and routing"
```

---

### Task 3: API envelope, exceptions, Dio client

**Files:**
- Create: `flutter/lib/core/api/api_exception.dart`
- Create: `flutter/lib/core/api/envelope.dart`
- Create: `flutter/lib/core/api/api_client.dart`
- Create: `flutter/lib/core/error/error_messages.dart`
- Test: `flutter/test/core/envelope_test.dart`
- Test: `flutter/test/core/error_messages_test.dart`

**Interfaces:**
- Produces:
```dart
class ApiException implements Exception {
  ApiException({required this.message, this.statusCode, this.code, this.existingPhotoId});
  final String message;
  final int? statusCode;
  final String? code; // e.g. DUPLICATE_PHOTO
  final String? existingPhotoId;
}

T parseDataEnvelope<T>(Map<String, dynamic> json, T Function(Object? raw) map);
LoginPayload parseLoginEnvelope(Map<String, dynamic> json);

class ApiClient {
  ApiClient({required String baseUrl, String? token, void Function()? onUnauthorized});
  void updateBaseUrl(String baseUrl);
  void updateToken(String? token);
  Dio get dio;
  Future<Map<String, dynamic>> getJson(String path, {Map<String, dynamic>? query});
  Future<Map<String, dynamic>> postJson(String path, {Object? body});
  Future<Map<String, dynamic>> postMultipart(String path, {required FormData form, void Function(int, int)? onSendProgress});
}

String mapErrorMessage(Object error, {String lang = 'zh'});
```

- [ ] **Step 1: Write failing envelope tests**

```dart
// flutter/test/core/envelope_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mo_gallery_mobile/core/api/envelope.dart';

void main() {
  test('parseDataEnvelope reads data field', () {
    final result = parseDataEnvelope<Map<String, dynamic>>(
      {'success': true, 'data': {'id': '1'}},
      (raw) => Map<String, dynamic>.from(raw as Map),
    );
    expect(result['id'], '1');
  });

  test('parseLoginEnvelope reads token and user', () {
    final login = parseLoginEnvelope({
      'success': true,
      'token': 'abc',
      'user': {'username': 'admin', 'isAdmin': true},
    });
    expect(login.token, 'abc');
    expect(login.user.username, 'admin');
    expect(login.user.isAdmin, true);
  });
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd flutter && flutter test test/core/envelope_test.dart
```
Expected: FAIL (library not found / undefined).

- [ ] **Step 3: Implement envelope + ApiException + ApiClient**

Notes:
- `baseUrl` must be like `https://example.com/api` (strip trailing slash on server, then append `/api`).
- Interceptor: set `Authorization: Bearer $token` when token non-null.
- On HTTP 401 call `onUnauthorized`.
- On non-2xx: parse body for `error`/`message`; if `error == DUPLICATE_PHOTO` set `code` and `existingPhotoId`.
- `postMultipart` uses Dio `FormData`.

```dart
String normalizeApiBase(String serverUrl) {
  final trimmed = serverUrl.trim().replaceAll(RegExp(r'/+$'), '');
  if (trimmed.endsWith('/api')) return trimmed;
  return '$trimmed/api';
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd flutter && flutter test test/core/envelope_test.dart
```

- [ ] **Step 5: Commit**

```bash
git add flutter/lib/core flutter/test/core
git commit -m "feat(flutter): add Dio API client and envelope parsing"
```

---

### Task 4: Session store, auth API, login page

**Files:**
- Create: `flutter/lib/core/auth/session.dart`
- Create: `flutter/lib/core/auth/session_store.dart`
- Create: `flutter/lib/features/auth/auth_api.dart`
- Create: `flutter/lib/features/auth/auth_controller.dart`
- Modify: `flutter/lib/features/auth/login_page.dart`
- Modify: `flutter/lib/app/router.dart`, `flutter/lib/main.dart`
- Test: `flutter/test/features/auth_api_test.dart`

**Interfaces:**
```dart
class Session {
  Session({required this.serverUrl, required this.jwtSecret, required this.token, required this.username, required this.isAdmin});
  final String serverUrl;
  final String jwtSecret;
  final String token;
  final String username;
  final bool isAdmin;
}

abstract class SessionStore {
  Future<Session?> read();
  Future<void> write(Session session);
  Future<void> clear();
}

class AuthApi {
  AuthApi(this.client);
  final ApiClient client;
  Future<({String token, AuthUser user})> login({required String username, required String password});
}

class AuthController extends Notifier<AsyncValue<Session?>> {
  Future<void> restore();
  Future<void> login({required String serverUrl, required String jwtSecret, required String username, required String password});
  Future<void> logout();
}
```

- [ ] **Step 1: Write auth API test with http_mock_adapter**

Mock `POST /auth/login` (path relative to base `/api`) returning token. Assert `AuthApi.login` returns token.

- [ ] **Step 2: Run — FAIL, then implement AuthApi + SessionStore + controller**

`SessionStore` keys:
- `server_url`, `jwt_secret`, `token`, `username`, `is_admin`

Login page fields match Desktop; on success navigate to `/upload`.

JWT Secret: required non-empty in UI (stored for parity with Desktop; not sent to `/auth/login`).

- [ ] **Step 3: Wire providers**

`Provider<ApiClient>` rebuilt when session changes base URL + token.  
Router `refreshListenable` / redirect based on `session != null`.

- [ ] **Step 4: Test + analyze**

```bash
cd flutter && flutter test test/features/auth_api_test.dart && flutter analyze
```

- [ ] **Step 5: Commit**

```bash
git add flutter/lib flutter/test
git commit -m "feat(flutter): implement login and secure session"
```

---

### Task 5: File hash + sandbox copy

**Files:**
- Create: `flutter/lib/core/files/file_hash.dart`
- Create: `flutter/lib/core/files/sandbox_copy.dart`
- Test: `flutter/test/core/file_hash_test.dart`
- Create: `flutter/test/fixtures/sample.bin` (small known bytes)

**Interfaces:**
```dart
Future<String> sha256File(String path); // lowercase hex
Future<String> copyIntoUploadSandbox(String sourcePath, {required String taskId});
// Destination: {appDocDir}/upload_inbox/{taskId}/{basename}
```

- [ ] **Step 1: Hash test with known vector**

Write 3 bytes `0x61 0x62 0x63` ("abc") to temp file; expect  
`sha256File` == `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`.

- [ ] **Step 2: Implement + pass tests**

- [ ] **Step 3: Commit**

```bash
git add flutter/lib/core/files flutter/test
git commit -m "feat(flutter): add file hash and sandbox copy helpers"
```

---

### Task 6: Drift upload queue repository

**Files:**
- Create: `flutter/lib/core/db/tables.dart`
- Create: `flutter/lib/core/db/app_database.dart`
- Create: `flutter/lib/features/upload/upload_models.dart`
- Create: `flutter/lib/features/upload/upload_queue_repository.dart`
- Create: `flutter/lib/features/upload/upload_settings.dart`
- Test: `flutter/test/features/upload_queue_repository_test.dart`

**Interfaces:**
```dart
enum UploadTaskStatus { pending, uploading, done, error, duplicate }

class UploadBatchSettings {
  const UploadBatchSettings({
    this.albumIds = const [],
    this.storyIds = const [],
    this.filmRollId,
    this.compressEnabled = true,
    this.maxSizeMb,
    this.showFlag = true,
    this.stripGps = false,
    this.titlePrefix = '',
  });
  final List<String> albumIds;
  final List<String> storyIds;
  final String? filmRollId;
  final bool compressEnabled;
  final double? maxSizeMb;
  final bool showFlag;
  final bool stripGps;
  final String titlePrefix;
  Map<String, dynamic> toJson();
  factory UploadBatchSettings.fromJson(Map<String, dynamic> json);
}

class UploadTask {
  // id, batchId, localPath, fileName, fileHash, status, progress, errorMessage,
  // settingsJson, photoId, attemptCount, createdAt, updatedAt
}

class UploadQueueRepository {
  Future<void> enqueue({required List<String> sandboxPaths, required UploadBatchSettings settings, required String batchId});
  Stream<List<UploadTask>> watchAll();
  Future<List<UploadTask>> listByStatus(UploadTaskStatus status);
  Future<void> updateTask(UploadTask task);
  Future<UploadTask?> claimNextPending(); // sets uploading
  Future<void> deleteTask(String id);
  Future<void> resetStuckUploadingToPending(); // on app start
}
```

**Drift table `upload_tasks`:**
- `id` text PK  
- `batch_id` text  
- `local_path` text  
- `file_name` text  
- `file_hash` text  
- `status` text  
- `progress` int  
- `error_message` text nullable  
- `settings_json` text  
- `photo_id` text nullable  
- `attempt_count` int  
- `created_at` int (ms)  
- `updated_at` int (ms)

- [ ] **Step 1: Write repository unit test using in-memory/native Drift**

Use `NativeDatabase.memory()` for tests. Enqueue 2 tasks → claimNextPending returns one with status uploading → mark done → watch emits.

- [ ] **Step 2: Implement tables, run build_runner**

```bash
cd flutter && dart run build_runner build --delete-conflicting-outputs
```

- [ ] **Step 3: Implement repository until tests pass**

- [ ] **Step 4: Commit**

```bash
git add flutter/lib/core/db flutter/lib/features/upload flutter/test
git commit -m "feat(flutter): add durable upload queue with Drift"
```

---

### Task 7: Photos API (duplicate check + multipart upload)

**Files:**
- Create: `flutter/lib/features/upload/photos_api.dart`
- Test: `flutter/test/features/photos_api_test.dart`

**Interfaces:**
```dart
class PhotoDto {
  PhotoDto({required this.id, required this.title, this.thumbnailUrl, this.url});
  final String id;
  final String title;
  final String? thumbnailUrl;
  final String? url;
  factory PhotoDto.fromJson(Map<String, dynamic> json);
}

class DuplicateInfo {
  DuplicateInfo({required this.id, required this.title});
  final String id;
  final String title;
}

class PhotosApi {
  PhotosApi(this.client);
  final ApiClient client;

  Future<Map<String, DuplicateInfo>> checkDuplicates(List<String> fileHashes);

  /// Throws ApiException with code DUPLICATE_PHOTO on 409.
  Future<PhotoDto> uploadPhoto({
    required String filePath,
    required String title,
    required String fileHash,
    String? filmRollId,
    bool showFlag = true,
    bool compressEnabled = false,
    double? maxSizeMb,
    bool stripGps = false,
    void Function(int sent, int total)? onSendProgress,
  });
}
```

Multipart fields (mirror `src/lib/api/photos.ts` + Desktop):
- `file` from path via `MultipartFile.fromFile`
- `title`, `origin_flag=mobile`, `file_hash`
- optional `film_roll_id`, `show_flag` (`true`/`false`), `compression_mode=compress`, `max_size_mb`, `strip_gps=true`

- [ ] **Step 1: Mock tests for success + 409 duplicate**

- [ ] **Step 2: Implement PhotosApi**

- [ ] **Step 3: Pass tests + commit**

```bash
git commit -m "feat(flutter): add photos upload and duplicate-check API"
```

---

### Task 8: Catalog APIs (albums, stories, film rolls) + attach

**Files:**
- Create: `flutter/lib/features/catalog/albums_api.dart`
- Create: `flutter/lib/features/catalog/stories_api.dart`
- Create: `flutter/lib/features/catalog/film_rolls_api.dart`

**Interfaces:**
```dart
class IdName { IdName({required this.id, required this.name}); final String id; final String name; }

class AlbumsApi {
  Future<List<IdName>> list();
  Future<void> addPhotos(String albumId, List<String> photoIds);
}
class StoriesApi {
  Future<List<IdName>> list();
  Future<void> addPhotos(String storyId, List<String> photoIds);
}
class FilmRollsApi {
  Future<List<IdName>> list();
  Future<void> addPhotos(String rollId, List<String> photoIds);
}
```

Parse list endpoints: unwrap `data` array; map `id` + `name` (or `title` for stories if field is `title` — check response: Story uses `title`).

**Story list field:** use `title` as display name, store as `IdName.name = title`.

- [ ] **Step 1: Implement three API classes with defensive JSON parsing**

- [ ] **Step 2: Optional mock test for albums addPhotos body `{photoIds: [...]}`**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(flutter): add album story and film-roll catalog APIs"
```

---

### Task 9: Upload worker (pipeline)

**Files:**
- Create: `flutter/lib/features/upload/upload_worker.dart`
- Create: `flutter/lib/features/upload/recent_targets_store.dart`
- Test: extend `upload_queue_repository_test.dart` or add `upload_worker_test.dart` with fakes

**Interfaces:**
```dart
class UploadWorker {
  UploadWorker({
    required UploadQueueRepository queue,
    required PhotosApi photosApi,
    required AlbumsApi albumsApi,
    required StoriesApi storiesApi,
    required FilmRollsApi filmRollsApi,
    required RecentTargetsStore recentTargets,
  });

  /// Call on app start after resetStuckUploadingToPending.
  Future<void> start();
  Future<void> stop();
  Future<void> kick(); // wake loop after enqueue
}

class RecentTargetsStore {
  Future<UploadBatchSettings?> read();
  Future<void> write(UploadBatchSettings settings);
}
```

**Per-task pipeline:**
1. Ensure file exists at `localPath`; else status=error `"本地文件丢失"`.
2. If `fileHash` empty, compute `sha256File`.
3. `checkDuplicates([hash])` — if hit, status=duplicate, store existing id in errorMessage/photoId as appropriate.
4. Optional compress via `flutter_image_compress` when `settings.compressEnabled` (write temp file, upload compressed path).
5. `uploadPhoto(...)` with progress → update progress 0–100.
6. On success: for each `albumId` call `addPhotos`; same for stories; if `filmRollId` set and not already applied on upload form, call film roll add (prefer sending `film_roll_id` on upload to avoid double-associate).
7. status=done, `photoId=...`, `progress=100`.
8. On `ApiException.code == DUPLICATE_PHOTO` → duplicate.
9. On other errors → error, `attemptCount++`; if `attemptCount < 5` leave as pending after delay (worker schedules retry), else stay error.
10. On full batch success, `recentTargets.write(settings)`.

**Concurrency:** one task at a time in P0.

- [ ] **Step 1: Fake APIs unit test for happy path + duplicate path**

- [ ] **Step 2: Implement worker**

- [ ] **Step 3: Start worker from `main.dart` / app bootstrap when session present**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(flutter): implement upload worker pipeline"
```

---

### Task 10: Upload UI — pick, enqueue, queue list, targets

**Files:**
- Modify: `flutter/lib/features/upload/upload_page.dart`
- Create: `flutter/lib/features/upload/target_picker_sheet.dart`
- Android: ensure `AndroidManifest.xml` has `INTERNET`, and for Android 13+ photo permissions as required by `image_picker`

**Behavior:**
1. On open: load `RecentTargetsStore` into form state.
2. FAB / button 「添加照片」→ `ImagePicker().pickMultiImage()`.
3. For each XFile: generate taskId, `copyIntoUploadSandbox`, compute hash, enqueue with current settings.
4. List queue: thumbnail from file, status chip, progress bar, error text, swipe/delete for non-uploading.
5. 「目标」button opens sheet: multi-select albums, multi-select stories, single film roll, toggles compress/show/stripGps.
6. 「全部重试」: set error tasks back to pending + `worker.kick()`.
7. Clear completed button optional.

- [ ] **Step 1: Implement target picker + upload page wired to Riverpod**

- [ ] **Step 2: Manual checklist on emulator**
  - Login against local/dev server
  - Pick 2 images, see queue
  - Complete upload appears on web admin

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(flutter): build upload page and target picker"
```

---

### Task 11: Android foreground task + process death recovery

**Files:**
- Modify: `flutter/android/app/src/main/AndroidManifest.xml`
- Modify: `flutter/lib/main.dart` / `upload_worker.dart` to integrate `flutter_foreground_task`
- Create: `flutter/lib/features/upload/foreground_upload_service.dart` if needed

**Requirements:**
- While any task is `pending` or `uploading`, start foreground service with notification title `MO Gallery 上传中` and progress text.
- On app cold start: `resetStuckUploadingToPending()` then `worker.start()`.
- Document in README that OEM battery savers may still kill background work; task-level resume still works when app reopened.

- [ ] **Step 1: Add permissions**

```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
```

Register foreground service per `flutter_foreground_task` docs.

- [ ] **Step 2: Integrate start/stop with worker state**

- [ ] **Step 3: Manual test — start upload, swipe away app, reopen — pending continues; no duplicate photos (hash)**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(flutter): add Android foreground upload service"
```

---

### Task 12: Settings page + logout + polish errors

**Files:**
- Modify: `flutter/lib/features/settings/settings_page.dart`
- Modify: `flutter/lib/core/error/error_messages.dart`

**Settings shows:** server URL (read-only), username, language toggle (zh/en), logout button.

Map errors:
- timeout → 网络超时
- 413 → 文件过大
- connection error → 无法连接服务器
- 401 → 登录已过期

- [ ] **Step 1: Implement settings UI + logout clears session and queue pause**

- [ ] **Step 2: error_messages unit tests**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(flutter): settings, logout, and error copy"
```

---

### Task 13: README, root mention, final verification

**Files:**
- Create/Modify: `flutter/README.md`
- Optional short note in root `README.md` under modules table (one row for Flutter) — only if user-facing docs already list Desktop; keep minimal.

**flutter/README.md must include:**
- Prerequisites (Flutter SDK)
- `flutter pub get`
- `flutter run`
- Login fields explanation (server + JWT Secret + admin creds)
- P0 scope / P1 P2 not included
- How to point at a self-hosted instance

- [ ] **Step 1: Write README**

- [ ] **Step 2: Full verify**

```bash
cd flutter && flutter analyze && flutter test
```
Expected: no errors; all tests pass.

- [ ] **Step 3: Manual P0 acceptance (from requirements + design)**

1. Admin login works; session survives restart  
2. Multi-select creates batch  
3. Recent targets restore  
4. Can change albums/stories/film roll before enqueue  
5. Upload attaches to albums/stories  
6. Retry on failure  
7. Kill app; reopen; incomplete tasks continue without duplicate records  
8. Web admin shows photos with origin mobile  

- [ ] **Step 4: Final commit**

```bash
git add flutter/README.md README.md
git commit -m "docs(flutter): add mobile app README and verify P0"
```

---

## Out of scope for this plan (follow-up plans)

- **P1** Gallery tab (admin photo list + detail)
- **P2** Album/film-roll CRUD management screens
- iOS TestFlight / signing
- Byte-range resumable uploads
- Client EXIF extraction (`exif_json`)
- Linux DO OAuth on mobile

## Spec coverage checklist

| Spec / requirements item | Task |
|--------------------------|------|
| Flutter under `flutter/` | 1 |
| Desktop-aligned login | 4 |
| JWT session + secure storage | 4 |
| Multi-select + sandbox copy | 5, 10 |
| SHA-256 + duplicate check | 5, 7, 9 |
| Durable queue + task resume | 6, 9, 11 |
| Multipart upload `origin_flag=mobile` | 7, 9 |
| Multi album + multi story targets | 8, 9, 10 |
| Film roll target | 7–10 |
| Recent targets | 9, 10 |
| Progress UI + retry | 10 |
| Foreground / kill recovery | 11 |
| Settings + logout | 12 |
| Tests + analyze baseline | 3–7, 13 |
| P1/P2 | Out of scope section |

## Self-review notes

- No TBD placeholders; API paths match `src/lib/api/*` and Hono routes.
- Types consistent: `UploadBatchSettings`, `UploadTask`, `PhotosApi.uploadPhoto`, `Session`.
- Backend zero-change assumed; film roll via multipart `film_roll_id` preferred.
- P1/P2 deliberately deferred so this plan ships working P0 software alone.
