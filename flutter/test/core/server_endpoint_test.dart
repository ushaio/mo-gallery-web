import 'package:flutter_test/flutter_test.dart';
import 'package:mo_gallery_mobile/core/api/server_endpoint.dart';

void main() {
  test('parses a root server URL', () {
    final endpoint = parseServerEndpoint('http://localhost:3000/');

    expect(endpoint.baseUrl, 'http://localhost:3000');
    expect(endpoint.loginUrl, 'http://localhost:3000');
    expect(endpoint.loginSlug, isNull);
  });

  test('parses an administrator login URL', () {
    final endpoint = parseServerEndpoint(
      'https://gallery.example.com/login/shai/',
    );

    expect(endpoint.baseUrl, 'https://gallery.example.com');
    expect(endpoint.loginUrl, 'https://gallery.example.com/login/shai');
    expect(endpoint.loginSlug, 'shai');
  });

  test('rejects unsupported paths and query parameters', () {
    expect(
      () => parseServerEndpoint('https://gallery.example.com/admin'),
      throwsFormatException,
    );
    expect(
      () => parseServerEndpoint('https://gallery.example.com/login/shai?x=1'),
      throwsFormatException,
    );
  });
}
