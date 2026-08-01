import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'session.dart';

abstract class SessionStore {
  Future<Session?> read();
  Future<Session?> readActive();
  Future<String?> readActiveId();
  Future<Session?> readById(String environmentId);
  Future<List<Session>> list();
  Future<void> write(Session session, {bool makeActive = true});
  Future<void> setActive(String environmentId);
  Future<void> remove(String environmentId);
  Future<void> clearActiveToken();
  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _kServer = 'server_url';
  static const _kLoginUrl = 'login_url';
  static const _kSecret = 'jwt_secret';
  static const _kToken = 'token';
  static const _kUsername = 'username';
  static const _kIsAdmin = 'is_admin';
  static const _kEnvironments = 'server_environments_v2';
  static const _kActiveEnvironment = 'active_server_environment_v2';

  Future<List<Session>> _readAll() async {
    await _migrateLegacySession();
    final raw = await _storage.read(key: _kEnvironments);
    if (raw == null || raw.isEmpty) return const [];
    try {
      final decoded = jsonDecode(raw) as List<dynamic>;
      return decoded
          .whereType<Map<dynamic, dynamic>>()
          .map((value) => Session.fromJson(Map<String, dynamic>.from(value)))
          .where((session) => session.serverUrl.isNotEmpty)
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<void> _writeAll(List<Session> sessions) async {
    await _storage.write(
      key: _kEnvironments,
      value: jsonEncode(sessions.map((session) => session.toJson()).toList()),
    );
  }

  Future<void> _migrateLegacySession() async {
    final existing = await _storage.read(key: _kEnvironments);
    if (existing != null) return;

    final server = await _storage.read(key: _kServer);
    final loginUrl = await _storage.read(key: _kLoginUrl);
    final secret = await _storage.read(key: _kSecret);
    final token = await _storage.read(key: _kToken);
    final username = await _storage.read(key: _kUsername);
    final isAdmin = await _storage.read(key: _kIsAdmin);
    if (server == null || secret == null || username == null) {
      await _writeAll(const []);
      return;
    }

    final session = Session(
      environmentId: 'legacy',
      serverUrl: server,
      loginUrl: loginUrl,
      jwtSecret: secret,
      token: token ?? '',
      username: username,
      isAdmin: isAdmin == 'true',
    );
    await _writeAll([session]);
    await _storage.write(key: _kActiveEnvironment, value: 'legacy');
    await _deleteLegacyKeys();
  }

  Future<void> _deleteLegacyKeys() async {
    for (final key in [
      _kServer,
      _kLoginUrl,
      _kSecret,
      _kToken,
      _kUsername,
      _kIsAdmin,
    ]) {
      await _storage.delete(key: key);
    }
  }

  @override
  Future<Session?> read() async {
    final active = await readActive();
    return active?.isAuthenticated == true ? active : null;
  }

  @override
  Future<Session?> readActive() async {
    final sessions = await _readAll();
    if (sessions.isEmpty) return null;
    final activeId = await readActiveId();
    final active = sessions.cast<Session?>().firstWhere(
          (session) => session?.environmentId == activeId,
          orElse: () => sessions.first,
        );
    if (active != null && active.environmentId != activeId) {
      await setActive(active.environmentId);
    }
    return active;
  }

  @override
  Future<String?> readActiveId() async {
    await _migrateLegacySession();
    return _storage.read(key: _kActiveEnvironment);
  }

  @override
  Future<Session?> readById(String environmentId) async {
    final sessions = await _readAll();
    return sessions.cast<Session?>().firstWhere(
          (session) => session?.environmentId == environmentId,
          orElse: () => null,
        );
  }

  @override
  Future<List<Session>> list() => _readAll();

  @override
  Future<void> write(Session session, {bool makeActive = true}) async {
    final sessions = await _readAll();
    final index = sessions.indexWhere(
      (item) => item.environmentId == session.environmentId,
    );
    if (index == -1) {
      sessions.add(session);
    } else {
      sessions[index] = session;
    }
    await _writeAll(sessions);
    if (makeActive) {
      await setActive(session.environmentId);
    }
  }

  @override
  Future<void> setActive(String environmentId) async {
    await _storage.write(key: _kActiveEnvironment, value: environmentId);
  }

  @override
  Future<void> remove(String environmentId) async {
    final sessions = await _readAll();
    sessions.removeWhere((session) => session.environmentId == environmentId);
    await _writeAll(sessions);
    final activeId = await _storage.read(key: _kActiveEnvironment);
    if (activeId == environmentId) {
      if (sessions.isEmpty) {
        await _storage.delete(key: _kActiveEnvironment);
      } else {
        await setActive(sessions.first.environmentId);
      }
    }
  }

  @override
  Future<void> clearActiveToken() async {
    final sessions = await _readAll();
    final activeId = await _storage.read(key: _kActiveEnvironment);
    final index = sessions.indexWhere(
      (session) => session.environmentId == activeId,
    );
    if (index == -1) return;
    sessions[index] = sessions[index].copyWith(token: '');
    await _writeAll(sessions);
  }

  @override
  Future<void> clear() async {
    await clearActiveToken();
  }
}

/// In-memory store for tests.
class MemorySessionStore implements SessionStore {
  final List<Session> _sessions = [];
  String? _activeId;

  @override
  Future<Session?> read() async {
    final session = await readActive();
    return session?.isAuthenticated == true ? session : null;
  }

  @override
  Future<Session?> readActive() async {
    if (_sessions.isEmpty) return null;
    final active = await readById(_activeId ?? _sessions.first.environmentId);
    if (active != null) {
      _activeId = active.environmentId;
    }
    return active;
  }

  @override
  Future<String?> readActiveId() async => _activeId;

  @override
  Future<Session?> readById(String environmentId) async {
    return _sessions.cast<Session?>().firstWhere(
          (session) => session?.environmentId == environmentId,
          orElse: () => null,
        );
  }

  @override
  Future<List<Session>> list() async => List.unmodifiable(_sessions);

  @override
  Future<void> write(Session session, {bool makeActive = true}) async {
    final index = _sessions.indexWhere(
      (item) => item.environmentId == session.environmentId,
    );
    if (index == -1) {
      _sessions.add(session);
    } else {
      _sessions[index] = session;
    }
    if (makeActive) {
      _activeId = session.environmentId;
    }
  }

  @override
  Future<void> setActive(String environmentId) async {
    _activeId = environmentId;
  }

  @override
  Future<void> remove(String environmentId) async {
    _sessions.removeWhere((session) => session.environmentId == environmentId);
    if (_activeId == environmentId) {
      _activeId = _sessions.isEmpty ? null : _sessions.first.environmentId;
    }
  }

  @override
  Future<void> clearActiveToken() async {
    final index = _sessions.indexWhere(
      (session) => session.environmentId == _activeId,
    );
    if (index != -1) {
      _sessions[index] = _sessions[index].copyWith(token: '');
    }
  }

  @override
  Future<void> clear() async {
    await clearActiveToken();
  }
}
