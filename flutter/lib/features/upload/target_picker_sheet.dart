import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../l10n/strings.dart';
import '../catalog/catalog_api.dart';
import 'upload_models.dart';

Future<UploadBatchSettings?> showTargetPickerSheet({
  required BuildContext context,
  required UploadBatchSettings initial,
}) {
  return showModalBottomSheet<UploadBatchSettings>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
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
  List<IdName> _albums = const [];
  List<IdName> _stories = const [];
  List<IdName> _rolls = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _settings = widget.initial;
    _load();
  }

  Future<void> _load() async {
    final client = ref.read(apiClientProvider);
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final albums = await AlbumsApi(client).list();
      final stories = await StoriesApi(client).list();
      final rolls = await FilmRollsApi(client).list();
      if (!mounted) return;
      setState(() {
        _albums = albums;
        _stories = stories;
        _rolls = rolls;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  void _toggleAlbum(String id) {
    final next = {..._settings.albumIds};
    if (next.contains(id)) {
      next.remove(id);
    } else {
      next.add(id);
    }
    setState(() => _settings = _settings.copyWith(albumIds: next.toList()));
  }

  void _toggleStory(String id) {
    final next = {..._settings.storyIds};
    if (next.contains(id)) {
      next.remove(id);
    } else {
      next.add(id);
    }
    setState(() => _settings = _settings.copyWith(storyIds: next.toList()));
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final height = MediaQuery.sizeOf(context).height * 0.85;

    return SizedBox(
      height: height,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 8, 0),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    AppStrings.t('upload.targets', lang: lang),
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                TextButton(
                  onPressed: () => Navigator.pop(context, _settings),
                  child: Text(AppStrings.t('upload.start', lang: lang)),
                ),
              ],
            ),
          ),
          if (_loading)
            const Expanded(child: Center(child: CircularProgressIndicator()))
          else if (_error != null)
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(_error!, textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: _load, child: const Text('Retry')),
                    ],
                  ),
                ),
              ),
            )
          else
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  SwitchListTile(
                    title: Text(AppStrings.t('upload.compress', lang: lang)),
                    value: _settings.compressEnabled,
                    onChanged: (v) => setState(
                      () => _settings = _settings.copyWith(compressEnabled: v),
                    ),
                  ),
                  SwitchListTile(
                    title: Text(AppStrings.t('upload.showFlag', lang: lang)),
                    value: _settings.showFlag,
                    onChanged: (v) => setState(
                      () => _settings = _settings.copyWith(showFlag: v),
                    ),
                  ),
                  SwitchListTile(
                    title: Text(AppStrings.t('upload.stripGps', lang: lang)),
                    value: _settings.stripGps,
                    onChanged: (v) => setState(
                      () => _settings = _settings.copyWith(stripGps: v),
                    ),
                  ),
                  const Divider(),
                  Text(
                    AppStrings.t('upload.albums', lang: lang),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (_albums.isEmpty)
                    ListTile(title: Text(AppStrings.t('upload.none', lang: lang)))
                  else
                    ..._albums.map(
                      (a) => CheckboxListTile(
                        value: _settings.albumIds.contains(a.id),
                        onChanged: (_) => _toggleAlbum(a.id),
                        title: Text(a.name),
                      ),
                    ),
                  const SizedBox(height: 8),
                  Text(
                    AppStrings.t('upload.stories', lang: lang),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (_stories.isEmpty)
                    ListTile(title: Text(AppStrings.t('upload.none', lang: lang)))
                  else
                    ..._stories.map(
                      (s) => CheckboxListTile(
                        value: _settings.storyIds.contains(s.id),
                        onChanged: (_) => _toggleStory(s.id),
                        title: Text(s.name),
                      ),
                    ),
                  const SizedBox(height: 8),
                  Text(
                    AppStrings.t('upload.filmRoll', lang: lang),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  ListTile(
                    title: Text(AppStrings.t('upload.none', lang: lang)),
                    leading: Icon(
                      _settings.filmRollId == null
                          ? Icons.radio_button_checked
                          : Icons.radio_button_off,
                    ),
                    onTap: () => setState(
                      () => _settings = _settings.copyWith(clearFilmRollId: true),
                    ),
                  ),
                  ..._rolls.map(
                    (r) => ListTile(
                      title: Text(r.name),
                      leading: Icon(
                        _settings.filmRollId == r.id
                            ? Icons.radio_button_checked
                            : Icons.radio_button_off,
                      ),
                      onTap: () => setState(
                        () => _settings = _settings.copyWith(filmRollId: r.id),
                      ),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}
