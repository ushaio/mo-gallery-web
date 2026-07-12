import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/api/api_client.dart';
import '../core/api/envelope.dart';
import '../core/auth/session.dart';
import '../core/auth/session_store.dart';
import '../core/db/app_database.dart';
import '../features/auth/auth_api.dart';
import '../features/catalog/catalog_api.dart';
import '../features/upload/foreground_upload_service.dart';
import '../features/upload/photos_api.dart';
import '../features/upload/recent_targets_store.dart';
import '../features/upload/upload_queue_repository.dart';
import '../features/upload/upload_worker.dart';

final languageProvider = StateProvider<String>((ref) => 'zh');

final sessionStoreProvider = Provider<SessionStore>((ref) {
  return SecureSessionStore();
});

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

final uploadQueueProvider = Provider<UploadQueueRepository>((ref) {
  final repo = UploadQueueRepository(ref.watch(appDatabaseProvider));
  ref.onDispose(repo.dispose);
  return repo;
});

final recentTargetsProvider = Provider<RecentTargetsStore>((ref) {
  return RecentTargetsStore();
});

class AuthController extends StateNotifier<AsyncValue<Session?>> {
  AuthController(this._ref) : super(const AsyncValue.loading()) {
    restore();
  }

  final Ref _ref;
  ApiClient? _client;
  UploadWorker? _worker;

  ApiClient get client {
    final existing = _client;
    if (existing != null) return existing;
    final c = ApiClient(
      baseUrl: 'http://localhost',
      onUnauthorized: () {
        logout(silent: true);
      },
    );
    _client = c;
    return c;
  }

  Future<void> restore() async {
    state = const AsyncValue.loading();
    try {
      final session = await _ref.read(sessionStoreProvider).read();
      if (session != null) {
        _applySession(session);
        await _ensureWorkerStarted();
      }
      state = AsyncValue.data(session);
    } catch (e, st) {
      state = AsyncValue.error(e, st);
    }
  }

  Future<void> login({
    required String serverUrl,
    required String jwtSecret,
    required String username,
    required String password,
  }) async {
    final normalized = normalizeServerUrl(serverUrl);
    if (normalized.isEmpty ||
        jwtSecret.trim().isEmpty ||
        username.trim().isEmpty ||
        password.isEmpty) {
      throw ArgumentError('missing fields');
    }
    client.updateBaseUrl(normalized);
    client.updateToken(null);
    final payload = await AuthApi(client).login(
      username: username.trim(),
      password: password,
    );
    final session = Session(
      serverUrl: normalized,
      jwtSecret: jwtSecret.trim(),
      token: payload.token,
      username: payload.user.username.isEmpty
          ? username.trim()
          : payload.user.username,
      isAdmin: payload.user.isAdmin,
    );
    await _ref.read(sessionStoreProvider).write(session);
    _applySession(session);
    await _ensureWorkerStarted();
    state = AsyncValue.data(session);
  }

  Future<void> logout({bool silent = false}) async {
    await _worker?.stop();
    _worker = null;
    await _ref.read(sessionStoreProvider).clear();
    client.updateToken(null);
    if (!silent || state.valueOrNull != null) {
      state = const AsyncValue.data(null);
    }
  }

  void _applySession(Session session) {
    client.updateBaseUrl(session.serverUrl);
    client.updateToken(session.token);
  }

  Future<void> _ensureWorkerStarted() async {
    final existing = _worker;
    if (existing != null) {
      await existing.kick();
      return;
    }
    final worker = UploadWorker(
      queue: _ref.read(uploadQueueProvider),
      photosApi: PhotosApi(client),
      albumsApi: AlbumsApi(client),
      storiesApi: StoriesApi(client),
      filmRollsApi: FilmRollsApi(client),
      recentTargets: _ref.read(recentTargetsProvider),
      lang: _ref.read(languageProvider),
      onForeground: ({required active, required detail}) =>
          ForegroundUploadService.sync(active: active, detail: detail),
    );
    _worker = worker;
    await worker.start();
  }

  UploadWorker? get worker => _worker;
}

final authControllerProvider =
    StateNotifierProvider<AuthController, AsyncValue<Session?>>((ref) {
  return AuthController(ref);
});

final apiClientProvider = Provider<ApiClient>((ref) {
  return ref.watch(authControllerProvider.notifier).client;
});

final sessionProvider = Provider<Session?>((ref) {
  return ref.watch(authControllerProvider).valueOrNull;
});

final authListenableProvider = Provider<ValueNotifier<Session?>>((ref) {
  final notifier = ValueNotifier<Session?>(
    ref.read(authControllerProvider).valueOrNull,
  );
  ref.listen<AsyncValue<Session?>>(authControllerProvider, (_, next) {
    notifier.value = next.valueOrNull;
  });
  ref.onDispose(notifier.dispose);
  return notifier;
});
