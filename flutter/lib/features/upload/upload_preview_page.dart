import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
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
    setState(() => _photos.removeAt(index));
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
        await ref.read(authControllerProvider.notifier).worker?.kick();
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

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return PopScope(
      canPop: !_submitting,
      child: Scaffold(
        appBar: AppBar(
          title: Text(AppStrings.t('preview.title', lang: lang)),
        ),
        bottomNavigationBar: Material(
          color: scheme.surface,
          elevation: 8,
          child: SafeArea(
            top: false,
            child: Center(
              heightFactor: 1,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 840),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  child: FilledButton.icon(
                    onPressed: _submitting
                        ? null
                        : _photos.isEmpty
                            ? _pickMorePhotos
                            : _startUpload,
                    icon: _submitting
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Icon(
                            _photos.isEmpty
                                ? Icons.add_photo_alternate_outlined
                                : Icons.cloud_upload_outlined,
                          ),
                    label: Text(
                      _submitting
                          ? '${AppStrings.t('preview.preparing', lang: lang)} $_prepared/${_photos.length}'
                          : _photos.isEmpty
                              ? AppStrings.t(
                                  'preview.selectPhotos',
                                  lang: lang,
                                )
                              : '${AppStrings.t('upload.start', lang: lang)} (${_photos.length})',
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
        body: ResponsivePage(
          maxWidth: 840,
          padding: EdgeInsets.zero,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppChrome.pageGutter,
                  8,
                  AppChrome.pageGutter,
                  8,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    PageHeader(
                      title: AppStrings.t('preview.heading', lang: lang),
                      subtitle: AppStrings.t('preview.subtitle', lang: lang),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    SectionCard(
                      onTap: _submitting ? null : _editSettings,
                      child: Row(
                        children: [
                          Container(
                            width: 44,
                            height: 44,
                            decoration: BoxDecoration(
                              color: scheme.primaryContainer,
                              borderRadius:
                                  BorderRadius.circular(AppRadius.small),
                            ),
                            child: Icon(
                              Icons.tune_outlined,
                              color: scheme.primary,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  AppStrings.t(
                                    'preview.settings',
                                    lang: lang,
                                  ),
                                  style: theme.textTheme.titleMedium,
                                ),
                                const SizedBox(height: AppSpacing.xs),
                                Text(
                                  _settingsSummary(lang),
                                  maxLines: 3,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurfaceVariant,
                                    height: 1.45,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          const Icon(Icons.chevron_right),
                        ],
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      InlineNotice(
                        message: _error!,
                        icon: Icons.error_outline,
                        isError: true,
                        onDismiss: () => setState(() => _error = null),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.sm),
                    SectionLabel(
                      label: AppStrings.t('preview.order', lang: lang),
                      trailing: Text(
                        '${_photos.length} ${AppStrings.t('preview.selected', lang: lang)}',
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: _photos.isEmpty
                    ? AppEmptyState(
                        icon: Icons.photo_library_outlined,
                        title: AppStrings.t('preview.empty', lang: lang),
                        description:
                            AppStrings.t('preview.emptyBody', lang: lang),
                      )
                    : ReorderableListView.builder(
                        padding: const EdgeInsets.fromLTRB(
                          AppChrome.pageGutter,
                          0,
                          AppChrome.pageGutter,
                          16,
                        ),
                        buildDefaultDragHandles: false,
                        itemCount: _photos.length,
                        onReorder: _reorder,
                        proxyDecorator: (child, index, animation) => Material(
                          color: Colors.transparent,
                          elevation: 6,
                          borderRadius: BorderRadius.circular(AppRadius.medium),
                          child: child,
                        ),
                        itemBuilder: (context, index) {
                          final photo = _photos[index];
                          return Padding(
                            key: ValueKey(photo.id),
                            padding: const EdgeInsets.only(
                              bottom: AppChrome.contentGap,
                            ),
                            child: _PreviewPhotoCard(
                              photo: photo,
                              index: index,
                              enabled: !_submitting,
                              onRemove: () => _removeAt(index),
                            ),
                          );
                        },
                      ),
              ),
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
    required this.onRemove,
  });

  final _PreviewPhoto photo;
  final int index;
  final bool enabled;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return SectionCard(
      padding: const EdgeInsets.all(8),
      child: Row(
        children: [
          Container(
            width: 24,
            height: 24,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: scheme.primaryContainer,
              shape: BoxShape.circle,
            ),
            child: Text(
              '${index + 1}',
              style: theme.textTheme.labelSmall?.copyWith(
                color: scheme.onPrimaryContainer,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
          const SizedBox(width: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadius.small),
            child: Image.file(
              File(photo.path),
              width: 52,
              height: 52,
              fit: BoxFit.cover,
              cacheWidth: 140,
              errorBuilder: (context, error, stackTrace) => Container(
                width: 52,
                height: 52,
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
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: enabled ? onRemove : null,
            tooltip: MaterialLocalizations.of(context).deleteButtonTooltip,
            icon: const Icon(Icons.close, size: 18),
          ),
          ReorderableDragStartListener(
            index: index,
            enabled: enabled,
            child: const SizedBox(
              width: 40,
              height: 40,
              child: Icon(Icons.drag_handle, size: 20),
            ),
          ),
        ],
      ),
    );
  }
}
