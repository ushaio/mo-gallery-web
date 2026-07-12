import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:mo_gallery_mobile/core/api/api_client.dart';
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
      data: Matchers.any,
    );

    final api = AuthApi(ApiClient(baseUrl: 'https://example.com', dio: dio));
    final result = await api.login(username: 'admin', password: 'secret');
    expect(result.token, 'jwt-token');
    expect(result.user.username, 'admin');
    expect(result.user.isAdmin, true);
  });
}
