import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../app/ui.dart';
import '../../core/api/api_exception.dart';
import '../../core/error/error_messages.dart';
import '../../core/files/sandbox_copy.dart';
import '../../l10n/strings.dart';
import 'photos_api.dart';
import 'target_picker_sheet.dart';
import 'upload_flow.dart';
import 'upload_models.dart';

enum _TaskSheetAction { retry, source, record }

enum _UploadFilter { all, active, failed, done }

/// Shared queue-row rhythm. Uploading, pending and failed rows all use these
/// so the list reads as one column instead of three heights.
const double _kTaskRowHeight = 100;
const double _kTaskPreviewWidth = 72;
const double _kTaskPreviewHeight = 76;

class UploadPage extends ConsumerStatefulWidget {
  const UploadPage({super.key});

  @override
  ConsumerState<UploadPage> createState() => _UploadPageState();
}

class _UploadPageState extends ConsumerState<UploadPage>
    with AutomaticKeepAliveClientMixin {
  _UploadFilter _filter = _UploadFilter.all;
  bool _picking = false;
  String? _bannerError;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    resolveUploadSettings(ref);
  }

  Future<void> _pickPhotos() async {
    if (_picking) return;
    setState(() {
      _picking = true;
      _bannerError = null;
    });
    try {
      await startUploadFlow(
        context: context,
        ref: ref,
        onError: (message) {
          if (mounted) setState(() => _bannerError = message);
        },
      );
    } finally {
      if (mounted) setState(() => _picking = false);
    }
  }

  Future<void> _editTargets() async {
    final settings = await resolveUploadSettings(ref);
    if (!mounted) return;
    final result = await showTargetPickerSheet(
      context: context,
      initial: settings,
    );
    if (result == null) return;
    ref.read(uploadSettingsProvider.notifier).state = result;
    try {
      await ref.read(recentTargetsProvider).write(result);
    } catch (_) {}
  }

  Future<void> _retryAll() async {
    await ref.read(uploadQueueProvider).requeueErrors();
    await ref.read(authControllerProvider.notifier).kickUploadWorker();
  }

  Future<void> _retryTask(UploadTask task) async {
    await ref.read(uploadQueueProvider).retryTask(task.id);
    await ref.read(authControllerProvider.notifier).kickUploadWorker();
  }

  Future<bool> _confirm({
    required String title,
    required String body,
    required String confirmLabel,
    bool destructive = false,
  }) async {
    final result = await showAppDialog<bool>(
      context: context,
      builder: (dialogContext) => AppDialog(
        title: title,
        icon: destructive ? Icons.delete_forever_outlined : Icons.help_outline,
        content: Text(body),
        actions: [
          AppButton(
            label: AppStrings.t(
              'common.cancel',
              lang: ref.read(languageProvider),
            ),
            tone: AppButtonTone.secondary,
            onPressed: () => Navigator.pop(dialogContext, false),
          ),
          AppButton(
            label: confirmLabel,
            icon: destructive ? Icons.delete_forever_outlined : Icons.check,
            tone: destructive ? AppButtonTone.danger : AppButtonTone.primary,
            onPressed: () => Navigator.pop(dialogContext, true),
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

  Future<void> _showTaskActions(UploadTask task) async {
    if (task.status == UploadTaskStatus.checking ||
        task.status == UploadTaskStatus.compressing ||
        task.status == UploadTaskStatus.uploading) {
      return;
    }
    final lang = ref.read(languageProvider);
    final isFailed = task.status == UploadTaskStatus.error;
    final canDeleteSource = task.photoId?.isNotEmpty == true &&
        task.status != UploadTaskStatus.duplicate;

    final action = await showAppSheet<_TaskSheetAction>(
      context: context,
      builder: (sheetContext) {
        final scheme = Theme.of(sheetContext).colorScheme;
        return SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.only(left: 4),
                child: Text(
                  task.fileName,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(sheetContext).textTheme.titleLarge,
                ),
              ),
              if (isFailed) ...[
                const SizedBox(height: AppSpacing.xs),
                Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: Text(
                    _statusLabel(task.status, lang),
                    style: Theme.of(sheetContext)
                        .textTheme
                        .bodySmall
                        ?.copyWith(color: scheme.error),
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              if (isFailed) ...[
                AppChoiceRow(
                  icon: Icons.refresh,
                  label: AppStrings.t('upload.retry', lang: lang),
                  selected: false,
                  onTap: () => Navigator.pop(
                    sheetContext,
                    _TaskSheetAction.retry,
                  ),
                  trailing: Icon(
                    Icons.chevron_right,
                    color: scheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 6),
              ],
              AppChoiceRow(
                icon: Icons.delete_forever_outlined,
                label: AppStrings.t('upload.deleteSource', lang: lang),
                subtitle: AppStrings.t(
                  canDeleteSource
                      ? 'upload.deleteSourceBody'
                      : 'upload.deleteSourceUnavailable',
                  lang: lang,
                ),
                danger: true,
                selected: false,
                onTap: canDeleteSource
                    ? () => Navigator.pop(
                          sheetContext,
                          _TaskSheetAction.source,
                        )
                    : null,
                trailing: Icon(
                  Icons.chevron_right,
                  color: canDeleteSource
                      ? scheme.error
                      : scheme.onSurfaceVariant.withValues(alpha: 0.4),
                ),
              ),
              const SizedBox(height: 6),
              AppChoiceRow(
                icon: Icons.playlist_remove_outlined,
                label: AppStrings.t('upload.deleteRecord', lang: lang),
                subtitle: AppStrings.t('upload.deleteRecordBody', lang: lang),
                selected: false,
                onTap: () => Navigator.pop(
                  sheetContext,
                  _TaskSheetAction.record,
                ),
                trailing: Icon(
                  Icons.chevron_right,
                  color: scheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: AppStrings.t('common.cancel', lang: lang),
                tone: AppButtonTone.secondary,
                onPressed: () => Navigator.pop(sheetContext),
                expand: true,
              ),
            ],
          ),
        );
      },
    );
    if (action == null || !mounted) return;
    if (action == _TaskSheetAction.retry) {
      await _retryTask(task);
      return;
    }

    try {
      if (action == _TaskSheetAction.source) {
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

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final lang = ref.watch(languageProvider);
    final queue = ref.watch(uploadQueueProvider);
    final wide = MediaQuery.sizeOf(context).width >= 840;

    return AppScreen(
      topBar: const SizedBox.shrink(),
      body: SafeArea(
        bottom: false,
        child: StreamBuilder<List<UploadTask>>(
          stream: queue.watchAll(),
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting &&
                !snapshot.hasData) {
              return const AppSkeletonList();
            }
            if (snapshot.hasError) {
              return AppEmptyState(
                icon: Icons.sync_problem_outlined,
                title: AppStrings.t('error.generic', lang: lang),
                description: AppStrings.t('error.generic', lang: lang),
              );
            }

            final tasks = snapshot.data ?? const <UploadTask>[];

            var activeCount = 0;
            var failedCount = 0;
            var doneCount = 0;
            // Overall progress treats each task as an equal share; in-flight
            // tasks contribute their own percentage, failed ones contribute 0.
            var progressSum = 0;
            for (final task in tasks) {
              switch (task.status) {
                case UploadTaskStatus.pending:
                  activeCount += 1;
                case UploadTaskStatus.checking:
                case UploadTaskStatus.compressing:
                case UploadTaskStatus.uploading:
                  activeCount += 1;
                  progressSum += task.progress.clamp(0, 100);
                case UploadTaskStatus.done:
                case UploadTaskStatus.duplicate:
                  doneCount += 1;
                  progressSum += 100;
                case UploadTaskStatus.error:
                  failedCount += 1;
              }
            }
            final overallPercent =
                tasks.isEmpty ? 0 : (progressSum / tasks.length).round();

            // Empty state: full-screen call to action, no dead chrome.
            if (tasks.isEmpty) {
              return _EmptyUploadState(
                busy: _picking,
                lang: lang,
                onAdd: _picking ? null : _pickPhotos,
                onSettings: _editTargets,
              );
            }

            final filteredTasks = switch (_filter) {
              _UploadFilter.all => tasks,
              _UploadFilter.active => tasks
                  .where(
                    (task) =>
                        task.status == UploadTaskStatus.pending ||
                        task.status == UploadTaskStatus.checking ||
                        task.status == UploadTaskStatus.compressing ||
                        task.status == UploadTaskStatus.uploading,
                  )
                  .toList(),
              _UploadFilter.failed => tasks
                  .where((task) => task.status == UploadTaskStatus.error)
                  .toList(),
              _UploadFilter.done => tasks
                  .where(
                    (task) =>
                        task.status == UploadTaskStatus.done ||
                        task.status == UploadTaskStatus.duplicate,
                  )
                  .toList(),
            };
            final horizontal = wide ? AppSpacing.xxl : AppSpacing.lg;

            return Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 920),
                child: CustomScrollView(
                  key: const PageStorageKey('upload-queue'),
                  slivers: [
                    SliverPadding(
                      padding: EdgeInsets.fromLTRB(
                        horizontal,
                        0,
                        horizontal,
                        0,
                      ),
                      sliver: SliverToBoxAdapter(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            _UploadTopBar(
                              count: tasks.length,
                              lang: lang,
                              onSettings: _editTargets,
                              onRetryAll: _retryAll,
                              onClearDone: _clearDone,
                            ),
                            const SizedBox(height: 14),
                            AppButton(
                              label: AppStrings.t('upload.add', lang: lang),
                              icon: Icons.add_photo_alternate_outlined,
                              busy: _picking,
                              onPressed: _picking ? null : _pickPhotos,
                              minHeight: 52,
                              expand: true,
                              elevated: true,
                            ),
                            const SizedBox(height: 14),
                            AppEntrance(
                              delay: const Duration(milliseconds: 60),
                              child: _QueueOverviewCard(
                                total: tasks.length,
                                remaining: tasks.length - doneCount,
                                completed: doneCount,
                                percent: overallPercent,
                                lang: lang,
                              ),
                            ),
                            if (failedCount > 0) ...[
                              const SizedBox(height: 14),
                              _FailedBanner(
                                count: failedCount,
                                lang: lang,
                                onRetryAll: _retryAll,
                              ),
                            ],
                            if (_bannerError != null) ...[
                              const SizedBox(height: 14),
                              AppNotice(
                                message: _bannerError!,
                                icon: Icons.error_outline,
                                isError: true,
                                onDismiss: () =>
                                    setState(() => _bannerError = null),
                              ),
                            ],
                            const SizedBox(height: 14),
                            _QueueFilterRail(
                              value: _filter,
                              counts: (
                                total: tasks.length,
                                active: activeCount,
                                failed: failedCount,
                                completed: doneCount,
                              ),
                              lang: lang,
                              onChanged: (value) =>
                                  setState(() => _filter = value),
                            ),
                            const SizedBox(height: 14),
                          ],
                        ),
                      ),
                    ),
                    SliverPadding(
                      padding: EdgeInsets.symmetric(horizontal: horizontal),
                      sliver: _UploadQueueList(
                        filter: _filter,
                        tasks: filteredTasks,
                        lang: lang,
                        onOpen: _showTaskActions,
                        onRetry: _retryTask,
                        onClearDone: _clearDone,
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: Padding(
                        padding: EdgeInsets.fromLTRB(
                          horizontal,
                          12,
                          horizontal,
                          0,
                        ),
                        child: _BackgroundUploadStatus(lang: lang),
                      ),
                    ),
                    SliverToBoxAdapter(
                      child: SizedBox(
                        height: wide ? AppSpacing.xl : AppChrome.bottomInset,
                      ),
                    ),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

/// Full-screen empty state — layered tonal hero, one big call to action.
class _EmptyUploadState extends StatelessWidget {
  const _EmptyUploadState({
    required this.busy,
    required this.lang,
    required this.onAdd,
    required this.onSettings,
  });

  final bool busy;
  final String lang;
  final VoidCallback? onAdd;
  final VoidCallback onSettings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.xl,
          AppSpacing.xl,
          AppSpacing.xl,
          AppChrome.bottomInset,
        ),
        child: Column(
          children: [
            AppPageHeader(
              eyebrow: 'MO GALLERY / PUBLISH DESK',
              title: AppStrings.t('nav.upload', lang: lang),
              trailing: const AppStamp(
                label: 'NEW',
                icon: Icons.add_photo_alternate_outlined,
              ),
            ),
            const Spacer(flex: 2),
            const AppEntrance(
              duration: Duration(milliseconds: 360),
              child: _UploadHeroMark(),
            ),
            const SizedBox(height: 22),
            AppEntrance(
              delay: const Duration(milliseconds: 60),
              child: Text(
                AppStrings.t('upload.emptyTitle', lang: lang),
                textAlign: TextAlign.center,
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(height: 8),
            AppEntrance(
              delay: const Duration(milliseconds: 120),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 320),
                child: Text(
                  AppStrings.t('upload.emptyDescription', lang: lang),
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                    height: 1.5,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 28),
            AppEntrance(
              delay: const Duration(milliseconds: 180),
              child: SizedBox(
                width: 224,
                child: AppButton(
                  label: AppStrings.t('upload.add', lang: lang),
                  icon: Icons.add_photo_alternate_outlined,
                  busy: busy,
                  onPressed: busy ? null : onAdd,
                  expand: true,
                ),
              ),
            ),
            const SizedBox(height: 6),
            AppEntrance(
              delay: const Duration(milliseconds: 240),
              child: AppButton(
                label: AppStrings.t('upload.targets', lang: lang),
                icon: Icons.tune_outlined,
                tone: AppButtonTone.ghost,
                onPressed: onSettings,
              ),
            ),
            const Spacer(flex: 3),
          ],
        ),
      ),
    );
  }
}

/// Layered tonal mark for the upload empty state.
class _UploadHeroMark extends StatelessWidget {
  const _UploadHeroMark();

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      width: 128,
      height: 128,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: 128,
            height: 128,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: scheme.tertiary.withValues(alpha: 0.25),
                width: 10,
              ),
            ),
          ),
          Container(
            width: 88,
            height: 88,
            decoration: BoxDecoration(
              color: scheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(AppRadius.xlarge),
            ),
            child: Icon(
              Icons.add_photo_alternate_outlined,
              size: 38,
              color: scheme.primary,
            ),
          ),
        ],
      ),
    );
  }
}

/// Compact publish-desk header from the mobile prototype.
class _UploadTopBar extends StatelessWidget {
  const _UploadTopBar({
    required this.count,
    required this.lang,
    required this.onSettings,
    required this.onRetryAll,
    required this.onClearDone,
  });

  final int count;
  final String lang;
  final VoidCallback onSettings;
  final VoidCallback onRetryAll;
  final VoidCallback onClearDone;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return SizedBox(
      height: 74,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'MO GALLERY / PUBLISH DESK',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: scheme.tertiary,
                    fontFamily: 'monospace',
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0,
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        AppStrings.t('upload.queueTitle', lang: lang),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontFamily: 'serif',
                          fontSize: 31,
                          fontWeight: FontWeight.w600,
                          letterSpacing: 0,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    _CountBadge(count: count),
                  ],
                ),
              ],
            ),
          ),
          AppIconButton(
            semanticLabel: AppStrings.t('upload.targets', lang: lang),
            onPressed: onSettings,
            icon: Icons.tune_outlined,
            bordered: true,
            elevated: true,
          ),
          const SizedBox(width: 6),
          AppIconButton(
            semanticLabel: AppStrings.t('upload.moreActions', lang: lang),
            icon: Icons.more_horiz,
            bordered: true,
            elevated: true,
            onPressed: () => showAppSheet<void>(
              context: context,
              builder: (sheetContext) => Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AppChoiceRow(
                      icon: Icons.refresh,
                      label: AppStrings.t('upload.retryAll', lang: lang),
                      selected: false,
                      onTap: () {
                        Navigator.pop(sheetContext);
                        onRetryAll();
                      },
                      trailing: const Icon(Icons.chevron_right),
                    ),
                    const SizedBox(height: 6),
                    AppChoiceRow(
                      icon: Icons.playlist_remove_outlined,
                      label: AppStrings.t('upload.clearDone', lang: lang),
                      selected: false,
                      onTap: () {
                        Navigator.pop(sheetContext);
                        onClearDone();
                      },
                      trailing: const Icon(Icons.chevron_right),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QueueFilterRail extends StatelessWidget {
  const _QueueFilterRail({
    required this.value,
    required this.counts,
    required this.lang,
    required this.onChanged,
  });

  final _UploadFilter value;
  final ({
    int total,
    int active,
    int failed,
    int completed,
  }) counts;
  final String lang;
  final ValueChanged<_UploadFilter> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final items = <(_UploadFilter, String, int)>[
      (
        _UploadFilter.all,
        AppStrings.t('upload.total', lang: lang),
        counts.total,
      ),
      (
        _UploadFilter.active,
        AppStrings.t('upload.active', lang: lang),
        counts.active,
      ),
      (
        _UploadFilter.failed,
        AppStrings.t('upload.failed', lang: lang),
        counts.failed,
      ),
      (
        _UploadFilter.done,
        AppStrings.t('upload.completed', lang: lang),
        counts.completed,
      ),
    ];

    return Container(
      height: 48,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(AppRadius.control),
      ),
      child: Row(
        children: [
          for (final item in items)
            Expanded(
              child: AppPressable(
                onTap: () => onChanged(item.$1),
                semanticLabel: item.$2,
                scale: 0.96,
                child: AnimatedContainer(
                  duration: AppMotion.medium,
                  curve: AppMotion.curve,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: item.$1 == value
                        ? scheme.surfaceContainerLow
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(AppRadius.small),
                    border: item.$1 == value
                        ? Border.all(color: scheme.outlineVariant)
                        : null,
                  ),
                  child: Text(
                    '${item.$2} ${item.$3}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelSmall?.copyWith(
                          color: item.$1 == value
                              ? scheme.onSurface
                              : scheme.onSurfaceVariant,
                          fontSize: 10,
                          fontWeight: item.$1 == value
                              ? FontWeight.w800
                              : FontWeight.w600,
                          letterSpacing: 0,
                        ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Lazy sliver for the selected queue filter.
class _UploadQueueList extends StatelessWidget {
  const _UploadQueueList({
    required this.filter,
    required this.tasks,
    required this.lang,
    required this.onOpen,
    required this.onRetry,
    required this.onClearDone,
  });

  final _UploadFilter filter;
  final List<UploadTask> tasks;
  final String lang;
  final ValueChanged<UploadTask> onOpen;
  final ValueChanged<UploadTask> onRetry;
  final VoidCallback onClearDone;

  IconData get _emptyIcon => switch (filter) {
        _UploadFilter.all => Icons.photo_library_outlined,
        _UploadFilter.active => Icons.cloud_upload_outlined,
        _UploadFilter.failed => Icons.task_alt,
        _UploadFilter.done => Icons.check_circle_outline,
      };

  String get _emptyTitleKey => switch (filter) {
        _UploadFilter.all => 'upload.empty',
        _UploadFilter.active => 'upload.emptyActive',
        _UploadFilter.failed => 'upload.emptyFailed',
        _UploadFilter.done => 'upload.emptyCompleted',
      };

  String get _emptyDescriptionKey => switch (filter) {
        _UploadFilter.all => 'upload.emptyDescription',
        _UploadFilter.active => 'upload.emptyActiveDescription',
        _UploadFilter.failed => 'upload.emptyFailedDescription',
        _UploadFilter.done => 'upload.emptyCompletedDescription',
      };

  @override
  Widget build(BuildContext context) {
    if (tasks.isEmpty) {
      return SliverToBoxAdapter(
        child: SizedBox(
          height: 220,
          child: AppEmptyState(
            icon: _emptyIcon,
            title: AppStrings.t(_emptyTitleKey, lang: lang),
            description: AppStrings.t(_emptyDescriptionKey, lang: lang),
          ),
        ),
      );
    }

    final showClear = filter == _UploadFilter.done && tasks.isNotEmpty;
    final itemCount = tasks.length + (showClear ? 1 : 0);

    return SliverList(
      delegate: SliverChildBuilderDelegate(
        (context, index) {
          if (index >= tasks.length) {
            return Padding(
              padding: const EdgeInsets.only(top: AppSpacing.md),
              child: Center(
                child: AppButton(
                  label: AppStrings.t('upload.clearDone', lang: lang),
                  icon: Icons.playlist_remove_outlined,
                  tone: AppButtonTone.ghost,
                  onPressed: onClearDone,
                ),
              ),
            );
          }
          final task = tasks[index];
          return AppEntrance(
            delay: Duration(milliseconds: (index * 24).clamp(0, 240)),
            child: _UploadTaskCard(
              key: ValueKey(task.id),
              task: task,
              statusLabel: _statusLabelOf(task.status, lang),
              lang: lang,
              first: index == 0,
              last: index == tasks.length - 1,
              onTap: () => onOpen(task),
              onRetry: task.status == UploadTaskStatus.error
                  ? () => onRetry(task)
                  : null,
            ),
          );
        },
        childCount: itemCount,
      ),
    );
  }

  String _statusLabelOf(UploadTaskStatus status, String lang) {
    return AppStrings.t('upload.status.${status.name}', lang: lang);
  }
}

/// Single-narrative queue summary: one headline percentage, one progress bar,
/// one footer line. The per-status counts live in the filter rail below, so
/// repeating them here as a legend only split the reader's attention.
class _QueueOverviewCard extends StatelessWidget {
  const _QueueOverviewCard({
    required this.total,
    required this.remaining,
    required this.completed,
    required this.percent,
    required this.lang,
  });

  final int total;
  final int remaining;
  final int completed;
  final int percent;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final remainingLabel = remaining == 0
        ? AppStrings.t('upload.remainingNone', lang: lang)
        : '${AppStrings.t('upload.remaining', lang: lang)} $remaining '
            '${AppStrings.t('upload.itemsUnit', lang: lang)}';

    return AppCard(
      outlined: true,
      radius: AppRadius.medium,
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Text(
                AppStrings.t('upload.progress', lang: lang),
                style: theme.textTheme.labelLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
              const Spacer(),
              Text(
                '$percent%',
                style: theme.textTheme.titleMedium?.copyWith(
                  color: scheme.tertiary,
                  fontFamily: 'monospace',
                  fontSize: 16,
                  fontWeight: FontWeight.w800,
                  fontFeatures: const [FontFeature.tabularFigures()],
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          AppProgress(value: percent / 100, height: 8),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: Text(
                  remainingLabel,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                '$completed / $total '
                '${AppStrings.t('upload.completed', lang: lang)}',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: scheme.onSurface,
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  fontFeatures: const [FontFeature.tabularFigures()],
                  letterSpacing: 0,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Error attention strip with one-tap retry-all.
class _FailedBanner extends StatelessWidget {
  const _FailedBanner({
    required this.count,
    required this.lang,
    required this.onRetryAll,
  });

  final int count;
  final String lang;
  final VoidCallback onRetryAll;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      constraints: const BoxConstraints(minHeight: 52),
      decoration: BoxDecoration(
        color: scheme.errorContainer,
        borderRadius: BorderRadius.circular(AppRadius.medium),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
        child: Row(
          children: [
            Container(
              width: 32,
              height: 32,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: scheme.surfaceContainerLow.withValues(alpha: 0.6),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(
                Icons.error_outline,
                size: 17,
                color: scheme.error,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '$count ${AppStrings.t('upload.attentionSuffix', lang: lang)}',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: scheme.onErrorContainer,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0,
                    ),
                  ),
                  const SizedBox(height: 1),
                  Text(
                    AppStrings.t('upload.attentionDescription', lang: lang),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: scheme.onErrorContainer.withValues(alpha: 0.76),
                      fontSize: 10,
                      fontWeight: FontWeight.w500,
                      letterSpacing: 0,
                    ),
                  ),
                ],
              ),
            ),
            AppPressable(
              onTap: onRetryAll,
              semanticLabel: AppStrings.t('upload.retryAll', lang: lang),
              scale: 0.94,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
                child: Row(
                  children: [
                    Icon(Icons.refresh, size: 14, color: scheme.error),
                    const SizedBox(width: 5),
                    Text(
                      AppStrings.t('upload.retry', lang: lang),
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: scheme.error,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _UploadTaskCard extends StatelessWidget {
  const _UploadTaskCard({
    super.key,
    required this.task,
    required this.statusLabel,
    required this.lang,
    required this.first,
    required this.last,
    required this.onTap,
    this.onRetry,
  });

  final UploadTask task;
  final String statusLabel;
  final String lang;
  final bool first;
  final bool last;
  final VoidCallback onTap;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isWorking = task.status == UploadTaskStatus.checking ||
        task.status == UploadTaskStatus.compressing ||
        task.status == UploadTaskStatus.uploading;
    final isFailed = task.status == UploadTaskStatus.error;
    final radius = BorderRadius.only(
      topLeft: first ? const Radius.circular(AppRadius.medium) : Radius.zero,
      topRight: first ? const Radius.circular(AppRadius.medium) : Radius.zero,
      bottomLeft: last ? const Radius.circular(AppRadius.medium) : Radius.zero,
      bottomRight: last ? const Radius.circular(AppRadius.medium) : Radius.zero,
    );
    final line = BorderSide(color: scheme.outlineVariant);

    // One rhythm for every state — uploading, pending and failed rows share a
    // height and thumbnail so the list scans as a single column.
    final content = Container(
      constraints: const BoxConstraints(minHeight: _kTaskRowHeight),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: radius,
        border: Border(
          top: first ? line : BorderSide.none,
          left: line,
          right: line,
          bottom: line,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.small),
            child: Image.file(
              File(task.localPath),
              width: _kTaskPreviewWidth,
              height: _kTaskPreviewHeight,
              fit: BoxFit.cover,
              cacheWidth: 180,
              errorBuilder: (context, error, stackTrace) => Container(
                width: _kTaskPreviewWidth,
                height: _kTaskPreviewHeight,
                color: scheme.surfaceContainerHighest,
                child: const Icon(Icons.broken_image_outlined, size: 22),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        task.fileName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.titleSmall?.copyWith(
                          fontSize: 13,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                        ),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    if (isWorking)
                      Text(
                        '${task.progress}%',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: scheme.tertiary,
                          fontWeight: FontWeight.w800,
                          fontFeatures: const [FontFeature.tabularFigures()],
                          letterSpacing: 0,
                        ),
                      )
                    else if (isFailed && onRetry != null)
                      _TaskRetryButton(
                        label: AppStrings.t('upload.retry', lang: lang),
                        onPressed: onRetry!,
                      )
                    else
                      _StatusBadge(
                        status: task.status,
                        label: statusLabel,
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                if (!isFailed) _TaskMetadata(task: task, lang: lang),
                if (isWorking) ...[
                  const SizedBox(height: 7),
                  AppProgress(value: task.progress / 100, height: 4),
                  const SizedBox(height: 7),
                  Row(
                    children: [
                      Icon(
                        Icons.cloud_upload_outlined,
                        size: 13,
                        color: scheme.tertiary,
                      ),
                      const SizedBox(width: 5),
                      Expanded(
                        child: Text(
                          statusLabel,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: scheme.tertiary,
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0,
                          ),
                        ),
                      ),
                    ],
                  ),
                ] else if (isFailed) ...[
                  // Status and reason share one line so a failed row keeps the
                  // same height as every other row in the list.
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.baseline,
                    textBaseline: TextBaseline.alphabetic,
                    children: [
                      Text(
                        statusLabel,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: scheme.error,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          task.errorMessage?.isNotEmpty == true
                              ? task.errorMessage!
                              : AppStrings.t('error.generic', lang: lang),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            fontSize: 10,
                            fontWeight: FontWeight.w500,
                            letterSpacing: 0,
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );

    final surface = ClipRRect(
      borderRadius: radius,
      child: isWorking
          ? content
          : AppPressable(
              onTap: onTap,
              semanticLabel: task.fileName,
              scale: 0.99,
              child: content,
            ),
    );

    return Semantics(container: true, label: task.fileName, child: surface);
  }
}

class _TaskRetryButton extends StatelessWidget {
  const _TaskRetryButton({
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AppPressable(
      onTap: onPressed,
      semanticLabel: label,
      scale: 0.9,
      child: Container(
        width: 32,
        height: 32,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: scheme.errorContainer,
          borderRadius: BorderRadius.circular(AppRadius.small),
        ),
        child: Icon(Icons.refresh, size: 15, color: scheme.error),
      ),
    );
  }
}

class _TaskMetadata extends StatefulWidget {
  const _TaskMetadata({required this.task, required this.lang});

  final UploadTask task;
  final String lang;

  @override
  State<_TaskMetadata> createState() => _TaskMetadataState();
}

class _TaskMetadataState extends State<_TaskMetadata> {
  late Future<int?> _fileLength = _readFileLength();

  @override
  void didUpdateWidget(covariant _TaskMetadata oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.task.localPath != widget.task.localPath) {
      _fileLength = _readFileLength();
    }
  }

  Future<int?> _readFileLength() async {
    try {
      return await File(widget.task.localPath).length();
    } on FileSystemException {
      return null;
    }
  }

  String _archiveLabel() {
    try {
      final settings = widget.task.settings;
      final parts = <String>[
        if (settings.albumIds.isNotEmpty)
          '${settings.albumIds.length} ${AppStrings.t('upload.albums', lang: widget.lang)}',
        if (settings.storyIds.isNotEmpty)
          '${settings.storyIds.length} ${AppStrings.t('upload.stories', lang: widget.lang)}',
        if (settings.categories.isNotEmpty)
          '${settings.categories.length} ${AppStrings.t('upload.categories', lang: widget.lang)}',
        if (settings.filmRollId != null)
          AppStrings.t('upload.filmRoll', lang: widget.lang),
      ];
      if (parts.isNotEmpty) return parts.join(' / ');
      return AppStrings.t(
        settings.photoType == UploadPhotoType.film
            ? 'upload.photoType.film'
            : 'upload.photoType.digital',
        lang: widget.lang,
      );
    } on FormatException {
      return AppStrings.t('upload.none', lang: widget.lang);
    }
  }

  String _formatLength(int bytes) {
    final megabytes = bytes / (1024 * 1024);
    if (megabytes >= 0.1) return '${megabytes.toStringAsFixed(1)} MB';
    return '${(bytes / 1024).round()} KB';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return FutureBuilder<int?>(
      future: _fileLength,
      builder: (context, snapshot) {
        final size = snapshot.data;
        final archive = _archiveLabel();
        final text =
            size == null ? archive : '${_formatLength(size)} · $archive';
        return Text(
          text,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: scheme.onSurfaceVariant,
                fontSize: 10,
                fontWeight: FontWeight.w500,
                letterSpacing: 0,
              ),
        );
      },
    );
  }
}

class _BackgroundUploadStatus extends StatelessWidget {
  const _BackgroundUploadStatus({required this.lang});

  final String lang;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SizedBox(
      height: 18,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(
            Icons.verified_outlined,
            size: 13,
            color: AppColors.success,
          ),
          const SizedBox(width: 6),
          Flexible(
            child: Text(
              AppStrings.t('upload.backgroundStatus', lang: lang),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.labelSmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    letterSpacing: 0,
                  ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Small tonal count badge used in the queue header.
class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 26,
      height: 26,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: scheme.tertiaryContainer,
        borderRadius: BorderRadius.circular(AppRadius.small),
      ),
      child: Text(
        '$count',
        style: Theme.of(context).textTheme.labelSmall?.copyWith(
              color: scheme.tertiary,
              fontFamily: 'monospace',
              fontSize: 10,
              fontWeight: FontWeight.w800,
              fontFeatures: const [FontFeature.tabularFigures()],
              letterSpacing: 0,
            ),
      ),
    );
  }
}

/// Status affordance per task: spinner + label for active work, tonal chip
/// for terminal states, neutral dot while pending.
class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.status, required this.label});

  final UploadTaskStatus status;
  final String label;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final theme = Theme.of(context);
    switch (status) {
      case UploadTaskStatus.checking:
      case UploadTaskStatus.compressing:
      case UploadTaskStatus.uploading:
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppSpinner(size: 13, stroke: 2, color: scheme.tertiary),
            const SizedBox(width: 6),
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: scheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        );
      case UploadTaskStatus.pending:
        return AppStatusChip(
          label: label,
          background: scheme.surfaceContainer,
          foreground: scheme.onSurfaceVariant,
          icon: Icons.schedule,
        );
      case UploadTaskStatus.done:
        return AppStatusChip(
          label: label,
          background: AppColors.successSoft,
          foreground: AppColors.success,
          icon: Icons.check_circle_outline,
        );
      case UploadTaskStatus.duplicate:
        return AppStatusChip(
          label: label,
          background: scheme.surfaceContainerHighest,
          foreground: scheme.onSurfaceVariant,
          icon: Icons.content_copy_outlined,
        );
      case UploadTaskStatus.error:
        return AppStatusChip(
          label: label,
          background: scheme.errorContainer,
          foreground: scheme.onErrorContainer,
          icon: Icons.error_outline,
        );
    }
  }
}
