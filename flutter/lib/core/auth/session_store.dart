import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'session.dart';

abstract class SessionStore {
  Future<Session?> read();
  Future<void> write(Session session);
  Future<void> clear();
}

class SecureSessionStore implements SessionStore {
  SecureSessionStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _kServer = 'server_url';
  static const _kSecret = 'jwt_secret';
  static const _kToken = 'token';
  static const _kUsername = 'username';
  static const _kIsAdmin = 'is_admin';

  @override
  Future<Session?> read() async {
    final server = await _storage.read(key: _kServer);
    final secret = await _storage.read(key: _kSecret);
    final token = await _storage.read(key: _kToken);
    final username = await _storage.read(key: _kUsername);
    final isAdmin = await _storage.read(key: _kIsAdmin);
    if (server == null ||
        secret == null ||
        token == null ||
        username == null ||
        token.isEmpty) {
      return null;
    }
    return Session(
      serverUrl: server,
      jwtSecret: secret,
      token: token,
      username: username,
      isAdmin: isAdmin == 'true',
    );
  }

  @override
  Future<void> write(Session session) async {
    await _storage.write(key: _kServer, value: session.serverUrl);
    await _storage.write(key: _kSecret, value: session.jwtSecret);
    await _storage.write(key: _kToken, value: session.token);
    await _storage.write(key: _kUsername, value: session.username);
    await _storage.write(
      key: _kIsAdmin,
      value: session.isAdmin ? 'true' : 'false',
    );
  }

  @override
  Future<void> clear() async {
    await _storage.delete(key: _kServer);
    await _storage.delete(key: _kSecret);
    await _storage.delete(key: _kToken);
    await _storage.delete(key: _kUsername);
    await _storage.delete(key: _kIsAdmin);
  }
}

/// In-memory store for tests.
class MemorySessionStore implements SessionStore {
  Session? _session;

  @override
  Future<Session?> read() async => _session;

  @override
  Future<void> write(Session session) async {
    _session = session;
  }

  @override
  Future<void> clear() async {
    _session = null;
  }
}
