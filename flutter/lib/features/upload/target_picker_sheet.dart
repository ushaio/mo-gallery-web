import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/api/api_exception.dart';
import '../../core/error/error_messages.dart';
import '../../l10n/strings.dart';
import '../catalog/catalog_api.dart';
import 'photos_api.dart';
import 'upload_models.dart';

Future<UploadBatchSettings?> showTargetPickerSheet({
  required BuildContext context,
  required UploadBatchSettings initial,
}) {
  return showModalBottomSheet<UploadBatchSettings>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    constraints: const BoxConstraints(maxWidth: 720),
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
        // Default to first storage source when none selected yet.
        if ((_settings.storageSourceId == null ||
                _settings.storageSourceId!.isEmpty) &&
            storageSources.isNotEmpty) {
          _settings =
              _settings.copyWith(storageSourceId: storageSources.first.id);
        }
        _loading = false;
      });
    } catch (error) {
      if (error is ApiException && error.isUnauthorized) return;
      if (!mounted) return;
      setState(() {
        _error = mapErrorMessage(error, lang: ref.read(languageProvider));
        _loading = false;
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
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 0, 12, 16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        AppStrings.t('upload.targets', lang: lang),
                        style: theme.textTheme.headlineSmall,
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      Text(
                        AppStrings.t('upload.targetsDescription', lang: lang),
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  tooltip: MaterialLocalizations.of(context).closeButtonTooltip,
                  icon: const Icon(Icons.close),
                ),
              ],
            ),
          ),
          Divider(color: scheme.outlineVariant),
          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_error != null)
            Expanded(
              child: AppEmptyState(
                icon: Icons.cloud_off_outlined,
                title: AppStrings.t('error.generic', lang: lang),
                description: _error!,
                action: FilledButton.tonalIcon(
                  onPressed: _load,
                  icon: const Icon(Icons.refresh),
                  label: Text(AppStrings.t('common.retry', lang: lang)),
                ),
              ),
            )
          else
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                children: [
                  _SheetSection(
                    title: AppStrings.t('upload.options', lang: lang),
                    icon: Icons.tune_outlined,
                    child: Column(
                      children: [
                        ListTile(
                          title: Text(
                            AppStrings.t('upload.photoType', lang: lang),
                          ),
                          subtitle: Text(
                            AppStrings.t(
                              'upload.photoTypeDescription',
                              lang: lang,
                            ),
                          ),
                        ),
                        RadioGroup<String>(
                          groupValue: _settings.photoType,
                          onChanged: (value) {
                            if (value == null) return;
                            setState(
                              () => _settings = _settings.copyWith(
                                photoType: value,
                              ),
                            );
                          },
                          child: Column(
                            children: [
                              RadioListTile<String>(
                                value: UploadPhotoType.digital,
                                title: Text(
                                  AppStrings.t(
                                    'upload.photoType.digital',
                                    lang: lang,
                                  ),
                                ),
                              ),
                              RadioListTile<String>(
                                value: UploadPhotoType.film,
                                title: Text(
                                  AppStrings.t(
                                    'upload.photoType.film',
                                    lang: lang,
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        const Divider(),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                          child: TextField(
                            controller: _titlePrefixController,
                            decoration: InputDecoration(
                              labelText: AppStrings.t(
                                'upload.titlePrefix',
                                lang: lang,
                              ),
                              hintText: AppStrings.t(
                                'upload.titlePrefixHint',
                                lang: lang,
                              ),
                              border: const OutlineInputBorder(),
                              isDense: true,
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        SwitchListTile(
                          title:
                              Text(AppStrings.t('upload.compress', lang: lang)),
                          value: _settings.compressEnabled,
                          onChanged: (value) => setState(
                            () => _settings = _settings.copyWith(
                              compressEnabled: value,
                            ),
                          ),
                        ),
                        if (_settings.compressEnabled)
                          Padding(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                            child: TextField(
                              controller: _maxSizeController,
                              keyboardType:
                                  const TextInputType.numberWithOptions(
                                decimal: true,
                              ),
                              decoration: InputDecoration(
                                labelText: AppStrings.t(
                                  'upload.maxSizeMb',
                                  lang: lang,
                                ),
                                hintText: AppStrings.t(
                                  'upload.maxSizeMbHint',
                                  lang: lang,
                                ),
                                border: const OutlineInputBorder(),
                                isDense: true,
                              ),
                              onChanged: (_) => setState(() {}),
                            ),
                          ),
                        SwitchListTile(
                          title:
                              Text(AppStrings.t('upload.showFlag', lang: lang)),
                          value: _settings.showFlag,
                          onChanged: (value) => setState(
                            () =>
                                _settings = _settings.copyWith(showFlag: value),
                          ),
                        ),
                        SwitchListTile(
                          title:
                              Text(AppStrings.t('upload.stripGps', lang: lang)),
                          value: _settings.stripGps,
                          onChanged: (value) => setState(
                            () =>
                                _settings = _settings.copyWith(stripGps: value),
                          ),
                        ),
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
                        : Column(
                            children: _categories
                                .map(
                                  (name) => CheckboxListTile(
                                    value: _settings.categories.contains(name),
                                    onChanged: (_) => _toggleCategory(name),
                                    title: Text(name),
                                  ),
                                )
                                .toList(),
                          ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  _SheetSection(
                    title: AppStrings.t('upload.storageSource', lang: lang),
                    icon: Icons.cloud_outlined,
                    child: Column(
                      children: [
                        if (_storageSources.isEmpty)
                          _EmptyTargetRow(
                            label: AppStrings.t(
                              'upload.noStorageSources',
                              lang: lang,
                            ),
                          )
                        else
                          RadioGroup<String>(
                            groupValue: _settings.storageSourceId ?? '',
                            onChanged: (value) => setState(
                              () => _settings = value == null || value.isEmpty
                                  ? _settings.copyWith(
                                      clearStorageSourceId: true,
                                    )
                                  : _settings.copyWith(
                                      storageSourceId: value,
                                    ),
                            ),
                            child: Column(
                              children: [
                                RadioListTile<String>(
                                  value: '',
                                  title: Text(
                                    AppStrings.t('upload.none', lang: lang),
                                  ),
                                ),
                                ..._storageSources.map(
                                  (source) => RadioListTile<String>(
                                    value: source.id,
                                    title: Text(source.name),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                          child: TextField(
                            controller: _storagePathController,
                            decoration: InputDecoration(
                              labelText: AppStrings.t(
                                'upload.storagePath',
                                lang: lang,
                              ),
                              border: const OutlineInputBorder(),
                              isDense: true,
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        SwitchListTile(
                          title: Text(
                            AppStrings.t(
                              'upload.storagePathFull',
                              lang: lang,
                            ),
                          ),
                          value: _settings.storagePathFull,
                          onChanged: (value) => setState(
                            () => _settings = _settings.copyWith(
                              storagePathFull: value,
                            ),
                          ),
                        ),
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
                        : Column(
                            children: _albums
                                .map(
                                  (album) => CheckboxListTile(
                                    value:
                                        _settings.albumIds.contains(album.id),
                                    onChanged: (_) => _toggleAlbum(album.id),
                                    title: Text(album.name),
                                  ),
                                )
                                .toList(),
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
                        : Column(
                            children: _stories
                                .map(
                                  (story) => CheckboxListTile(
                                    value:
                                        _settings.storyIds.contains(story.id),
                                    onChanged: (_) => _toggleStory(story.id),
                                    title: Text(story.name),
                                  ),
                                )
                                .toList(),
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
                        : RadioGroup<String>(
                            groupValue: _settings.filmRollId ?? '',
                            onChanged: (value) => setState(
                              () => _settings = value == null || value.isEmpty
                                  ? _settings.copyWith(
                                      clearFilmRollId: true,
                                    )
                                  : _settings.copyWith(filmRollId: value),
                            ),
                            child: Column(
                              children: [
                                RadioListTile<String>(
                                  value: '',
                                  title: Text(
                                    AppStrings.t('upload.none', lang: lang),
                                  ),
                                ),
                                if (_rolls.isEmpty)
                                  _EmptyTargetRow(
                                    label: AppStrings.t(
                                      'upload.noFilmRolls',
                                      lang: lang,
                                    ),
                                  )
                                else
                                  ..._rolls.map(
                                    (roll) => RadioListTile<String>(
                                      value: roll.id,
                                      title: Text(roll.name),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                  ),
                ],
              ),
            ),
          if (!_loading && _error == null)
            Material(
              color: scheme.surface,
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.pop(context),
                          child:
                              Text(AppStrings.t('common.cancel', lang: lang)),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.md),
                      Expanded(
                        flex: 2,
                        child: FilledButton.icon(
                          onPressed: () {
                            _applyTextFields();
                            Navigator.pop(context, _settings);
                          },
                          icon: const Icon(Icons.check),
                          label: Text(
                            AppStrings.t('upload.applyTargets', lang: lang),
                          ),
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
    return SectionCard(
      padding: EdgeInsets.zero,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
            child: Row(
              children: [
                Icon(icon, size: 20, color: theme.colorScheme.primary),
                const SizedBox(width: AppSpacing.sm),
                Text(title, style: theme.textTheme.titleMedium),
              ],
            ),
          ),
          child,
          const SizedBox(height: AppSpacing.xs),
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
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      child: Text(
        label,
        style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant),
      ),
    );
  }
}
