import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../app/ui.dart';
import '../../core/error/error_messages.dart';
import '../../core/files/file_hash.dart';
import '../../core/files/sandbox_copy.dart';
import '../../l10n/strings.dart';
import 'target_picker_sheet.dart';
import 'upload_models.dart';

class UploadPreviewPage extends ConsumerStatefulWidget {
  const UploadPreviewPage({
    super.key,
    required this.sourcePaths,
    required this.initialSettings,
  });

  final List<String> sourcePaths;
  final UploadBatchSettings initialSettings;

  @override
  ConsumerState<UploadPreviewPage> createState() => _UploadPreviewPageState();
}

class _UploadPreviewPageState extends ConsumerState<UploadPreviewPage> {
  final _uuid = const Uuid();
  late final List<_PreviewPhoto> _photos;
  late UploadBatchSettings _settings;
  bool _submitting = false;
  int _prepared = 0;
  int _step = 0;
  String? _error;

  @override
  void initState() {
    super.initState();
    _settings = widget.initialSettings;
    _photos = widget.sourcePaths.indexed
        .map(
          (entry) => _PreviewPhoto(
            id: '${entry.$1}-${entry.$2}',
            path: entry.$2,
          ),
        )
        .toList();
  }

  Future<void> _editSettings() async {
    if (_submitting) return;
    final result = await showTargetPickerSheet(
      context: context,
      initial: _settings,
    );
    if (result != null && mounted) {
      setState(() => _settings = result);
    }
  }

  void _reorder(int oldIndex, int newIndex) {
    if (_submitting) return;
    if (oldIndex < newIndex) newIndex -= 1;
    setState(() {
      final photo = _photos.removeAt(oldIndex);
      _photos.insert(newIndex, photo);
    });
  }

  void _removeAt(int index) {
    if (_submitting) return;
    setState(() {
      _photos.removeAt(index);
      _error = null;
      if (_photos.isEmpty) _step = 0;
    });
  }

  Future<void> _pickMorePhotos() async {
    if (_submitting) return;
    final files = await ImagePicker().pickMultiImage(imageQuality: 100);
    if (files.isEmpty || !mounted) return;

    setState(() {
      final existingPaths = _photos.map((photo) => photo.path).toSet();
      for (final file in files) {
        if (!existingPaths.add(file.path)) continue;
        _photos.add(
          _PreviewPhoto(
            id: '${DateTime.now().microsecondsSinceEpoch}-${file.path}',
            path: file.path,
          ),
        );
      }
      _error = null;
    });
  }

