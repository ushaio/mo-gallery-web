import 'dart:async';
import 'dart:io';

import '../../core/api/api_exception.dart';
import '../../core/error/error_messages.dart';
import '../../core/files/file_hash.dart';
import '../catalog/catalog_api.dart';
import 'exif_json.dart';
import 'image_compressor.dart';
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
  Future<void>? _loopFuture;

  Future<void> start() async {
    _running = true;
    await _queue.resetStuckUploadingToPending();
    _startLoop();
  }

  Future<void> stop() async {
    _running = false;
    final wake = _wake;
    if (wake != null && !wake.isCompleted) {
      wake.complete();
    }
    _wake = null;
    await onForeground?.call(active: false, detail: '');
  }

  Future<void> waitUntilStopped() async {
    await _loopFuture;
  }

  Future<void> kick() async {
    if (!_running) {
      await start();
      return;
    }
    final wake = _wake;
    if (wake != null && !wake.isCompleted) {
      wake.complete();
    }
    _wake = null;
    if (!_loopActive) {
      _startLoop();
    }
  }

  void _startLoop() {
    if (_loopFuture != null) return;
    final future = _loop();
    _loopFuture = future;
    unawaited(future.whenComplete(() {
      if (identical(_loopFuture, future)) {
        _loopFuture = null;
      }
    }));
  }

  Future<void> _loop() async {
    if (_loopActive) return;
    _loopActive = true;
    try {
      while (_running) {
        // Install the wake signal before querying the queue. If enqueue/kick
        // happens during the query, the completed signal is still observed
        // below instead of being lost in the old query-then-create window.
        final wake = Completer<void>();
        _wake = wake;
        final task = await _queue.claimNextPending();
        if (task == null) {
          await onForeground?.call(active: false, detail: '');
          if (!_running) break;
          // Poll infrequently as a lifecycle-safe fallback. A missed UI kick
          // (for example while restoring a session) must never leave durable
          // pending work asleep forever.
          await Future.any<void>([
            wake.future,
            Future<void>.delayed(const Duration(seconds: 2)),
          ]);
          continue;
        }
        if (identical(_wake, wake)) _wake = null;
        if (!_running) {
          await _pauseForAuthenticationFailure(task);
          break;
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

      // The queue claim marks the task as checking, so the UI can distinguish
      // duplicate detection from the later upload phase.
      final duplicates = await _photosApi.checkDuplicates([hash]);
      final existing = duplicates[hash];
      if (existing != null) {
        await _queue.updateTask(
          task.copyWith(
            status: UploadTaskStatus.duplicate,
            photoId: existing.id,
            progress: 100,
            errorMessage:
                existing.title.isEmpty ? 'DUPLICATE_PHOTO' : existing.title,
          ),
        );
        return;
      }

      final settings = task.settings;
      if (settings.compressEnabled) {
        await _queue.updateTask(
          task.copyWith(status: UploadTaskStatus.compressing, progress: 0),
        );
      }
      final exifJson = await extractExifJson(
        task.localPath,
        stripGps: settings.stripGps,
      );

      var uploadPath = task.localPath;
      if (settings.compressEnabled) {
        final compressedPath = '${task.localPath}.compressed.jpg';
        try {
          uploadPath = await compressImageForUpload(
            sourcePath: task.localPath,
            outputPath: compressedPath,
            maxSizeMb: settings.maxSizeMb,
          );
        } catch (_) {
          // Match web fallback behavior: compression failure must not lose the
          // upload. The original file remains the upload source.
          uploadPath = task.localPath;
        }
      }
      task = task.copyWith(status: UploadTaskStatus.uploading, progress: 0);
      await _queue.updateTask(task);

      // Align with web admin: photo titles drop the file extension
      // (UploadQueueContext fallbackTitle and the story editor both use
      // name.replace(/\.[^/.]+$/, '')). The titlePrefix feature is a
      // mobile-only enhancement and stays as-is.
      final titleBase = _stripExtension(task.fileName);
      final title = settings.titlePrefix.isEmpty
          ? titleBase
          : '${settings.titlePrefix}$titleBase';

      late final PhotoDto photo;
      try {
        photo = await _photosApi.uploadPhoto(
          filePath: uploadPath,
          title: title,
          fileHash: hash,
          categories: settings.categories,
          filmRollId: settings.photoType == UploadPhotoType.film
              ? settings.filmRollId
              : null,
          storageSourceId: settings.storageSourceId,
          // Web admin pins storage_provider=local when no storage source is
          // selected (UploadTab.tsx proceedWithUpload); without it the server
          // falls back to the legacy global storage_provider setting, which may
          // route default uploads to github/s3 instead of local.
          storageProvider: settings.storageSourceId == null ||
                  settings.storageSourceId!.isEmpty
              ? 'local'
              : null,
          storagePath:
              settings.storagePath.isEmpty ? null : settings.storagePath,
          storagePathFull: settings.storagePathFull,
          showFlag: settings.showFlag,
          exifJson: exifJson,
          // Compression is completed on the Flutter device. Do not ask Hono to
          // perform a second compression pass.
          compressEnabled: false,
          stripGps: settings.stripGps,
          onSendProgress: (sent, total) async {
            if (total <= 0) return;
            final pct = ((sent / total) * 100).floor().clamp(0, 99);
            await _queue.updateTask(task.copyWith(progress: pct));
          },
        );
      } finally {
        if (uploadPath != task.localPath) {
          try {
            final temporary = File(uploadPath);
            if (await temporary.exists()) await temporary.delete();
          } catch (_) {}
        }
      }

      task = task.copyWith(photoId: photo.id, progress: 99);
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
        if (e is ApiException && e.isUnauthorized) {
          await _pauseForAuthenticationFailure(task);
          return;
        }

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
      if (!_running && e.code == 'CANCELLED') {
        await _pauseForAuthenticationFailure(task);
        return;
      }
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

      if (e.isUnauthorized) {
        await _pauseForAuthenticationFailure(task);
        return;
      }

      await _failOrRetry(task, mapErrorMessage(e, lang: lang));
    } catch (e) {
      if (!_running) {
        await _pauseForAuthenticationFailure(task);
        return;
      }
      await _failOrRetry(task, mapErrorMessage(e, lang: lang));
    }
  }

  Future<void> _pauseForAuthenticationFailure(UploadTask task) async {
    await _queue.updateTask(
      task.copyWith(
        status: UploadTaskStatus.pending,
        progress: 0,
        clearError: true,
      ),
    );
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
      final delayMs =
          (500 * (1 << (attempts - 1).clamp(0, 5))).clamp(500, 16000);
      await Future<void>.delayed(Duration(milliseconds: delayMs));
      if (!_running) return;
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

  /// Drops the final extension from a file name, mirroring the web admin's
  /// `name.replace(/\.[^/.]+$/, '')` title rule. Dotfiles stay intact when
  /// stripping would leave an empty title.
  static String _stripExtension(String fileName) {
    final stripped = fileName.replaceAll(RegExp(r'\.[^.]*$'), '');
    return stripped.isEmpty ? fileName : stripped;
  }
}
