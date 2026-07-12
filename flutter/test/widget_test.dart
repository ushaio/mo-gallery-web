import 'package:flutter_test/flutter_test.dart';
import 'package:mo_gallery_mobile/core/api/envelope.dart';

void main() {
  test('package loads and normalizeApiBase works', () {
    expect(normalizeApiBase('http://localhost:3000'), 'http://localhost:3000/api');
  });
}
