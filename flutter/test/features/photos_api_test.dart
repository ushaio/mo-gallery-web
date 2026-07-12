import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:mo_gallery_mobile/core/api/api_client.dart';
import 'package:mo_gallery_mobile/core/api/api_exception.dart';
import 'package:mo_gallery_mobile/features/upload/photos_api.dart';

void main() {
  test('checkDuplicates parses map', () async {
    final dio = Dio(BaseOptions(baseUrl: 'https://example.com/api'));
    final adapter = DioAdapter(dio: dio);
    adapter.onPost(
      '/admin/photos/check-duplicate',
      (server) => server.reply(200, {
        'success': true,
        'data': {
          'duplicates': {
            'abc': {'id': 'p1', 'title': 'Existing'},
          },
          'hasDuplicates': true,
        },
      }),
      data: Matchers.any,
    );

    final api = PhotosApi(ApiClient(baseUrl: 'https://example.com', dio: dio));
    final result = await api.checkDuplicates(['abc']);
    expect(result['abc']?.id, 'p1');
    expect(result['abc']?.title, 'Existing');
  });

  test('uploadPhoto maps 409 duplicate', () async {
    final file = File(
      '${Directory.systemTemp.path}/mo_gallery_upload_${DateTime.now().microsecondsSinceEpoch}.jpg',
    );
    await file.writeAsBytes([0xFF, 0xD8, 0xFF, 0xD9]);

    final dio = Dio(BaseOptions(baseUrl: 'https://example.com/api'));
    final adapter = DioAdapter(dio: dio);
    adapter.onPost(
      '/admin/photos',
      (server) => server.reply(409, {
        'error': 'DUPLICATE_PHOTO',
        'message': 'exists',
        'existingPhotoId': 'px',
      }),
      data: Matchers.any,
    );

    final api = PhotosApi(ApiClient(baseUrl: 'https://example.com', dio: dio));
    try {
      await api.uploadPhoto(
        filePath: file.path,
        title: 't',
        fileHash: 'h',
      );
      fail('expected ApiException');
    } on ApiException catch (e) {
      expect(e.isDuplicate, isTrue);
      expect(e.existingPhotoId, 'px');
    } finally {
      try {
        if (await file.exists()) await file.delete();
      } catch (_) {}
    }
  });
}
