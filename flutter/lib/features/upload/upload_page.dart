import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/api/api_exception.dart';
import '../../core/error/error_messages.dart';
import '../../core/files/sandbox_copy.dart';
import '../../l10n/strings.dart';
import 'photos_api.dart';
import 'target_picker_sheet.dart';
import 'upload_models.dart';
import 'upload_preview_page.dart';

enum _UploadDeleteAction { source, record }

class UploadPage extends ConsumerStatefulWidget {
  const UploadPage({super.key});

  @override
  ConsumerState<UploadPage> createState() => _UploadPageState();
}

class _UploadPageState extends ConsumerState<UploadPage>
    with AutomaticKeepAliveClientMixin {
  UploadBatchSettings _settings = const UploadBatchSettings();
  bool _picking = false;
  String? _bannerError;

  @override
  bool get wantKeepAlive => true;

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
      final files = await ImagePicker().pickMultiImage(imageQuality: 100);
      if (files.isEmpty) return;
      if (!mounted) return;
      setState(() => _picking = false);
      final settings = await Navigator.of(context).push<UploadBatchSettings>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (context) => UploadPreviewPage(
            sourcePaths: files.map((file) => file.path).toList(),
            initialSettings: _settings,
          ),
        ),
      );
      if (settings != null && mounted) {
        setState(() => _settings = settings);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _bannerError = mapErrorMessage(error, lang: lang));
      }
    } finally {
      if (mounted) {
        setState(() => _picking = false);
      }
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

  Future<bool> _confirm({
    required String title,
    required String body,
    required String confirmLabel,
    bool destructive = false,
  }) async {
    final result = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(title),
        content: Text(body),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(
              AppStrings.t(
                'common.cancel',
                lang: ref.read(languageProvider),
              ),
            ),
          ),
          FilledButton(
            style: destructive
                ? FilledButton.styleFrom(
                    backgroundColor: Theme.of(context).colorScheme.error,
                    foregroundColor: Theme.of(context).colorScheme.onError,
                  )
                : null,
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(confirmLabel),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  Future<void> _clearDone() async {
    final lang = ref.read(languageProvider);
    final confirmed = await _confirm(
      title: AppStrings.t('upload.clearTitle', lang: lang),
      body: AppStrings.t('upload.clearBody', lang: lang),
      confirmLabel: AppStrings.t('upload.clearDone', lang: lang),
      destructive: true,
    );
    if (!confirmed) return;
    await ref.read(uploadQueueProvider).deleteByStatuses([
      UploadTaskStatus.done,
      UploadTaskStatus.duplicate,
    ]);
  }

  Future<void> _deleteTask(UploadTask task) async {
    if (task.status == UploadTaskStatus.uploading) return;
    final lang = ref.read(languageProvider);
    final canDeleteSource = task.photoId?.isNotEmpty == true &&
        task.status != UploadTaskStatus.duplicate;
    final action = await showModalBottomSheet<_UploadDeleteAction>(
      context: context,
      showDragHandle: true,
      builder: (sheetContext) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                AppStrings.t('upload.deleteTitle', lang: lang),
                style: Theme.of(sheetContext).textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                task.fileName,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(sheetContext).textTheme.bodyMedium?.copyWith(
                      color:
                          Theme.of(sheetContext).colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: AppSpacing.md),
              ListTile(
                enabled: canDeleteSource,
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                leading: Icon(
                  Icons.delete_forever_outlined,
                  color: canDeleteSource
                      ? Theme.of(sheetContext).colorScheme.error
                      : null,
                ),
                title: Text(
                  AppStrings.t('upload.deleteSource', lang: lang),
                ),
                subtitle: Text(
                  AppStrings.t(
                    canDeleteSource
                        ? 'upload.deleteSourceBody'
                        : 'upload.deleteSourceUnavailable',
                    lang: lang,
                  ),
                ),
                onTap: canDeleteSource
                    ? () => Navigator.pop(
                          sheetContext,
                          _UploadDeleteAction.source,
                        )
                    : null,
              ),
              const SizedBox(height: AppSpacing.xs),
              ListTile(
                contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                leading: const Icon(Icons.playlist_remove_outlined),
                title: Text(
                  AppStrings.t('upload.deleteRecord', lang: lang),
                ),
                subtitle: Text(
                  AppStrings.t('upload.deleteRecordBody', lang: lang),
                ),
                onTap: () => Navigator.pop(
                  sheetContext,
                  _UploadDeleteAction.record,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              TextButton(
                onPressed: () => Navigator.pop(sheetContext),
                child: Text(AppStrings.t('common.cancel', lang: lang)),
              ),
            ],
          ),
        ),
      ),
    );
    if (action == null || !mounted) return;

    try {
      if (action == _UploadDeleteAction.source) {
        await PhotosApi(ref.read(apiClientProvider)).deletePhoto(
          task.photoId!,
          deleteOriginal: true,
          deleteThumbnail: true,
        );
      }
      final deleted =
          await ref.read(uploadQueueProvider).deleteTaskIfNotUploading(task.id);
      if (!deleted) {
        if (mounted) {
          setState(
            () => _bannerError =
                AppStrings.t('upload.deleteUploading', lang: lang),
          );
        }
        return;
      }
      await deleteSandboxTaskDir(task.id);
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() {
        _bannerError = error.code == 'PHOTO_HAS_STORIES'
            ? AppStrings.t('upload.deleteStoryBlocked', lang: lang)
            : mapErrorMessage(error, lang: lang);
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _bannerError = mapErrorMessage(error, lang: lang));
    }
  }

  String _statusLabel(UploadTaskStatus status, String lang) {
    return AppStrings.t('upload.status.${status.name}', lang: lang);
  }

  ({Color background, Color foreground}) _statusColors(
    UploadTaskStatus status,
    ColorScheme scheme,
  ) {
    switch (status) {
      case UploadTaskStatus.pending:
        return (
          background: scheme.surfaceContainerHighest,
          foreground: scheme.onSurfaceVariant,
        );
      case UploadTaskStatus.uploading:
        return (
          background: scheme.primaryContainer,
          foreground: scheme.onPrimaryContainer,
        );
      case UploadTaskStatus.done:
        return (
          background: scheme.tertiaryContainer,
          foreground: scheme.onTertiaryContainer,
        );
      case UploadTaskStatus.error:
        return (
          background: scheme.errorContainer,
          foreground: scheme.onErrorContainer,
        );
      case UploadTaskStatus.duplicate:
        return (
          background: scheme.secondaryContainer,
          foreground: scheme.onSecondaryContainer,
        );
    }
  }

  Widget _buildLoadingState() {
    return const Center(child: CircularProgressIndicator());
  }

  Widget _buildStreamError(String lang) {
    return AppEmptyState(
      icon: Icons.sync_problem_outlined,
      title: AppStrings.t('error.generic', lang: lang),
      description: AppStrings.t('error.generic', lang: lang),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final lang = ref.watch(languageProvider);
    final queue = ref.watch(uploadQueueProvider);

    final scheme = Theme.of(context).colorScheme;
    final theme = Theme.of(context);
    final wide = MediaQuery.sizeOf(context).width >= 840;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: StreamBuilder<List<UploadTask>>(
          stream: queue.watchAll(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting &&
                !snapshot.hasData) {
              return _buildLoadingState();
            }
            if (snapshot.hasError) return _buildStreamError(lang);

            final tasks = snapshot.data ?? const <UploadTask>[];
            return Column(
              children: [
                // Darkroom workbench header
                Container(
                  width: double.infinity,
                  color: scheme.surfaceContainerLow,
                  padding: const EdgeInsets.fromLTRB(16, 10, 12, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  AppStrings.t('nav.upload', lang: lang)
                                      .toUpperCase(),
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: scheme.primary,
                                    letterSpacing: 2.2,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  AppStrings.t('upload.overview', lang: lang),
                                  style: theme.textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: -0.6,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          IconButton.filledTonal(
                            tooltip: AppStrings.t('upload.targets', lang: lang),
                            onPressed: _editTargets,
                            icon: const Icon(Icons.tune_outlined, size: 20),
                          ),
                          PopupMenuButton<String>(
                            onSelected: (value) {
                              if (value == 'retry') _retryAll();
                              if (value == 'clear') _clearDone();
                            },
                            itemBuilder: (context) => [
                              PopupMenuItem(
                                value: 'retry',
                                child: Text(
                                  AppStrings.t('upload.retryAll', lang: lang),
                                ),
                              ),
                              PopupMenuItem(
                                value: 'clear',
                                child: Text(
                                  AppStrings.t('upload.clearDone', lang: lang),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      _UploadOverview(tasks: tasks, lang: lang),
                      const SizedBox(height: 10),
                      FilledButton.icon(
                        onPressed: _picking ? null : _pickPhotos,
                        icon: _picking
                            ? SizedBox(
                                width: 16,
                                height: 16,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: scheme.onPrimary,
                                ),
                              )
                            : const Icon(Icons.add_photo_alternate_outlined),
                        label: Text(AppStrings.t('upload.add', lang: lang)),
                      ),
                    ],
                  ),
                ),
                Divider(
                  height: 1,
                  color: scheme.outlineVariant.withValues(alpha: 0.7),
                ),
                if (_bannerError != null)
                  Padding(
                    padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
                    child: InlineNotice(
                      message: _bannerError!,
                      icon: Icons.error_outline,
                      isError: true,
                      onDismiss: () => setState(() => _bannerError = null),
                    ),
                  ),
                Expanded(
                  child: tasks.isEmpty
                      ? Padding(
                          padding: EdgeInsets.only(
                            bottom: wide ? 24 : AppChrome.bottomInset,
                          ),
                          child: AppEmptyState(
                            icon: Icons.add_photo_alternate_outlined,
                            title: AppStrings.t(
                              'upload.emptyTitle',
                              lang: lang,
                            ),
                            description: AppStrings.t(
                              'upload.emptyDescription',
                              lang: lang,
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: EdgeInsets.fromLTRB(
                            0,
                            0,
                            0,
                            wide ? 24 : AppChrome.bottomInset,
                          ),
                          itemCount: tasks.length + 1,
                          separatorBuilder: (_, __) => Divider(
                            height: 1,
                            color:
                                scheme.outlineVariant.withValues(alpha: 0.45),
                          ),
                          itemBuilder: (context, index) {
                            if (index == 0) {
                              return Padding(
                                padding: const EdgeInsets.fromLTRB(
                                  16,
                                  12,
                                  16,
                                  8,
                                ),
                                child: Row(
                                  children: [
                                    Text(
                                      AppStrings.t(
                                        'upload.queueTitle',
                                        lang: lang,
                                      ).toUpperCase(),
                                      style:
                                          theme.textTheme.labelSmall?.copyWith(
                                        letterSpacing: 1.4,
                                        fontWeight: FontWeight.w800,
                                        color: scheme.onSurfaceVariant,
                                      ),
                                    ),
                                    const Spacer(),
                                    Text(
                                      '${tasks.length}',
                                      style:
                                          theme.textTheme.labelSmall?.copyWith(
                                        fontWeight: FontWeight.w800,
                                        color: scheme.primary,
                                      ),
                                    ),
                                  ],
                                ),
                              );
                            }
                            final task = tasks[index - 1];
                            return _UploadTaskCard(
                              task: task,
                              statusLabel: _statusLabel(task.status, lang),
                              colors: _statusColors(task.status, scheme),
                              onDelete: () => _deleteTask(task),
                            );
                          },
                        ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _UploadOverview extends StatelessWidget {
  const _UploadOverview({required this.tasks, required this.lang});

  final List<UploadTask> tasks;
  final String lang;

  @override
  Widget build(BuildContext context) {
    var active = 0;
    var completed = 0;
    var failed = 0;
    var progressUnits = 0.0;

    for (final task in tasks) {
      switch (task.status) {
        case UploadTaskStatus.pending:
          active += 1;
        case UploadTaskStatus.uploading:
          active += 1;
          progressUnits += task.progress / 100;
        case UploadTaskStatus.done:
        case UploadTaskStatus.duplicate:
          completed += 1;
          progressUnits += 1;
        case UploadTaskStatus.error:
          failed += 1;
      }
    }

    final progress = tasks.isEmpty ? 0.0 : progressUnits / tasks.length;
    final stats = [
      (AppStrings.t('upload.total', lang: lang), tasks.length),
      (AppStrings.t('upload.active', lang: lang), active),
      (AppStrings.t('upload.completed', lang: lang), completed),
      (AppStrings.t('upload.failed', lang: lang), failed),
    ];

    final scheme = Theme.of(context).colorScheme;
    final theme = Theme.of(context);

    return Column(
      children: [
        LtrProgressBar(value: progress, height: 3),
        const SizedBox(height: 10),
        Row(
          children: [
            for (var i = 0; i < stats.length; i++) ...[
              if (i > 0)
                Container(
                  width: 1,
                  height: 28,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  color: scheme.outlineVariant.withValues(alpha: 0.6),
                ),
              Expanded(
                child: Column(
                  children: [
                    Text(
                      '${stats[i].$2}',
                      style: theme.textTheme.titleLarge?.copyWith(
                        fontWeight: FontWeight.w900,
                        height: 1,
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      stats[i].$1,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

class _UploadTaskCard extends StatelessWidget {
  const _UploadTaskCard({
    required this.task,
    required this.statusLabel,
    required this.colors,
    required this.onDelete,
  });

  final UploadTask task;
  final String statusLabel;
  final ({Color background, Color foreground}) colors;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final showProgress = task.status == UploadTaskStatus.uploading ||
        (task.progress > 0 && task.status == UploadTaskStatus.pending);
    final showError = task.status == UploadTaskStatus.error &&
        task.errorMessage != null &&
        task.errorMessage!.isNotEmpty;

    // Film-strip row: full-width, no card chrome
    return Material(
      color: scheme.surface,
      child: InkWell(
        onLongPress:
            task.status == UploadTaskStatus.uploading ? null : onDelete,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 4, 8),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: Image.file(
                  File(task.localPath),
                  width: 48,
                  height: 48,
                  fit: BoxFit.cover,
                  cacheWidth: 120,
                  errorBuilder: (context, error, stackTrace) => Container(
                    width: 48,
                    height: 48,
                    color: scheme.surfaceContainerHighest,
                    child: const Icon(Icons.broken_image_outlined, size: 18),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      task.fileName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (showProgress) ...[
                      const SizedBox(height: 6),
                      LtrProgressBar(value: task.progress / 100, height: 3),
                    ],
                    if (showError) ...[
                      const SizedBox(height: 2),
                      Text(
                        task.errorMessage!,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: scheme.error,
                          fontSize: 11,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 6),
              _StatusBadge(label: statusLabel, colors: colors),
              if (task.status != UploadTaskStatus.uploading)
                IconButton(
                  visualDensity: VisualDensity.compact,
                  tooltip:
                      MaterialLocalizations.of(context).deleteButtonTooltip,
                  onPressed: onDelete,
                  icon: const Icon(Icons.close, size: 18),
                )
              else
                const SizedBox(width: 12),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.colors});

  final String label;
  final ({Color background, Color foreground}) colors;

  @override
  Widget build(BuildContext context) {
    return StatusChip(
      label: label,
      background: colors.background,
      foreground: colors.foreground,
    );
  }
}
