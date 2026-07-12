import 'package:flutter_test/flutter_test.dart';
import 'package:mo_gallery_mobile/core/api/envelope.dart';

void main() {
  test('normalizeApiBase appends /api', () {
    expect(normalizeApiBase('https://example.com'), 'https://example.com/api');
    expect(normalizeApiBase('https://example.com/'), 'https://example.com/api');
    expect(normalizeApiBase('https://example.com/api'), 'https://example.com/api');
  });

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
