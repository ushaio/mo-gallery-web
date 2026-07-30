import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';

import '../core/api/api_client.dart';
import '../core/api/api_exception.dart';
import '../core/api/server_endpoint.dart';
import '../core/auth/session.dart';
import '../core/auth/session_store.dart';
import '../core/db/app_database.dart';
import '../core/files/sandbox_copy.dart';
import '../features/auth/auth_api.dart';
import '../features/catalog/catalog_api.dart';
import '../features/upload/foreground_upload_service.dart';
import '../features/upload/photos_api.dart';
import '../features/upload/recent_targets_store.dart';
import '../features/upload/upload_queue_repository.dart';
import '../features/upload/upload_worker.dart';

final languageProvider = StateProvider<String>((ref) => 'zh');

final authFailureProvider = StateProvider<ApiException?>((ref) => null);

/// Bumped when the user double-taps the active bottom/rail tab.
/// Values: 'upload' | 'gallery' | 'stories' | 'settings'
final tabRefreshProvider = StateProvider<String?>((ref) => null);

final sessionStoreProvider = Provider<SessionStore>((ref) {
  return SecureSessionStore();
});

final appDatabaseProvider = Provider<AppDatabase>((ref) {
  final db = AppDatabase();
  ref.onDispose(db.close);
  return db;
});

final uploadQueueProvider = Provider<UploadQueueRepository>((ref) {
  final environmentId = ref.watch(
    authControllerProvider.select(
      (auth) => auth.valueOrNull?.environmentId ?? 'legacy',
    ),
  );
  final repo = UploadQueueRepository(
    ref.watch(appDatabaseProvider),
    environmentId: environmentId,
  );
  ref.onDispose(repo.dispose);
  return repo;
});

final recentTargetsProvider = Provider<RecentTargetsStore>((ref) {
  final environmentId = ref.watch(
    authControllerProvider.select(
      (auth) => auth.valueOrNull?.environmentId ?? 'legacy',
    ),
  );
  return RecentTargetsStore(environmentId: environmentId);
});

final environmentsProvider = FutureProvider<List<Session>>((ref) async {
  return ref.watch(sessionStoreProvider).list();
});

class AuthController extends StateNotifier<AsyncValue<Session?>> {
  AuthController(this._ref) : super(const AsyncValue.loading()) {
    restore();
  }

  final Ref _ref;
  ApiClient? _client;
  UploadWorker? _worker;
  UploadQueueRepository? _workerQueue;
  bool _switching = false;

  ApiClient get client {
    final existing = _client;
    if (existing != null) return existing;
    final c = _createClient(
      baseUrl: 'http://localhost',
      environmentId: null,
      token: null,
    );
    _client = c;
    return c;
  }

