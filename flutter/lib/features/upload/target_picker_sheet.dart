import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../app/ui.dart';
import '../../core/api/api_exception.dart';
import '../../core/error/error_messages.dart';
import '../../l10n/strings.dart';
import '../catalog/catalog_api.dart';
import 'photos_api.dart';
import 'upload_models.dart';
import 'upload_targets_cache.dart';

Future<UploadBatchSettings?> showTargetPickerSheet({
  required BuildContext context,
  required UploadBatchSettings initial,
}) {
  return showAppSheet<UploadBatchSettings>(
    context: context,
    maxWidth: 720,
    builder: (context) => TargetPickerSheet(initial: initial),
  );
}

class TargetPickerSheet extends ConsumerStatefulWidget {
  const TargetPickerSheet({super.key, required this.initial});

  final UploadBatchSettings initial;

  @override
  ConsumerState<TargetPickerSheet> createState() => _TargetPickerSheetState();
}

class _TargetPickerSheetState extends ConsumerState<TargetPickerSheet> {
  late UploadBatchSettings _settings;
  late final TextEditingController _titlePrefixController;
  late final TextEditingController _storagePathController;
  late final TextEditingController _maxSizeController;
  List<IdName> _albums = const [];
  List<IdName> _stories = const [];
  List<IdName> _rolls = const [];
  List<IdName> _storageSources = const [];
  List<String> _categories = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _settings = widget.initial;
    _titlePrefixController =
        TextEditingController(text: widget.initial.titlePrefix);
    _storagePathController =
        TextEditingController(text: widget.initial.storagePath);
    _maxSizeController = TextEditingController(
      text: widget.initial.maxSizeMb == null
          ? ''
          : widget.initial.maxSizeMb!.round().toString(),
    );
    _load();
  }

  @override
  void dispose() {
    _titlePrefixController.dispose();
    _storagePathController.dispose();
    _maxSizeController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    // Serve from the in-memory cache when available — the picker is opened
    // and closed frequently, and the catalog rarely changes mid-session.
    final cached = ref.read(uploadTargetsCacheProvider);
    if (cached != null) {
      setState(() {
        _albums = cached.albums;
        _stories = cached.stories;
        _rolls = cached.rolls;
        _storageSources = cached.storageSources;
        _categories = cached.categories;
        _loading = false;
        _error = null;
      });
      _applyDefaultStorageSource();
      return;
    }

    final client = ref.read(apiClientProvider);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        AlbumsApi(client).list(),
        StoriesApi(client).list(),
        FilmRollsApi(client).list(),
        StorageSourcesApi(client).list(),
        GalleryApi(client).getCategories(),
      ]);
      if (!mounted) return;
      final storageSources = results[3] as List<IdName>;
      setState(() {
        _albums = results[0] as List<IdName>;
        _stories = results[1] as List<IdName>;
        _rolls = results[2] as List<IdName>;
        _storageSources = storageSources;
        _categories = results[4] as List<String>;
        _loading = false;
      });
      // Cache the catalogs so the next sheet open skips the network.
      ref.read(uploadTargetsCacheProvider.notifier).state = UploadTargetsCache(
        albums: _albums,
        stories: _stories,
        rolls: _rolls,
        storageSources: _storageSources,
        categories: _categories,
      );
      _applyDefaultStorageSource();
    } catch (error) {
      if (error is ApiException && error.isUnauthorized) return;
      if (!mounted) return;
      setState(() {
        _error = mapErrorMessage(error, lang: ref.read(languageProvider));
        _loading = false;
      });
    }
  }

  /// When no storage source is selected yet, default to the first available
  /// one — shared by the cache-hit and network-load paths.
  void _applyDefaultStorageSource() {
    if ((_settings.storageSourceId == null ||
            _settings.storageSourceId!.isEmpty) &&
        _storageSources.isNotEmpty) {
      setState(() {
        _settings =
            _settings.copyWith(storageSourceId: _storageSources.first.id);
      });
    }
  }

  void _toggleAlbum(String id) {
    final next = {..._settings.albumIds};
    next.contains(id) ? next.remove(id) : next.add(id);
    setState(() => _settings = _settings.copyWith(albumIds: next.toList()));
  }

  void _toggleStory(String id) {
    final next = {..._settings.storyIds};
    next.contains(id) ? next.remove(id) : next.add(id);
    setState(() => _settings = _settings.copyWith(storyIds: next.toList()));
  }

  void _toggleCategory(String name) {
    final next = {..._settings.categories};
    next.contains(name) ? next.remove(name) : next.add(name);
    setState(() => _settings = _settings.copyWith(categories: next.toList()));
  }

  void _applyTextFields() {
    final prefix = _titlePrefixController.text.trim();
    final path = _storagePathController.text.trim();
    final maxRaw = _maxSizeController.text.trim();
    double? maxSize;
    if (maxRaw.isNotEmpty) {
      maxSize = double.tryParse(maxRaw);
      if (maxSize != null && maxSize <= 0) maxSize = null;
    }
    _settings = _settings.copyWith(
      titlePrefix: prefix,
      storagePath: path,
      maxSizeMb: maxSize,
    );
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isFilm = _settings.photoType == UploadPhotoType.film;

    return SizedBox(
      height: MediaQuery.sizeOf(context).height * 0.9,
      child: Column(
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 12, 14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        AppStrings.t('upload.targets', lang: lang),
                        style: theme.textTheme.headlineSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.3,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                AppIconButton(
                  onPressed: () => Navigator.pop(context),
                  semanticLabel: AppStrings.t('common.cancel', lang: lang),
                  icon: Icons.close,
                ),
              ],
            ),
          ),
          const AppDivider(),
          if (!_loading && _error == null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                    _PickerSummaryChip(
                      icon: _settings.photoType == UploadPhotoType.film
                          ? Icons.camera_roll_outlined
                          : Icons.camera_alt_outlined,
                      label: AppStrings.t(
                        _settings.photoType == UploadPhotoType.film
                            ? 'upload.photoType.film'
                            : 'upload.photoType.digital',
                        lang: lang,
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    _PickerSummaryChip(
                      icon: Icons.photo_album_outlined,
                      label:
                          '${AppStrings.t('upload.albums', lang: lang)} ${_settings.albumIds.length}',
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    _PickerSummaryChip(
                      icon: Icons.auto_stories_outlined,
                      label:
                          '${AppStrings.t('upload.stories', lang: lang)} ${_settings.storyIds.length}',
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    _PickerSummaryChip(
                      icon: _settings.showFlag
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                      label: AppStrings.t(
                        _settings.showFlag
                            ? 'preview.visible'
                            : 'preview.hidden',
                        lang: lang,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          if (_loading)
            const Expanded(child: Center(child: AppSpinner()))
          else if (_error != null)
            Expanded(
              child: AppEmptyState(
                icon: Icons.cloud_off_outlined,
                title: AppStrings.t('error.generic', lang: lang),
                description: _error!,
                action: AppButton(
                  onPressed: _load,
                  tone: AppButtonTone.secondary,
                  icon: Icons.refresh,
                  label: AppStrings.t('common.retry', lang: lang),
                ),
              ),
            )
          else
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                children: [
                  _SheetSection(
                    title: AppStrings.t('upload.options', lang: lang),
                    icon: Icons.tune_outlined,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                          child: Text(
                            AppStrings.t(
                              'upload.photoTypeDescription',
                              lang: lang,
                            ),
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                          child: AppSegmented<String>(
                            items: [
                              (
                                UploadPhotoType.digital,
                                AppStrings.t(
                                  'upload.photoType.digital',
                                  lang: lang,
                                ),
                                Icons.camera_alt_outlined,
                              ),
                              (
                                UploadPhotoType.film,
                                AppStrings.t(
                                  'upload.photoType.film',
                                  lang: lang,
                                ),
                                Icons.camera_roll_outlined,
                              ),
                            ],
                            value: _settings.photoType,
                            onChanged: (value) => setState(
                              () => _settings = _settings.copyWith(
                                photoType: value,
                              ),
                            ),
                          ),
                        ),
                        const AppDivider(indent: 16, endIndent: 16),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                          child: AppTextField(
                            controller: _titlePrefixController,
                            label: AppStrings.t(
                              'upload.titlePrefix',
                              lang: lang,
                            ),
                            hint: AppStrings.t(
                              'upload.titlePrefixHint',
                              lang: lang,
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        _PickerToggleRow(
                          icon: Icons.compress_outlined,
                          label: AppStrings.t('upload.compress', lang: lang),
                          subtitle: AppStrings.t(
                            'upload.maxSizeMbHint',
                            lang: lang,
                          ),
                          value: _settings.compressEnabled,
                          onChanged: (value) => setState(
                            () => _settings = _settings.copyWith(
                              compressEnabled: value,
                            ),
                          ),
                        ),
                        if (_settings.compressEnabled)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 4),
                            child: AppTextField(
                              controller: _maxSizeController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              label: AppStrings.t(
                                'upload.maxSizeMb',
                                lang: lang,
                              ),
                              hint: AppStrings.t(
                                'upload.maxSizeMbHint',
                                lang: lang,
                              ),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                        _PickerToggleRow(
                          icon: _settings.showFlag
                              ? Icons.visibility_outlined
                              : Icons.visibility_off_outlined,
                          label: AppStrings.t('upload.showFlag', lang: lang),
                          value: _settings.showFlag,
                          onChanged: (value) => setState(
                            () =>
                                _settings = _settings.copyWith(showFlag: value),
                          ),
                        ),
                        _PickerToggleRow(
                          icon: Icons.location_off_outlined,
                          label: AppStrings.t('upload.stripGps', lang: lang),
                          value: _settings.stripGps,
                          onChanged: (value) => setState(
                            () =>
                                _settings = _settings.copyWith(stripGps: value),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _SheetSection(
                    title: AppStrings.t('upload.categories', lang: lang),
                    icon: Icons.label_outline,
                    child: _categories.isEmpty
                        ? _EmptyTargetRow(
                            label: AppStrings.t(
                              'upload.noCategories',
                              lang: lang,
                            ),
                          )
                        : _TargetChipGroup(
                            items: [
                              for (final name in _categories)
                                _TargetChipItem(id: name, label: name),
                            ],
                            selectedIds: _settings.categories.toSet(),
                            onToggle: _toggleCategory,
                          ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _SheetSection(
                    title: AppStrings.t('upload.storageSource', lang: lang),
                    icon: Icons.cloud_outlined,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_storageSources.isEmpty)
                          _EmptyTargetRow(
                            label: AppStrings.t(
                              'upload.noStorageSources',
                              lang: lang,
                            ),
                          )
                        else
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.sm,
                            ),
                            child: Column(
                              children: [
                                AppChoiceRow(
                                  label:
                                      AppStrings.t('upload.none', lang: lang),
                                  selected: (_settings.storageSourceId ?? '')
                                      .isEmpty,
                                  onTap: () => setState(
                                    () => _settings = _settings.copyWith(
                                      clearStorageSourceId: true,
                                    ),
                                  ),
                                ),
                                for (final source in _storageSources) ...[
                                  const SizedBox(height: 6),
                                  AppChoiceRow(
                                    label: source.name,
                                    selected:
                                        _settings.storageSourceId == source.id,
                                    onTap: () => setState(
                                      () => _settings = _settings.copyWith(
                                        storageSourceId: source.id,
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
                          child: AppTextField(
                            controller: _storagePathController,
                            label: AppStrings.t(
                              'upload.storagePath',
                              lang: lang,
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        _PickerToggleRow(
                          icon: Icons.folder_copy_outlined,
                          label: AppStrings.t(
                            'upload.storagePathFull',
                            lang: lang,
                          ),
                          value: _settings.storagePathFull,
                          onChanged: (value) => setState(
                            () => _settings = _settings.copyWith(
                              storagePathFull: value,
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _SheetSection(
                    title: AppStrings.t('upload.albums', lang: lang),
                    icon: Icons.photo_album_outlined,
                    child: _albums.isEmpty
                        ? _EmptyTargetRow(
                            label: AppStrings.t('upload.noAlbums', lang: lang),
                          )
                        : _TargetChipGroup(
                            items: [
                              for (final album in _albums)
                                _TargetChipItem(
                                  id: album.id,
                                  label: album.name,
                                ),
                            ],
                            selectedIds: _settings.albumIds.toSet(),
                            onToggle: _toggleAlbum,
                          ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _SheetSection(
                    title: AppStrings.t('upload.stories', lang: lang),
                    icon: Icons.auto_stories_outlined,
                    child: _stories.isEmpty
                        ? _EmptyTargetRow(
                            label: AppStrings.t('upload.noStories', lang: lang),
                          )
                        : _TargetChipGroup(
                            items: [
                              for (final story in _stories)
                                _TargetChipItem(
                                  id: story.id,
                                  label: story.name,
                                ),
                            ],
                            selectedIds: _settings.storyIds.toSet(),
                            onToggle: _toggleStory,
                          ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _SheetSection(
                    title: AppStrings.t('upload.filmRoll', lang: lang),
                    icon: Icons.movie_filter_outlined,
                    child: !isFilm
                        ? _EmptyTargetRow(
                            label: AppStrings.t(
                              'upload.filmRollFilmOnly',
                              lang: lang,
                            ),
                          )
                        : Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: AppSpacing.sm,
                            ),
                            child: Column(
                              children: [
                                AppChoiceRow(
                                  label:
                                      AppStrings.t('upload.none', lang: lang),
                                  selected:
                                      (_settings.filmRollId ?? '').isEmpty,
                                  onTap: () => setState(
                                    () => _settings = _settings.copyWith(
                                      clearFilmRollId: true,
                                    ),
                                  ),
                                ),
                                if (_rolls.isEmpty)
                                  Padding(
                                    padding: const EdgeInsets.only(
                                      top: AppSpacing.xs,
                                    ),
                                    child: _EmptyTargetRow(
                                      label: AppStrings.t(
                                        'upload.noFilmRolls',
                                        lang: lang,
                                      ),
                                    ),
                                  )
                                else
                                  for (final roll in _rolls) ...[
                                    const SizedBox(height: 6),
                                    AppChoiceRow(
                                      label: roll.name,
                                      selected:
                                          _settings.filmRollId == roll.id,
                                      onTap: () => setState(
                                        () => _settings = _settings.copyWith(
                                          filmRollId: roll.id,
                                        ),
                                      ),
                                    ),
                                  ],
                                const SizedBox(height: AppSpacing.sm),
                              ],
                            ),
                          ),
                  ),
                ],
              ),
            ),
          if (!_loading && _error == null)
            Container(
              decoration: BoxDecoration(
                color: scheme.surfaceContainerLow,
                border: Border(
                  top: BorderSide(color: scheme.outlineVariant),
                ),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: AppButton(
                          label: AppStrings.t('common.cancel', lang: lang),
                          tone: AppButtonTone.secondary,
                          onPressed: () => Navigator.pop(context),
                          expand: true,
                        ),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        flex: 2,
                        child: AppButton(
                          label:
                              AppStrings.t('upload.applyTargets', lang: lang),
                          icon: Icons.check,
                          onPressed: () {
                            _applyTextFields();
                            Navigator.pop(context, _settings);
                          },
                          expand: true,
                        ),
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

class _PickerToggleRow extends StatelessWidget {
  const _PickerToggleRow({
    required this.icon,
    required this.label,
    required this.value,
    required this.onChanged,
    this.subtitle,
  });

  final IconData icon;
  final String label;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 2, 8, 2),
      child: AppPressable(
        onTap: () => onChanged(!value),
        semanticLabel: label,
        scale: 0.99,
        dim: 0.88,
        child: Container(
          constraints: const BoxConstraints(minHeight: 52),
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
          child: Row(
            children: [
              Icon(icon, size: 20, color: scheme.onSurfaceVariant),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(label, style: theme.textTheme.titleSmall),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle!,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: scheme.onSurfaceVariant,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              AppSwitch(value: value, onChanged: onChanged),
            ],
          ),
        ),
      ),
    );
  }
}

class _PickerSummaryChip extends StatelessWidget {
  const _PickerSummaryChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      constraints: const BoxConstraints(minHeight: 36),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 15, color: scheme.onSurfaceVariant),
          const SizedBox(width: 6),
          Text(
            label,
            style: theme.textTheme.labelMedium?.copyWith(
              color: scheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _TargetChipItem {
  const _TargetChipItem({required this.id, required this.label});

  final String id;
  final String label;
}

class _TargetChipGroup extends StatelessWidget {
  const _TargetChipGroup({
    required this.items,
    required this.selectedIds,
    required this.onToggle,
  });

  final List<_TargetChipItem> items;
  final Set<String> selectedIds;
  final ValueChanged<String> onToggle;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: [
          for (final item in items)
            _TargetChip(
              label: item.label,
              selected: selectedIds.contains(item.id),
              onTap: () => onToggle(item.id),
              scheme: scheme,
            ),
        ],
      ),
    );
  }
}

/// Compact multi-select chip — square stamp style, not a Material chip.
class _TargetChip extends StatelessWidget {
  const _TargetChip({
    required this.label,
    required this.selected,
    required this.onTap,
    required this.scheme,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final ColorScheme scheme;

  @override
  Widget build(BuildContext context) {
    return AppPressable(
      onTap: onTap,
      semanticLabel: label,
      scale: 0.96,
      dim: 0.85,
      child: AnimatedContainer(
        duration: AppMotion.fast,
        curve: AppMotion.curve,
        constraints: const BoxConstraints(minHeight: 36),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? scheme.primary : scheme.surfaceContainer,
          borderRadius: BorderRadius.circular(AppRadius.small),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (selected) ...[
              Icon(Icons.check, size: 14, color: scheme.onPrimary),
              const SizedBox(width: 5),
            ],
            Text(
              label,
              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                    color: selected ? scheme.onPrimary : scheme.onSurface,
                    fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SheetSection extends StatelessWidget {
  const _SheetSection({
    required this.title,
    required this.icon,
    required this.child,
  });

  final String title;
  final IconData icon;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return AppCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
            child: Row(
              children: [
                Icon(icon, size: 18, color: scheme.tertiary),
                const SizedBox(width: AppSpacing.sm),
                Text(title, style: theme.textTheme.titleMedium),
              ],
            ),
          ),
          child,
        ],
      ),
    );
  }
}

class _EmptyTargetRow extends StatelessWidget {
  const _EmptyTargetRow({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      child: Text(
        label,
        style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
      ),
    );
  }
}
