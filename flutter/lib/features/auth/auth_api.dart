import '../../core/api/api_client.dart';
import '../../core/api/envelope.dart';

class AuthApi {
  AuthApi(this.client);

  final ApiClient client;

  Future<LoginPayload> login({
    required String username,
    required String password,
    String? loginSlug,
  }) async {
    final json = await client.postJson(
      '/auth/login',
      body: {
        'username': username,
        'password': password,
        if (loginSlug != null && loginSlug.isNotEmpty) 'loginSlug': loginSlug,
      },
    );
    return parseLoginEnvelope(json);
  }
}
