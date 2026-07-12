import 'dart:async';
import 'dart:io';

import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path/path.dart' as p;

import '../../core/api/api_exception.dart';
import '../../core/error/error_messages.dart';
import '../../core/files/file_hash.dart';
import '../catalog/catalog_api.dart';
import 'photos_api.dart';
import 'recent_targets_store.dart';
import 'upload_models.dart';
import 'upload_queue_repository.dart';

typedef ForegroundSync = Future<void> Function({
  required bool active,
  required String detail,
});

class UploadWorker {
  UploadWorker({
    required UploadQueueRepository queue,
    required PhotosApi photosApi,
    required AlbumsApi albumsApi,
    required StoriesApi storiesApi,
    required FilmRollsApi filmRollsApi,
    required RecentTargetsStore recentTargets,
    this.maxAttempts = 5,
    this.lang = 'zh',
    this.onForeground,
  })  : _queue = queue,
        _photosApi = photosApi,
        _albumsApi = albumsApi,
        _storiesApi = storiesApi,
        _filmRollsApi = filmRollsApi,
        _recentTargets = recentTargets;

  final UploadQueueRepository _queue;
  final PhotosApi _photosApi;
  final AlbumsApi _albumsApi;
  final StoriesApi _storiesApi;
  // Reserved for attach retry when multipart film_roll_id was not used.
  // ignore: unused_field
  final FilmRollsApi _filmRollsApi;
  final RecentTargetsStore _recentTargets;
  final int maxAttempts;
  final String lang;
  final ForegroundSync? onForeground;

  bool _running = false;
  bool _loopActive = false;
  Completer<void>? _wake;

  Future<void> start() async {
    _running = true;
    await _queue.resetStuckUploadingToPending();
    unawaited(_loop());
  }

  Future<void> stop() async {
    _running = false;
    _wake?.complete();
    _wake = null;
    await onForeground?.call(active: false, detail: '');
  }

  Future<void> kick() async {
    if (!_running) {
      await start();
      return;
    }
    _wake?.complete();
    _wake = null;
    if (!_loopActive) {
      unawaited(_loop());
    }
  }

  Future<void> _loop() async {
    if (_loopActive) return;
    _loopActive = true;
    try {
      while (_running) {
        final task = await _queue.claimNextPending();
        if (task == null) {
          await onForeground?.call(active: false, detail: '');
          _wake = Completer<void>();
          await _wake!.future;
          continue;
        }
        await onForeground?.call(
          active: true,
          detail: task.fileName,
        );
        await _process(task);
      }
    } finally {
      _loopActive = false;
    }
  }

  Future<void> _process(UploadTask task) async {
    try {
      final file = File(task.localPath);
      if (!await file.exists()) {
        await _queue.updateTask(
          task.copyWith(
            status: UploadTaskStatus.error,
            errorMessage: '本地文件丢失',
            attemptCount: task.attemptCount + 1,
          ),
        );
        return;
      }

      var hash = task.fileHash;
      if (hash.isEmpty) {
        hash = await sha256File(task.localPath);
        task = task.copyWith(fileHash: hash);
        await _queue.updateTask(task);
      }

      final duplicates = await _photosApi.checkDuplicates([hash]);
      final existing = duplicates[hash];
      if (existing != null) {
        await _queue.updateTask(
          task.copyWith(
            status: UploadTaskStatus.duplicate,
            photoId: existing.id,
            progress: 100,
            errorMessage: existing.title.isEmpty
                ? 'DUPLICATE_PHOTO'
                : existing.title,
          ),
        );
        return;
      }

      final settings = task.settings;
      var uploadPath = task.localPath;
      if (settings.compressEnabled) {
        final compressed = await _maybeCompress(task.localPath, task.id);
        if (compressed != null) uploadPath = compressed;
      }

      final title = settings.titlePrefix.isEmpty
          ? task.fileName
          : '${settings.titlePrefix}${task.fileName}';

      final photo = await _photosApi.uploadPhoto(
        filePath: uploadPath,
        title: title,
        fileHash: hash,
        filmRollId: settings.filmRollId,
        showFlag: settings.showFlag,
        compressEnabled: settings.compressEnabled,
        maxSizeMb: settings.maxSizeMb,
        stripGps: settings.stripGps,
        onSendProgress: (sent, total) async {
          if (total <= 0) return;
          final pct = ((sent / total) * 100).floor().clamp(0, 99);
          await _queue.updateTask(task.copyWith(progress: pct));
        },
      );

      task = task.copyWith(photoId: photo.id, progress: 95);
      await _queue.updateTask(task);

      try {
        for (final albumId in settings.albumIds) {
          await _albumsApi.addPhotos(albumId, [photo.id]);
        }
        for (final storyId in settings.storyIds) {
          await _storiesApi.addPhotos(storyId, [photo.id]);
        }
        // film_roll_id already applied on multipart when present
      } catch (e) {
        await _queue.updateTask(
          task.copyWith(
            status: UploadTaskStatus.error,
            progress: 100,
            photoId: photo.id,
            errorMessage: '照片已上传，目标挂接失败，可重试: ${mapErrorMessage(e, lang: lang)}',
            attemptCount: task.attemptCount + 1,
          ),
        );
        return;
      }

      await _queue.updateTask(
        task.copyWith(
          status: UploadTaskStatus.done,
          progress: 100,
          photoId: photo.id,
          clearError: true,
        ),
      );
      await _recentTargets.write(settings);
    } on ApiException catch (e) {
      if (e.isDuplicate) {
        await _queue.updateTask(
          task.copyWith(
            status: UploadTaskStatus.duplicate,
            photoId: e.existingPhotoId,
            progress: 100,
            errorMessage: e.message,
          ),
        );
        return;
      }
      await _failOrRetry(task, mapErrorMessage(e, lang: lang));
    } catch (e) {
      await _failOrRetry(task, mapErrorMessage(e, lang: lang));
    }
  }

  Future<void> _failOrRetry(UploadTask task, String message) async {
    final attempts = task.attemptCount + 1;
    if (attempts < maxAttempts) {
      await _queue.updateTask(
        task.copyWith(
          status: UploadTaskStatus.pending,
          errorMessage: message,
          attemptCount: attempts,
          progress: 0,
        ),
      );
      final delayMs = (500 * (1 << (attempts - 1).clamp(0, 5))).clamp(500, 16000);
      await Future<void>.delayed(Duration(milliseconds: delayMs));
      await kick();
    } else {
      await _queue.updateTask(
        task.copyWith(
          status: UploadTaskStatus.error,
          errorMessage: message,
          attemptCount: attempts,
        ),
      );
    }
  }

  Future<String?> _maybeCompress(String path, String taskId) async {
    try {
      final dir = Directory(p.dirname(path));
      final out = p.join(dir.path, 'compressed_$taskId.jpg');
      final result = await FlutterImageCompress.compressAndGetFile(
        path,
        out,
        quality: 85,
        minWidth: 4096,
        minHeight: 4096,
      );
      return result?.path;
    } catch (_) {
      return null;
    }
  }
}
