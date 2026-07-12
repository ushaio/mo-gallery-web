import 'api_exception.dart';

class AuthUser {
  const AuthUser({
    required this.username,
    this.isAdmin = false,
  });

  final String username;
  final bool isAdmin;

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      username: (json['username'] as String?) ?? '',
      isAdmin: json['isAdmin'] == true || json['is_admin'] == true,
    );
  }
}

class LoginPayload {
  const LoginPayload({
    required this.token,
    required this.user,
  });

  final String token;
  final AuthUser user;
}

String normalizeApiBase(String serverUrl) {
  final trimmed = serverUrl.trim().replaceAll(RegExp(r'/+$'), '');
  if (trimmed.isEmpty) return trimmed;
  if (trimmed.endsWith('/api')) return trimmed;
  return '$trimmed/api';
}

String normalizeServerUrl(String serverUrl) {
  return serverUrl.trim().replaceAll(RegExp(r'/+$'), '');
}

T parseDataEnvelope<T>(
  Map<String, dynamic> json,
  T Function(Object? raw) map,
) {
  if (json['success'] == false) {
    throw ApiException(
      message: (json['message'] as String?) ??
          (json['error'] as String?) ??
          'Request failed',
      code: json['error'] is String ? json['error'] as String : null,
    );
  }
  return map(json['data']);
}

LoginPayload parseLoginEnvelope(Map<String, dynamic> json) {
  if (json['success'] == false) {
    throw ApiException(
      message: (json['message'] as String?) ??
          (json['error'] as String?) ??
          'Login failed',
      code: json['error'] is String ? json['error'] as String : null,
    );
  }
  final token = json['token'];
  if (token is! String || token.isEmpty) {
    throw ApiException(message: 'Unexpected login response (missing token)');
  }
  final userRaw = json['user'];
  final user = userRaw is Map
      ? AuthUser.fromJson(Map<String, dynamic>.from(userRaw))
      : const AuthUser(username: '');
  return LoginPayload(token: token, user: user);
}

ApiException apiExceptionFromBody(int? statusCode, Object? body) {
  if (body is Map) {
    final map = Map<String, dynamic>.from(body);
    final code = map['error'] is String ? map['error'] as String : null;
    final message = (map['message'] as String?) ??
        code ??
        'Request failed${statusCode != null ? ' ($statusCode)' : ''}';
    final existing = map['existingPhotoId'] as String? ??
        (map['existingPhoto'] is Map
            ? (map['existingPhoto'] as Map)['id'] as String?
            : null);
    return ApiException(
      message: message,
      statusCode: statusCode,
      code: code,
      existingPhotoId: existing,
    );
  }
  return ApiException(
    message: 'Request failed${statusCode != null ? ' ($statusCode)' : ''}',
    statusCode: statusCode,
  );
}
