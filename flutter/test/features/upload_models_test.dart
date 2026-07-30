import 'package:flutter_test/flutter_test.dart';
import 'package:mo_gallery_mobile/features/upload/upload_models.dart';

void main() {
  group('UploadBatchSettings photo type', () {
    test('switching to digital clears the selected film roll', () {
      final settings = const UploadBatchSettings(
        photoType: UploadPhotoType.film,
        filmRollId: 'roll-1',
      ).copyWith(photoType: UploadPhotoType.digital);

      expect(settings.photoType, UploadPhotoType.digital);
      expect(settings.filmRollId, isNull);
    });

    test('film photo type preserves the selected film roll', () {
      final settings = const UploadBatchSettings()
          .copyWith(photoType: UploadPhotoType.film)
          .copyWith(filmRollId: 'roll-1');

      expect(settings.photoType, UploadPhotoType.film);
      expect(settings.filmRollId, 'roll-1');
    });

    test('legacy settings decode as digital and discard a film roll', () {
      final settings = UploadBatchSettings.fromJson({
        'filmRollId': 'legacy-roll',
      });

      expect(settings.photoType, UploadPhotoType.digital);
      expect(settings.filmRollId, isNull);
    });

    test('film type and film roll survive serialization', () {
      const original = UploadBatchSettings(
        photoType: UploadPhotoType.film,
        filmRollId: 'roll-1',
      );

      final decoded = UploadBatchSettings.decode(original.encode());

      expect(decoded.photoType, UploadPhotoType.film);
      expect(decoded.filmRollId, 'roll-1');
    });
  });

  group('UploadBatchSettings metadata params', () {
    test('categories and storage settings survive serialization', () {
      const original = UploadBatchSettings(
        categories: ['street', 'travel'],
        storageSourceId: 'src-1',
        storagePath: 'mobile/2026',
        storagePathFull: true,
        titlePrefix: 'MO-',
        maxSizeMb: 2,
      );

      final decoded = UploadBatchSettings.decode(original.encode());

      expect(decoded.categories, ['street', 'travel']);
      expect(decoded.storageSourceId, 'src-1');
      expect(decoded.storagePath, 'mobile/2026');
      expect(decoded.storagePathFull, isTrue);
      expect(decoded.titlePrefix, 'MO-');
      expect(decoded.maxSizeMb, 2);
    });

    test('legacy settings decode without categories or storage', () {
      final settings = UploadBatchSettings.fromJson({
        'albumIds': ['a1'],
      });

      expect(settings.categories, isEmpty);
      expect(settings.storageSourceId, isNull);
      expect(settings.storagePath, '');
      expect(settings.storagePathFull, isFalse);
    });
  });
}
