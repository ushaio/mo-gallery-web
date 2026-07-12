import 'package:flutter_test/flutter_test.dart';
import 'package:mo_gallery_mobile/core/api/api_exception.dart';
import 'package:mo_gallery_mobile/core/error/error_messages.dart';

void main() {
  test('maps timeout and network codes', () {
    expect(
      mapErrorMessage(ApiException(message: 'timeout', code: 'TIMEOUT')),
      isNot(contains('timeout')),
    );
    expect(
      mapErrorMessage(ApiException(message: 'network', code: 'NETWORK')),
      isNotEmpty,
    );
  });

  test('maps 413 and 401', () {
    expect(
      mapErrorMessage(ApiException(message: 'big', statusCode: 413)),
      contains('压缩'),
    );
    expect(
      mapErrorMessage(ApiException(message: 'no', statusCode: 401)),
      contains('登录'),
    );
  });
}