  Future<void> restore() async {
    state = const AsyncValue.loading();
    try {
      final profile = await _ref.read(sessionStoreProvider).readActive();
      final session = profile?.isAuthenticated == true ? profile : null;
      if (session == null) {
        _client = null;
        state = const AsyncValue.data(null);
      } else {
        _client = _createSessionClient(session);
        state = AsyncValue.data(session);
        await _ensureWorkerStarted(session);
      }
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
    final endpoint = parseServerEndpoint(serverUrl);
    if (jwtSecret.trim().isEmpty ||
        username.trim().isEmpty ||
        password.isEmpty) {
      throw ArgumentError('missing fields');
    }
    final store = _ref.read(sessionStoreProvider);
    final activeProfile = await store.readActive();
    final environmentId = activeProfile?.environmentId ?? const Uuid().v4();
    final loginClient = _createClient(
      baseUrl: endpoint.baseUrl,
      environmentId: environmentId,
      token: null,
    );
    final payload = await AuthApi(loginClient).login(
      username: username.trim(),
      password: password,
      loginSlug: endpoint.loginSlug,
    );
    final session = Session(
      environmentId: environmentId,
      environmentName: activeProfile?.environmentName ?? '',
      serverUrl: endpoint.baseUrl,
      loginUrl: endpoint.loginUrl,
      jwtSecret: jwtSecret.trim(),
      token: payload.token,
      username: payload.user.username.isEmpty
          ? username.trim()
          : payload.user.username,
      isAdmin: payload.user.isAdmin,
    );
    await store.write(session);
    await _stopWorkerAndClient();
    _client = _createSessionClient(session);
    state = AsyncValue.data(session);
    await _ensureWorkerStarted(session);
    _ref.invalidate(environmentsProvider);
  }

  Future<void> logout({bool silent = false}) async {
    await _stopWorkerAndClient();
    await _ref.read(sessionStoreProvider).clear();
    if (!silent || state.valueOrNull != null) {
      state = const AsyncValue.data(null);
    }
    _ref.invalidate(environmentsProvider);
  }

  Future<void> addEnvironment({
    required String name,
    required String serverUrl,
    required String jwtSecret,
    required String username,
    required String password,
  }) async {
    final endpoint = parseServerEndpoint(serverUrl);
    if (name.trim().isEmpty ||
        jwtSecret.trim().isEmpty ||
        username.trim().isEmpty ||
        password.isEmpty) {
      throw ArgumentError('missing fields');
    }

    final environmentId = const Uuid().v4();
    final loginClient = _createClient(
      baseUrl: endpoint.baseUrl,
      environmentId: environmentId,
      token: null,
    );
    final payload = await AuthApi(loginClient).login(
      username: username.trim(),
      password: password,
      loginSlug: endpoint.loginSlug,
    );
    final session = Session(
      environmentId: environmentId,
      environmentName: name.trim(),
      serverUrl: endpoint.baseUrl,
      loginUrl: endpoint.loginUrl,
      jwtSecret: jwtSecret.trim(),
      token: payload.token,
      username: payload.user.username.isEmpty
          ? username.trim()
          : payload.user.username,
      isAdmin: payload.user.isAdmin,
    );

    await _stopWorkerAndClient();
    await _ref.read(sessionStoreProvider).write(session);
    _client = _createSessionClient(session);
    state = AsyncValue.data(session);
    await _ensureWorkerStarted(session);
    _ref.invalidate(environmentsProvider);
  }

  Future<void> switchEnvironment(String environmentId) async {
    if (_switching) return;
    _switching = true;
    try {
      final store = _ref.read(sessionStoreProvider);
      final target = await store.readById(environmentId);
      if (target == null) {
        throw StateError('environment not found');
      }
      if (state.valueOrNull?.environmentId == environmentId &&
          target.isAuthenticated) {
        return;
      }

      await _stopWorkerAndClient();
      await store.setActive(environmentId);
      _ref.read(authFailureProvider.notifier).state = null;
      if (!target.isAuthenticated) {
        state = const AsyncValue.data(null);
        return;
      }

      _client = _createSessionClient(target);
      state = AsyncValue.data(target);
      await _ensureWorkerStarted(target);
    } finally {
      _switching = false;
    }
  }

  Future<void> deleteEnvironment(String environmentId) async {
    if (_switching) return;
    _switching = true;
    try {
      final store = _ref.read(sessionStoreProvider);
      final target = await store.readById(environmentId);
      if (target == null) return;

      final activeId = await store.readActiveId();
      final deletingActive = activeId == environmentId;
      if (deletingActive) {
        await _stopWorkerAndClient();
      }

      final queue = UploadQueueRepository(
        _ref.read(appDatabaseProvider),
        environmentId: environmentId,
      );
      try {
        final tasks = await queue.listAll();
        await queue.deleteAll();
        for (final task in tasks) {
          try {
            await deleteSandboxTaskDir(task.id);
          } catch (_) {}
        }
      } finally {
        await queue.dispose();
      }
      await RecentTargetsStore(environmentId: environmentId).clear();
      await store.remove(environmentId);

      if (deletingActive) {
        final next = await store.readActive();
        if (next?.isAuthenticated == true) {
          _client = _createSessionClient(next!);
          state = AsyncValue.data(next);
          await _ensureWorkerStarted(next);
        } else {
          state = const AsyncValue.data(null);
        }
      }
    } finally {
      _switching = false;
      _ref.invalidate(environmentsProvider);
    }
  }

  ApiClient _createSessionClient(Session session) {
    return _createClient(
      baseUrl: session.serverUrl,
      environmentId: session.environmentId,
      token: session.token,
    );
  }

  ApiClient _createClient({
    required String baseUrl,
    required String? environmentId,
    required String? token,
  }) {
    return ApiClient(
      baseUrl: baseUrl,
      token: token,
      onUnauthorized: (error) {
        if (environmentId == null) return;
        unawaited(_handleUnauthorized(environmentId, error));
      },
    );
  }

  Future<void> _handleUnauthorized(
    String environmentId,
    ApiException error,
  ) async {
    if (_switching || state.valueOrNull?.environmentId != environmentId) {
      return;
    }
    _ref.read(authFailureProvider.notifier).state = error;
    await logout(silent: true);
  }

  Future<void> _stopWorkerAndClient() async {
    final worker = _worker;
    _worker = null;
    final workerQueue = _workerQueue;
    _workerQueue = null;
    final oldClient = _client;
    _client = null;
    final stopFuture = worker?.stop();
    oldClient?.cancel();
    await stopFuture;
    await worker?.waitUntilStopped();
    await workerQueue?.dispose();
  }

  Future<void> _ensureWorkerStarted(Session session) async {
    final existing = _worker;
    if (existing != null) {
      await existing.kick();
      return;
    }
    final queue = UploadQueueRepository(
      _ref.read(appDatabaseProvider),
      environmentId: session.environmentId,
    );
    final worker = UploadWorker(
      queue: queue,
      photosApi: PhotosApi(client),
      albumsApi: AlbumsApi(client),
      storiesApi: StoriesApi(client),
      filmRollsApi: FilmRollsApi(client),
      recentTargets: RecentTargetsStore(
        environmentId: session.environmentId,
      ),
      lang: _ref.read(languageProvider),
      onForeground: ({required active, required detail}) =>
          ForegroundUploadService.sync(active: active, detail: detail),
    );
    _workerQueue = queue;
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
  ref.watch(authControllerProvider);
  return ref.watch(authControllerProvider.notifier).client;
});

final sessionProvider = Provider<Session?>((ref) {
  return ref.watch(authControllerProvider).valueOrNull;
});

class AuthRouterListenable extends ChangeNotifier {
  void refresh() => notifyListeners();
}

final authListenableProvider = Provider<AuthRouterListenable>((ref) {
  final notifier = AuthRouterListenable();
  ref.listen<AsyncValue<Session?>>(authControllerProvider, (_, __) {
    notifier.refresh();
  });
  ref.onDispose(notifier.dispose);
  return notifier;
});