  Future<void> _startUpload() async {
    if (_submitting || _photos.isEmpty) return;
    final lang = ref.read(languageProvider);
    final createdTaskIds = <String>[];
    var enqueued = false;

    setState(() {
      _submitting = true;
      _prepared = 0;
      _error = null;
    });

    try {
      final items = <({
        String taskId,
        String sandboxPath,
        String fileName,
        String fileHash,
      })>[];

      // Preserve the visual order all the way into the durable queue.
      for (final photo in _photos) {
        final taskId = _uuid.v4();
        createdTaskIds.add(taskId);
        final sandboxPath = await copyIntoUploadSandbox(
          photo.path,
          taskId: taskId,
        );
        final fileHash = await sha256File(sandboxPath);
        items.add((
          taskId: taskId,
          sandboxPath: sandboxPath,
          fileName: p.basename(sandboxPath),
          fileHash: fileHash,
        ));
        if (mounted) setState(() => _prepared += 1);
      }

      await ref.read(uploadQueueProvider).enqueue(
            items: items,
            settings: _settings,
          );
      enqueued = true;
      try {
        await ref.read(recentTargetsProvider).write(_settings);
      } catch (_) {}
      try {
        await ref.read(authControllerProvider.notifier).kickUploadWorker();
      } catch (_) {}
      if (mounted) Navigator.of(context).pop(_settings);
    } catch (error) {
      if (!enqueued) {
        for (final taskId in createdTaskIds) {
          try {
            await deleteSandboxTaskDir(taskId);
          } catch (_) {}
        }
      }
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _prepared = 0;
        _error = mapErrorMessage(error, lang: lang);
      });
    }
  }

  String _settingsSummary(String lang) {
    final targets = <String>[];
    if (_settings.albumIds.isNotEmpty) {
      targets.add(
        '${AppStrings.t('upload.albums', lang: lang)} ${_settings.albumIds.length}',
      );
    }
    if (_settings.storyIds.isNotEmpty) {
      targets.add(
        '${AppStrings.t('upload.stories', lang: lang)} ${_settings.storyIds.length}',
      );
    }
    if (_settings.categories.isNotEmpty) {
      targets.add(
        '${AppStrings.t('upload.categories', lang: lang)} ${_settings.categories.length}',
      );
    }
    if (_settings.photoType == UploadPhotoType.film &&
        _settings.filmRollId?.isNotEmpty == true) {
      targets.add(AppStrings.t('upload.filmRoll', lang: lang));
    }
    if (_settings.storageSourceId?.isNotEmpty == true) {
      targets.add(AppStrings.t('upload.storageSource', lang: lang));
    }

    final options = <String>[
      AppStrings.t(
        _settings.photoType == UploadPhotoType.film
            ? 'upload.photoType.film'
            : 'upload.photoType.digital',
        lang: lang,
      ),
      if (_settings.titlePrefix.isNotEmpty)
        '${AppStrings.t('upload.titlePrefix', lang: lang)}: ${_settings.titlePrefix}',
      if (_settings.compressEnabled)
        AppStrings.t('upload.compress', lang: lang),
      if (_settings.compressEnabled &&
          _settings.maxSizeMb != null &&
          _settings.maxSizeMb! > 0)
        '${AppStrings.t('upload.maxSizeMb', lang: lang)} ${_settings.maxSizeMb!.round()}',
      AppStrings.t(
        _settings.showFlag ? 'preview.visible' : 'preview.hidden',
        lang: lang,
      ),
      if (_settings.stripGps) AppStrings.t('upload.stripGps', lang: lang),
    ];
    final targetText = targets.isEmpty
        ? AppStrings.t('upload.none', lang: lang)
        : targets.join(' · ');
    return '$targetText\n${options.join(' · ')}';
  }

  List<String> _stepLabels(String lang) => [
        AppStrings.t('preview.step.select', lang: lang),
        AppStrings.t('preview.step.organize', lang: lang),
        AppStrings.t('preview.step.targets', lang: lang),
        AppStrings.t('preview.step.confirm', lang: lang),
      ];

  String _stepTitle(String lang) => AppStrings.t(
        switch (_step) {
          0 => 'preview.selectHeading',
          1 => 'preview.organizeHeading',
          2 => 'preview.targetsHeading',
          _ => 'preview.confirmHeading',
        },
        lang: lang,
      );

  void _goBack() {
    if (_submitting) return;
    if (_step == 0) {
      Navigator.of(context).maybePop();
      return;
    }
    setState(() => _step -= 1);
  }

  void _goNext() {
    if (_submitting || _photos.isEmpty) return;
    if (_step < 3) {
      setState(() => _step += 1);
      return;
    }
    _startUpload();
  }

  Widget _buildStepContent(String lang) {
    return AnimatedSwitcher(
      duration: AppMotion.medium,
      switchInCurve: AppMotion.curve,
      switchOutCurve: AppMotion.reverseCurve,
      transitionBuilder: (child, animation) => FadeTransition(
        opacity: animation,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0.03, 0),
            end: Offset.zero,
          ).animate(animation),
          child: child,
        ),
      ),
      child: KeyedSubtree(
        key: ValueKey(_step),
        child: switch (_step) {
          0 => _buildSelectionStep(lang),
          1 => _buildOrganizeStep(lang),
          2 => _buildTargetsStep(lang),
          _ => _buildConfirmStep(lang),
        },
      ),
    );
  }

  Widget _buildSelectionStep(String lang) {
    final scheme = Theme.of(context).colorScheme;
    if (_photos.isEmpty) {
      return AppEmptyState(
        icon: Icons.photo_library_outlined,
        title: AppStrings.t('preview.empty', lang: lang),
        description: AppStrings.t('preview.emptyBody', lang: lang),
        action: AppButton(
          onPressed: _pickMorePhotos,
          tone: AppButtonTone.secondary,
          icon: Icons.add_photo_alternate_outlined,
          label: AppStrings.t('preview.selectPhotos', lang: lang),
        ),
      );
    }
    return GridView.builder(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: AppSpacing.sm,
        crossAxisSpacing: AppSpacing.sm,
        childAspectRatio: 0.86,
      ),
      itemCount: _photos.length + 1,
      itemBuilder: (context, index) {
        if (index == _photos.length) {
          // "Add more" tile — dashed-feel outlined target.
          return AppPressable(
            onTap: _submitting ? null : _pickMorePhotos,
            semanticLabel: AppStrings.t('preview.addMore', lang: lang),
            child: Container(
              decoration: BoxDecoration(
                color: scheme.surfaceContainer,
                borderRadius: BorderRadius.circular(AppRadius.large),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.add_photo_alternate_outlined,
                    size: 30,
                    color: scheme.tertiary,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    AppStrings.t('preview.addMore', lang: lang),
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                ],
              ),
            ),
          );
        }
        final photo = _photos[index];
        return Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadius.large),
          ),
          clipBehavior: Clip.antiAlias,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Image.file(
                File(photo.path),
                fit: BoxFit.cover,
                cacheWidth: 420,
                errorBuilder: (_, __, ___) => Container(
                  color: scheme.surfaceContainerHighest,
                  child: const Icon(Icons.broken_image_outlined),
                ),
              ),
              Positioned(
                left: 8,
                bottom: 8,
                child: AppStamp(label: '${index + 1}', selected: true),
              ),
              Positioned(
                top: 6,
                right: 6,
                child: AppIconButton(
                  onPressed: _submitting ? null : () => _removeAt(index),
                  semanticLabel: AppStrings.t('preview.remove', lang: lang),
                  icon: Icons.close,
                  filled: false,
                  size: 32,
                  iconSize: 16,
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildOrganizeStep(String lang) {
    final scheme = Theme.of(context).colorScheme;
    if (_photos.isEmpty) return _buildSelectionStep(lang);
    return ReorderableListView.builder(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      buildDefaultDragHandles: false,
      itemCount: _photos.length,
      onReorder: _reorder,
      proxyDecorator: (child, index, animation) => Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(AppRadius.medium),
          border: Border.all(color: scheme.outline),
          boxShadow: AppElevation.overlay(scheme.shadow),
        ),
        child: child,
      ),
      itemBuilder: (context, index) {
        final photo = _photos[index];
        return Padding(
          key: ValueKey(photo.id),
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: _PreviewPhotoCard(
            photo: photo,
            index: index,
            enabled: !_submitting,
            lang: lang,
            onRemove: () => _removeAt(index),
          ),
        );
      },
    );
  }

  Widget _buildTargetsStep(String lang) {
    final scheme = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      children: [
        AppCard(
          tone: AppCardTone.accent,
          onTap: _submitting ? null : _editSettings,
          semanticLabel: AppStrings.t('preview.editTargets', lang: lang),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: scheme.tertiary,
                  borderRadius: BorderRadius.circular(AppRadius.small),
                ),
                child: Icon(
                  Icons.inventory_2_outlined,
                  size: 20,
                  color: scheme.onTertiary,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      AppStrings.t('preview.settings', lang: lang),
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      _settingsSummary(lang),
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            height: 1.5,
                          ),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: scheme.onSurfaceVariant),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.md),
        AppButton(
          onPressed: _submitting ? null : _editSettings,
          tone: AppButtonTone.secondary,
          expand: true,
          icon: Icons.tune_outlined,
          label: AppStrings.t('preview.editTargets', lang: lang),
        ),
      ],
    );
  }

  Widget _buildConfirmStep(String lang) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return ListView(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      children: [
        AppCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppStamp(
                    label: AppStrings.t('preview.ready', lang: lang),
                    icon: Icons.check,
                    selected: true,
                  ),
                  const Spacer(),
                  Text(
                    '${_photos.length} ${AppStrings.t('preview.selected', lang: lang)}',
                    style: theme.textTheme.titleMedium,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.lg),
              SizedBox(
                height: 92,
                child: ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: _photos.length > 8 ? 8 : _photos.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (context, index) => ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadius.small),
                    child: Image.file(
                      File(_photos[index].path),
                      width: 76,
                      height: 92,
                      fit: BoxFit.cover,
                      cacheWidth: 180,
                      errorBuilder: (_, __, ___) => Container(
                        width: 76,
                        color: scheme.surfaceContainerHighest,
                        child: const Icon(Icons.broken_image_outlined),
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.lg),
              const AppDivider(),
              const SizedBox(height: AppSpacing.md),
              Text(
                AppStrings.t('preview.settings', lang: lang),
                style: theme.textTheme.labelLarge?.copyWith(
                  color: scheme.tertiary,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                _settingsSummary(lang),
                style: theme.textTheme.bodyMedium?.copyWith(height: 1.55),
              ),
            ],
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);

    return PopScope(
      canPop: !_submitting,
      child: AppScreen(
        topBar: AppTopBar(
          title: AppStrings.t('preview.title', lang: lang),
          onBack: _goBack,
        ),
        bottomBar: AppBottomAction(
          secondaryLabel: _step == 0
              ? AppStrings.t('common.cancel', lang: lang)
              : AppStrings.t('preview.back', lang: lang),
          onSecondary: _goBack,
          primaryLabel: _submitting
              ? '${AppStrings.t('preview.preparing', lang: lang)} $_prepared/${_photos.length}'
              : _photos.isEmpty
                  ? AppStrings.t('preview.selectPhotos', lang: lang)
                  : _step == 3
                      ? '${AppStrings.t('upload.start', lang: lang)} (${_photos.length})'
                      : AppStrings.t('preview.next', lang: lang),
          primaryIcon: _photos.isEmpty
              ? Icons.add_photo_alternate_outlined
              : _step == 3
                  ? Icons.cloud_upload_outlined
                  : Icons.arrow_forward,
          onPrimary: _photos.isEmpty ? _pickMorePhotos : _goNext,
          busy: _submitting,
          progress: _photos.isEmpty ? null : _prepared / _photos.length,
        ),
        body: AppPageContainer(
          includeBottomDock: false,
          maxWidth: 840,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              AppStepStrip(
                current: _step,
                labels: _stepLabels(lang),
                onStepTap: _submitting
                    ? null
                    : (step) {
                        if (_photos.isEmpty && step > 0) return;
                        setState(() => _step = step);
                      },
              ),
              const SizedBox(height: AppSpacing.lg),
              AppPageHeader(
                eyebrow: 'MO GALLERY / PUBLISH DESK',
                title: _stepTitle(lang),
                trailing: AppStamp(
                  label: '${_photos.length}',
                  icon: Icons.photo_library_outlined,
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.md),
                AppNotice(
                  message: _error!,
                  icon: Icons.error_outline,
                  isError: true,
                  onDismiss: () => setState(() => _error = null),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              Expanded(child: _buildStepContent(lang)),
            ],
          ),
        ),
      ),
    );
  }
}

