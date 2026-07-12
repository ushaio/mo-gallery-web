import 'package:flutter_test/flutter_test.dart';
import 'package:mo_gallery_mobile/core/db/app_database.dart';
import 'package:mo_gallery_mobile/features/upload/upload_models.dart';
import 'package:mo_gallery_mobile/features/upload/upload_queue_repository.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  test('enqueue claim and complete task', () async {
    final db = AppDatabase(
      factory: databaseFactoryFfi,
      path: inMemoryDatabasePath,
    );
    final repo = UploadQueueRepository(db);
    addTearDown(() async {
      await repo.dispose();
      await db.close();
    });

    await repo.enqueue(
      items: [
        (
          taskId: 't1',
          sandboxPath: '/tmp/a.jpg',
          fileName: 'a.jpg',
          fileHash: 'hash1',
        ),
        (
          taskId: 't2',
          sandboxPath: '/tmp/b.jpg',
          fileName: 'b.jpg',
          fileHash: 'hash2',
        ),
      ],
      settings: const UploadBatchSettings(albumIds: ['alb1']),
      batchId: 'batch1',
    );

    final claimed = await repo.claimNextPending();
    expect(claimed, isNotNull);
    expect(claimed!.status, UploadTaskStatus.uploading);
    expect(claimed.fileName, 'a.jpg');

    await repo.updateTask(
      claimed.copyWith(status: UploadTaskStatus.done, progress: 100, photoId: 'p1'),
    );

    final all = await repo.listAll();
    expect(all.length, 2);
    expect(all.firstWhere((t) => t.id == 't1').status, UploadTaskStatus.done);

    final next = await repo.claimNextPending();
    expect(next?.id, 't2');
  });
}
