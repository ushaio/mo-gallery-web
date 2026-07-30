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
    final repo = UploadQueueRepository(db, environmentId: 'production');
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
    expect(claimed.sortOrder, lessThan(2));

    await repo.updateTask(
      claimed.copyWith(
          status: UploadTaskStatus.done, progress: 100, photoId: 'p1'),
    );

    final all = await repo.listAll();
    expect(all.length, 2);
    expect(all.map((task) => task.id), ['t1', 't2']);
    expect(all.firstWhere((t) => t.id == 't1').status, UploadTaskStatus.done);

    final next = await repo.claimNextPending();
    expect(next?.id, 't2');
  });

  test('queues are isolated by environment', () async {
    final db = AppDatabase(
      factory: databaseFactoryFfi,
      path: inMemoryDatabasePath,
    );
    final production = UploadQueueRepository(
      db,
      environmentId: 'production',
    );
    final staging = UploadQueueRepository(
      db,
      environmentId: 'staging',
    );
    addTearDown(() async {
      await production.dispose();
      await staging.dispose();
      await db.close();
    });

    await production.enqueue(
      items: [
        (
          taskId: 'prod-task',
          sandboxPath: '/tmp/prod.jpg',
          fileName: 'prod.jpg',
          fileHash: 'prod-hash',
        ),
      ],
      settings: const UploadBatchSettings(),
    );
    await staging.enqueue(
      items: [
        (
          taskId: 'staging-task',
          sandboxPath: '/tmp/staging.jpg',
          fileName: 'staging.jpg',
          fileHash: 'staging-hash',
        ),
      ],
      settings: const UploadBatchSettings(),
    );

    expect((await production.listAll()).map((task) => task.id), ['prod-task']);
    expect((await staging.listAll()).map((task) => task.id), ['staging-task']);
    expect((await production.claimNextPending())?.id, 'prod-task');
    expect((await staging.claimNextPending())?.id, 'staging-task');
  });

  test('deleteAll only removes tasks from the target environment', () async {
    final db = AppDatabase(
      factory: databaseFactoryFfi,
      path: inMemoryDatabasePath,
    );
    final production = UploadQueueRepository(
      db,
      environmentId: 'production',
    );
    final staging = UploadQueueRepository(
      db,
      environmentId: 'staging',
    );
    addTearDown(() async {
      await production.dispose();
      await staging.dispose();
      await db.close();
    });

    await production.enqueue(
      items: [
        (
          taskId: 'prod-task',
          sandboxPath: '/tmp/prod.jpg',
          fileName: 'prod.jpg',
          fileHash: 'prod-hash',
        ),
      ],
      settings: const UploadBatchSettings(),
    );
    await staging.enqueue(
      items: [
        (
          taskId: 'staging-task',
          sandboxPath: '/tmp/staging.jpg',
          fileName: 'staging.jpg',
          fileHash: 'staging-hash',
        ),
      ],
      settings: const UploadBatchSettings(),
    );

    await staging.deleteAll();

    expect(await staging.listAll(), isEmpty);
    expect((await production.listAll()).map((task) => task.id), ['prod-task']);
  });
}