class _PreviewPhoto {
  const _PreviewPhoto({required this.id, required this.path});

  final String id;
  final String path;
}

class _PreviewPhotoCard extends StatelessWidget {
  const _PreviewPhotoCard({
    required this.photo,
    required this.index,
    required this.enabled,
    required this.lang,
    required this.onRemove,
  });

  final _PreviewPhoto photo;
  final int index;
  final bool enabled;
  final String lang;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return AppCard(
      radius: AppRadius.medium,
      padding: const EdgeInsets.fromLTRB(12, 10, 6, 10),
      child: Row(
        children: [
          Container(
            width: 30,
            height: 30,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.primaryContainer,
              borderRadius: BorderRadius.circular(AppRadius.small),
            ),
            child: Text(
              '${index + 1}',
              style: theme.textTheme.labelSmall?.copyWith(
                color: scheme.onPrimaryContainer,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.small),
            child: Image.file(
              File(photo.path),
              width: 60,
              height: 60,
              fit: BoxFit.cover,
              cacheWidth: 160,
              errorBuilder: (context, error, stackTrace) => Container(
                width: 60,
                height: 60,
                color: scheme.surfaceContainerHighest,
                child: const Icon(Icons.broken_image_outlined, size: 18),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              p.basename(photo.path),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleSmall,
            ),
          ),
          AppIconButton(
            onPressed: enabled ? onRemove : null,
            semanticLabel: AppStrings.t('preview.remove', lang: lang),
            icon: Icons.close,
            filled: false,
            iconSize: 20,
          ),
          ReorderableDragStartListener(
            index: index,
            enabled: enabled,
            child: SizedBox(
              width: 44,
              height: 44,
              child: Icon(
                Icons.drag_handle,
                size: 22,
                color: scheme.onSurfaceVariant,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
