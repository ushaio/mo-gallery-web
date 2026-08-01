import 'dart:async';

import 'package:uuid/uuid.dart';

import '../../core/db/app_database.dart';
import 'upload_models.dart';

class UploadQueueRepository {
  UploadQueueRepository(
    this._db, {
    required this.environmentId,
    Uuid? uuid,
  }) : _uuid = uuid ?? const Uuid();

  final AppDatabase _db;
  final String environmentId;
  final Uuid _uuid;
  final _controller = StreamController<List<UploadTask>>.broadcast();

  Stream<List<UploadTask>> watchAll() async* {
    yield await listAll();
    yield* _controller.stream;
  }

  Future<List<UploadTask>> listAll() async {
    final db = await _db.database;
    final rows = await db.query(
      'upload_tasks',
      where: 'environment_id = ?',
      whereArgs: [environmentId],
      orderBy: 'sort_order ASC, created_at ASC',
    );
    return rows.map(UploadTask.fromMap).toList();
  }

  Future<List<UploadTask>> listByStatus(UploadTaskStatus status) async {
    final db = await _db.database;
    final rows = await db.query(
      'upload_tasks',
      where: 'environment_id = ? AND status = ?',
      whereArgs: [environmentId, status.name],
      orderBy: 'sort_order ASC, created_at ASC',
    );
    return rows.map(UploadTask.fromMap).toList();
  }

  Future<void> enqueue({
    required List<
            ({
              String taskId,
              String sandboxPath,
              String fileName,
              String fileHash
            })>
        items,
    required UploadBatchSettings settings,
    String? batchId,
  }) async {
    final db = await _db.database;
    final now = DateTime.now().millisecondsSinceEpoch;
    final bid = batchId ?? _uuid.v4();
    final settingsJson = settings.encode();
    final maxRows = await db.rawQuery(
      'SELECT MAX(sort_order) AS max_sort_order FROM upload_tasks WHERE environment_id = ?',
      [environmentId],
    );
    final maxSortOrder = maxRows.first['max_sort_order'] as int? ?? 0;
    final batch = db.batch();
    for (final entry in items.indexed) {
      final item = entry.$2;
      final task = UploadTask(
        id: item.taskId,
        environmentId: environmentId,
        batchId: bid,
        localPath: item.sandboxPath,
        fileName: item.fileName,
        fileHash: item.fileHash,
        status: UploadTaskStatus.pending,
        progress: 0,
        settingsJson: settingsJson,
        sortOrder: maxSortOrder + entry.$1 + 1,
        attemptCount: 0,
        createdAt: now,
        updatedAt: now,
      );
      batch.insert('upload_tasks', task.toMap());
    }
    await batch.commit(noResult: true);
    await _emit();
  }

  Future<void> updateTask(UploadTask task) async {
    final db = await _db.database;
    final updated =
        task.copyWith(updatedAt: DateTime.now().millisecondsSinceEpoch);
    await db.update(
      'upload_tasks',
      updated.toMap(),
      where: 'id = ? AND environment_id = ?',
      whereArgs: [task.id, environmentId],
    );
    await _emit();
  }

  Future<UploadTask?> claimNextPending() async {
    final db = await _db.database;
    return db.transaction((txn) async {
      final rows = await txn.query(
        'upload_tasks',
        where: 'environment_id = ? AND status = ?',
        whereArgs: [environmentId, UploadTaskStatus.pending.name],
        orderBy: 'sort_order ASC, created_at ASC',
        limit: 1,
      );
      if (rows.isEmpty) return null;
      final task = UploadTask.fromMap(rows.first);
      final now = DateTime.now().millisecondsSinceEpoch;
      final claimed = task.copyWith(
        status: UploadTaskStatus.uploading,
        progress: task.progress.clamp(0, 99),
        updatedAt: now,
        clearError: true,
      );
      await txn.update(
        'upload_tasks',
        claimed.toMap(),
        where: 'id = ? AND environment_id = ? AND status = ?',
        whereArgs: [
          task.id,
          environmentId,
          UploadTaskStatus.pending.name,
        ],
      );
      return claimed;
    }).then((task) async {
      if (task != null) await _emit();
      return task;
    });
  }

  Future<void> deleteTask(String id) async {
    final db = await _db.database;
    await db.delete(
      'upload_tasks',
      where: 'id = ? AND environment_id = ?',
      whereArgs: [id, environmentId],
    );
    await _emit();
  }

  Future<void> deleteAll() async {
    final db = await _db.database;
    await db.delete(
      'upload_tasks',
      where: 'environment_id = ?',
      whereArgs: [environmentId],
    );
    await _emit();
  }

  Future<bool> deleteTaskIfNotUploading(String id) async {
    final db = await _db.database;
    final deleted = await db.delete(
      'upload_tasks',
      where: 'id = ? AND environment_id = ? AND status != ?',
      whereArgs: [id, environmentId, UploadTaskStatus.uploading.name],
    );
    if (deleted > 0) await _emit();
    return deleted > 0;
  }

  Future<void> deleteByStatuses(List<UploadTaskStatus> statuses) async {
    if (statuses.isEmpty) return;
    final db = await _db.database;
    final placeholders = List.filled(statuses.length, '?').join(',');
    await db.delete(
      'upload_tasks',
      where: 'environment_id = ? AND status IN ($placeholders)',
      whereArgs: [
        environmentId,
        ...statuses.map((status) => status.name),
      ],
    );
    await _emit();
  }

  Future<void> resetStuckUploadingToPending() async {
    final db = await _db.database;
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.update(
      'upload_tasks',
      {
        'status': UploadTaskStatus.pending.name,
        'updated_at': now,
      },
      where: 'environment_id = ? AND status = ?',
      whereArgs: [environmentId, UploadTaskStatus.uploading.name],
    );
    await _emit();
  }

  Future<void> requeueErrors() async {
    final db = await _db.database;
    final now = DateTime.now().millisecondsSinceEpoch;
    await db.update(
      'upload_tasks',
      {
        'status': UploadTaskStatus.pending.name,
        'error_message': null,
        'progress': 0,
        'updated_at': now,
      },
      where: 'environment_id = ? AND status = ?',
      whereArgs: [environmentId, UploadTaskStatus.error.name],
    );
    await _emit();
  }

  Future<void> _emit() async {
    if (!_controller.isClosed) {
      _controller.add(await listAll());
    }
  }

  Future<void> dispose() async {
    await _controller.close();
  }
}
