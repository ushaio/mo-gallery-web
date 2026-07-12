import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import '../../app/providers.dart';
import '../../core/error/error_messages.dart';
import '../../core/files/file_hash.dart';
import '../../core/files/sandbox_copy.dart';
import '../../l10n/strings.dart';
import 'target_picker_sheet.dart';
import 'upload_models.dart';

class UploadPage extends ConsumerStatefulWidget {
  const UploadPage({super.key});

  @override
  ConsumerState<UploadPage> createState() => _UploadPageState();
}

class _UploadPageState extends ConsumerState<UploadPage> {
  final _uuid = const Uuid();
  UploadBatchSettings _settings = const UploadBatchSettings();
  bool _picking = false;
  String? _bannerError;

  @override
  void initState() {
    super.initState();
    _loadRecent();
  }

  Future<void> _loadRecent() async {
    final recent = await ref.read(recentTargetsProvider).read();
    if (recent != null && mounted) {
      setState(() => _settings = recent);
    }
  }

  Future<void> _pickPhotos() async {
    final lang = ref.read(languageProvider);
    setState(() {
      _picking = true;
      _bannerError = null;
    });
    try {
      final picker = ImagePicker();
      final files = await picker.pickMultiImage(imageQuality: 100);
      if (files.isEmpty) return;

      final queue = ref.read(uploadQueueProvider);
      final items = <({String taskId, String sandboxPath, String fileName, String fileHash})>[];

      for (final x in files) {
        final taskId = _uuid.v4();
        final source = x.path;
        final sandbox = await copyIntoUploadSandbox(source, taskId: taskId);
        final hash = await sha256File(sandbox);
        items.add((
          taskId: taskId,
          sandboxPath: sandbox,
          fileName: p.basename(sandbox),
          fileHash: hash,
        ));
      }

      await queue.enqueue(items: items, settings: _settings);
      await ref.read(authControllerProvider.notifier).worker?.kick();
    } catch (e) {
      if (mounted) {
        setState(() => _bannerError = mapErrorMessage(e, lang: lang));
      }
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _editTargets() async {
    final result = await showTargetPickerSheet(
      context: context,
      initial: _settings,
    );
    if (result != null && mounted) {
      setState(() => _settings = result);
    }
  }

  Future<void> _retryAll() async {
    await ref.read(uploadQueueProvider).requeueErrors();
    await ref.read(authControllerProvider.notifier).worker?.kick();
  }

  Future<void> _clearDone() async {
    await ref.read(uploadQueueProvider).deleteByStatuses([
      UploadTaskStatus.done,
      UploadTaskStatus.duplicate,
    ]);
  }

  Future<void> _deleteTask(UploadTask task) async {
    if (task.status == UploadTaskStatus.uploading) return;
    await ref.read(uploadQueueProvider).deleteTask(task.id);
    try {
      await deleteSandboxTaskDir(task.id);
    } catch (_) {}
  }

  String _statusLabel(UploadTaskStatus status, String lang) {
    switch (status) {
      case UploadTaskStatus.pending:
        return AppStrings.t('upload.status.pending', lang: lang);
      case UploadTaskStatus.uploading:
        return AppStrings.t('upload.status.uploading', lang: lang);
      case UploadTaskStatus.done:
        return AppStrings.t('upload.status.done', lang: lang);
      case UploadTaskStatus.error:
        return AppStrings.t('upload.status.error', lang: lang);
      case UploadTaskStatus.duplicate:
        return AppStrings.t('upload.status.duplicate', lang: lang);
    }
  }

  Color _statusColor(UploadTaskStatus status, ColorScheme scheme) {
    switch (status) {
      case UploadTaskStatus.pending:
        return scheme.outline;
      case UploadTaskStatus.uploading:
        return scheme.primary;
      case UploadTaskStatus.done:
        return scheme.tertiary;
      case UploadTaskStatus.error:
        return scheme.error;
      case UploadTaskStatus.duplicate:
        return scheme.secondary;
    }
  }

  String _targetsSummary(String lang) {
    final parts = <String>[];
    if (_settings.albumIds.isNotEmpty) {
      parts.add('${AppStrings.t('upload.albums', lang: lang)} ${_settings.albumIds.length}');
    }
    if (_settings.storyIds.isNotEmpty) {
      parts.add('${AppStrings.t('upload.stories', lang: lang)} ${_settings.storyIds.length}');
    }
    if (_settings.filmRollId != null) {
      parts.add(AppStrings.t('upload.filmRoll', lang: lang));
    }
    if (parts.isEmpty) return AppStrings.t('upload.none', lang: lang);
    return parts.join(' · ');
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final queue = ref.watch(uploadQueueProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(AppStrings.t('nav.upload', lang: lang)),
        actions: [
          IconButton(
            tooltip: AppStrings.t('upload.targets', lang: lang),
            onPressed: _editTargets,
            icon: const Icon(Icons.tune),
          ),
          PopupMenuButton<String>(
            onSelected: (value) {
              if (value == 'retry') _retryAll();
              if (value == 'clear') _clearDone();
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                value: 'retry',
                child: Text(AppStrings.t('upload.retryAll', lang: lang)),
              ),
              PopupMenuItem(
                value: 'clear',
                child: Text(AppStrings.t('upload.clearDone', lang: lang)),
              ),
            ],
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _picking ? null : _pickPhotos,
        icon: _picking
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.add_photo_alternate_outlined),
        label: Text(AppStrings.t('upload.add', lang: lang)),
      ),
      body: Column(
        children: [
          Material(
            color: Theme.of(context).colorScheme.surfaceContainerHighest,
            child: ListTile(
              leading: const Icon(Icons.folder_special_outlined),
              title: Text(AppStrings.t('upload.targets', lang: lang)),
              subtitle: Text(_targetsSummary(lang)),
              trailing: const Icon(Icons.chevron_right),
              onTap: _editTargets,
            ),
          ),
          if (_bannerError != null)
            Material(
              color: Theme.of(context).colorScheme.errorContainer,
              child: ListTile(
                dense: true,
                title: Text(
                  _bannerError!,
                  style: TextStyle(
                    color: Theme.of(context).colorScheme.onErrorContainer,
                  ),
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => setState(() => _bannerError = null),
                ),
              ),
            ),
          Expanded(
            child: StreamBuilder<List<UploadTask>>(
              stream: queue.watchAll(),
              builder: (context, snapshot) {
                final tasks = snapshot.data ?? const <UploadTask>[];
                if (tasks.isEmpty) {
                  return Center(
                    child: Text(AppStrings.t('upload.empty', lang: lang)),
                  );
                }
                return ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 12, 12, 96),
                  itemCount: tasks.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (context, index) {
                    final task = tasks[index];
                    final scheme = Theme.of(context).colorScheme;
                    final file = File(task.localPath);
                    return Card(
                      clipBehavior: Clip.antiAlias,
                      child: ListTile(
                        leading: ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: file.existsSync()
                              ? Image.file(
                                  file,
                                  width: 56,
                                  height: 56,
                                  fit: BoxFit.cover,
                                )
                              : Container(
                                  width: 56,
                                  height: 56,
                                  color: scheme.surfaceContainerHighest,
                                  child: const Icon(Icons.broken_image_outlined),
                                ),
                        ),
                        title: Text(
                          task.fileName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const SizedBox(height: 4),
                            Text(
                              _statusLabel(task.status, lang),
                              style: TextStyle(
                                color: _statusColor(task.status, scheme),
                              ),
                            ),
                            if (task.status == UploadTaskStatus.uploading ||
                                (task.progress > 0 &&
                                    task.status == UploadTaskStatus.pending))
                              Padding(
                                padding: const EdgeInsets.only(top: 6),
                                child: LinearProgressIndicator(
                                  value: task.progress / 100,
                                ),
                              ),
                            if (task.errorMessage != null &&
                                task.errorMessage!.isNotEmpty)
                              Padding(
                                padding: const EdgeInsets.only(top: 4),
                                child: Text(
                                  task.errorMessage!,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: scheme.error,
                                    fontSize: 12,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        isThreeLine: true,
                        trailing: task.status == UploadTaskStatus.uploading
                            ? null
                            : IconButton(
                                icon: const Icon(Icons.delete_outline),
                                onPressed: () => _deleteTask(task),
                              ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
