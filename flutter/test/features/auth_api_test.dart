import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:mo_gallery_mobile/core/api/api_client.dart';
import 'package:mo_gallery_mobile/core/api/api_exception.dart';
import 'package:mo_gallery_mobile/features/auth/auth_api.dart';

void main() {
  test('login returns token and user', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.com/api'));
    final adapter = DioAdapter(dio: dio);
    adapter.onPost(
      '/auth/login',
      (server) => server.reply(200, {
        'success': true,
        'token': 'jwt-token',
        'user': {'username': 'admin', 'isAdmin': true},
      }),
      data: {
        'username': 'admin',
        'password': 'secret',
        'loginSlug': 'shai',
      },
    );

    final api = AuthApi(ApiClient(baseUrl: 'https://example.com', dio: dio));
    final result = await api.login(
      username: 'admin',
      password: 'secret',
      loginSlug: 'shai',
    );
    expect(result.token, 'jwt-token');
    expect(result.user.username, 'admin');
    expect(result.user.isAdmin, true);
  });

  test('login 401 preserves credentials error without expiring a session',
      () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.com/api'));
    final adapter = DioAdapter(dio: dio);
    var unauthorizedCalls = 0;
    adapter.onPost(
      '/auth/login',
      (server) => server.reply(401, {
        'code': 'INVALID_CREDENTIALS',
        'error': 'Invalid username or password',
      }),
      data: {
        'username': 'admin',
        'password': 'wrong',
      },
    );

    final api = AuthApi(ApiClient(
      baseUrl: 'https://example.com',
      dio: dio,
      onUnauthorized: (_) => unauthorizedCalls += 1,
    ));

    await expectLater(
      api.login(username: 'admin', password: 'wrong'),
      throwsA(isA<ApiException>()
          .having((error) => error.code, 'code', 'INVALID_CREDENTIALS')
          .having((error) => error.message, 'message',
              'Invalid username or password')),
    );
    expect(unauthorizedCalls, 0);
  });

  test('protected 401 reports administrator gate changes', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.com/api'));
    final adapter = DioAdapter(dio: dio);
    ApiException? unauthorizedError;
    adapter.onGet(
      '/protected',
      (server) => server.reply(401, {
        'code': 'ADMIN_LOGIN_GATE_CHANGED',
        'error': 'Administrator login URL has changed',
      }),
    );

    final client = ApiClient(
      baseUrl: 'https://example.com',
      token: 'jwt-token',
      dio: dio,
      onUnauthorized: (error) => unauthorizedError = error,
    );

    await expectLater(
      client.getJson('/protected'),
      throwsA(isA<ApiException>()),
    );
    expect(unauthorizedError?.code, 'ADMIN_LOGIN_GATE_CHANGED');
    expect(unauthorizedError?.statusCode, 401);
  });
}
