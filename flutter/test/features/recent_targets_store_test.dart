import 'package:flutter_test/flutter_test.dart';
import 'package:mo_gallery_mobile/features/upload/recent_targets_store.dart';
import 'package:mo_gallery_mobile/features/upload/upload_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  test('recent upload targets stay isolated by environment', () async {
    SharedPreferences.setMockInitialValues({});
    final preferences = await SharedPreferences.getInstance();
    final production = RecentTargetsStore(
      environmentId: 'production',
      prefs: preferences,
    );
    final staging = RecentTargetsStore(
      environmentId: 'staging',
      prefs: preferences,
    );

    await production.write(
      const UploadBatchSettings(albumIds: ['production-album']),
    );
    await staging.write(
      const UploadBatchSettings(albumIds: ['staging-album']),
    );

    expect((await production.read())?.albumIds, ['production-album']);
    expect((await staging.read())?.albumIds, ['staging-album']);
  });
}
