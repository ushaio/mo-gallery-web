import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/api/envelope.dart';
import '../../core/images/app_network_image.dart';
import '../../l10n/strings.dart';
import '../catalog/catalog_api.dart';

class StoriesPage extends ConsumerStatefulWidget {
  const StoriesPage({super.key});

  @override
  ConsumerState<StoriesPage> createState() => _StoriesPageState();
}

class _StoriesPageState extends ConsumerState<StoriesPage>
    with AutomaticKeepAliveClientMixin {
  final _searchController = TextEditingController();
  List<StoryDto> _stories = const [];
  bool _loading = true;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _watchTabRefresh() {
    ref.listen<String?>(tabRefreshProvider, (previous, next) {
      if (next != 'stories') return;
      Future.microtask(() {
        if (!mounted) return;
        if (ref.read(tabRefreshProvider) == 'stories') {
          ref.read(tabRefreshProvider.notifier).state = null;
        }
      });
      _load();
    });
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final stories =
          await StoryBrowseApi(ref.read(apiClientProvider)).listStories();
      if (!mounted) return;
      setState(() {
        _stories = stories;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    _watchTabRefresh();
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionProvider);
    final query = _searchController.text.trim().toLowerCase();
    final filtered = query.isEmpty
        ? _stories
        : _stories.where((story) {
            return story.title.toLowerCase().contains(query) ||
                storyPlainText(story.content).toLowerCase().contains(query);
          }).toList();
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _load,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  AppStrings.t('nav.stories', lang: lang)
                                      .toUpperCase(),
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: scheme.primary,
                                    letterSpacing: 2.4,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                Text(
                                  AppStrings.t('stories.title', lang: lang),
                                  style:
                                      theme.textTheme.headlineMedium?.copyWith(
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: -1,
                                    height: 1.05,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            '${filtered.length}',
                            style: theme.textTheme.displaySmall?.copyWith(
                              fontWeight: FontWeight.w200,
                              fontSize: 48,
                              height: 0.9,
                              color: scheme.onSurface.withValues(alpha: 0.16),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      TextField(
                        controller: _searchController,
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          hintText: AppStrings.t('stories.search', lang: lang),
                          prefixIcon: const Icon(Icons.search, size: 18),
                          suffixIcon: query.isEmpty
                              ? null
                              : IconButton(
                                  onPressed: () {
                                    _searchController.clear();
                                    setState(() {});
                                  },
                                  icon: const Icon(Icons.close, size: 18),
                                ),
                        ),
                      ),
                      const SizedBox(height: 8),
                    ],
                  ),
                ),
              ),
              if (_loading)
                const SliverFillRemaining(
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: AppEmptyState(
                    icon: Icons.cloud_off_outlined,
                    title: AppStrings.t('stories.errorTitle', lang: lang),
                    description: AppStrings.t('stories.errorBody', lang: lang),
                    action: FilledButton.tonalIcon(
                      onPressed: _load,
                      icon: const Icon(Icons.refresh),
                      label: Text(AppStrings.t('common.retry', lang: lang)),
                    ),
                  ),
                )
              else if (filtered.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: AppEmptyState(
                    icon: Icons.auto_stories_outlined,
                    title: AppStrings.t('stories.emptyTitle', lang: lang),
                    description: AppStrings.t('stories.emptyBody', lang: lang),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.only(bottom: AppChrome.bottomInset),
                  sliver: SliverList.builder(
                    itemCount: filtered.length,
                    itemBuilder: (context, index) => _MagazineCover(
                      story: filtered[index],
                      index: index,
                      serverUrl: session?.serverUrl ?? '',
                      lang: lang,
                      onTap: () => context.push(
                        '/stories/${Uri.encodeComponent(filtered[index].id)}',
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Magazine cover plate — full-width image + overlaid typography.
class _MagazineCover extends StatelessWidget {
  const _MagazineCover({
    required this.story,
    required this.index,
    required this.serverUrl,
    required this.lang,
    required this.onTap,
  });

  final StoryDto story;
  final int index;
  final String serverUrl;
  final String lang;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final cover = story.coverPhoto;
    final source = resolveAssetUrl(
      cover?.thumbnailUrl ?? cover?.url,
      serverUrl: serverUrl,
    );
    final title = story.title.isEmpty
        ? AppStrings.t('stories.untitled', lang: lang)
        : story.title;
    final preview = storyPreview(story.content);
    final height = MediaQuery.sizeOf(context).width < 420 ? 220.0 : 260.0;

    return Material(
      color: Colors.black,
      child: InkWell(
        onTap: onTap,
        child: SizedBox(
          height: height,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Hero(
                tag: 'story-${story.id}',
                child: _StoryCover(
                  source: source,
                  crop: story.coverCrop,
                  height: height,
                ),
              ),
              DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withValues(alpha: 0.15),
                      Colors.black.withValues(alpha: 0.82),
                    ],
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          (index + 1).toString().padLeft(2, '0'),
                          style: const TextStyle(
                            color: Colors.white70,
                            fontWeight: FontWeight.w800,
                            letterSpacing: 1.5,
                            fontSize: 12,
                          ),
                        ),
                        const Spacer(),
                        _PublicationBadge(
                          published: story.isPublished,
                          lang: lang,
                        ),
                      ],
                    ),
                    const Spacer(),
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.headlineSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.6,
                        height: 1.1,
                      ),
                    ),
                    if (preview.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        preview,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: Colors.white70,
                          height: 1.35,
                        ),
                      ),
                    ],
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Text(
                          _storyDate(story.displayDate),
                          style: const TextStyle(
                            color: Colors.white60,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Text(
                          '${story.photos.length} ${AppStrings.t('stories.photos', lang: lang)}',
                          style: const TextStyle(
                            color: Colors.white60,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class StoryDetailPage extends ConsumerStatefulWidget {
  const StoryDetailPage({super.key, required this.storyId});

  final String storyId;

  @override
  ConsumerState<StoryDetailPage> createState() => _StoryDetailPageState();
}

class _StoryDetailPageState extends ConsumerState<StoryDetailPage> {
  StoryDto? _story;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final story = await StoryBrowseApi(ref.read(apiClientProvider))
          .getStory(widget.storyId);
      if (!mounted) return;
      setState(() {
        _story = story;
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionProvider);
    final story = _story;
    return Scaffold(
      appBar: AppBar(title: Text(AppStrings.t('stories.detail', lang: lang))),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null || story == null
              ? AppEmptyState(
                  icon: Icons.menu_book_outlined,
                  title: AppStrings.t('stories.detailError', lang: lang),
                  description: AppStrings.t('stories.errorBody', lang: lang),
                  action: FilledButton.tonalIcon(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh),
                    label: Text(AppStrings.t('common.retry', lang: lang)),
                  ),
                )
              : _StoryDetailContent(
                  story: story,
                  serverUrl: session?.serverUrl ?? '',
                  lang: lang,
                ),
    );
  }
}

class _StoryDetailContent extends StatelessWidget {
  const _StoryDetailContent({
    required this.story,
    required this.serverUrl,
    required this.lang,
  });

  final StoryDto story;
  final String serverUrl;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final cover = story.coverPhoto;
    final coverSource = resolveAssetUrl(
      cover?.url ?? cover?.thumbnailUrl,
      serverUrl: serverUrl,
    );
    final plainText = storyPlainText(story.content);
    final readingMinutes = plainText.isEmpty
        ? 1
        : (plainText.characters.length / 500).ceil().clamp(1, 999);

    return ResponsivePage(
      maxWidth: 860,
      padding: EdgeInsets.zero,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 48),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Hero(
              tag: 'story-${story.id}',
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadius.large),
                child: _StoryCover(
                  source: coverSource,
                  crop: story.coverCrop,
                  height: MediaQuery.sizeOf(context).width < 600 ? 260 : 420,
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                _PublicationBadge(published: story.isPublished, lang: lang),
                const SizedBox(width: 10),
                Text(
                  _storyDate(story.displayDate),
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Text(
              story.title.isEmpty
                  ? AppStrings.t('stories.untitled', lang: lang)
                  : story.title,
              style: theme.textTheme.headlineLarge,
            ),
            const SizedBox(height: 14),
            Wrap(
              spacing: 18,
              runSpacing: 8,
              children: [
                _StoryMetric(
                  icon: Icons.schedule,
                  label:
                      '$readingMinutes ${AppStrings.t('stories.minutes', lang: lang)}',
                ),
                _StoryMetric(
                  icon: Icons.photo_library_outlined,
                  label:
                      '${story.photos.length} ${AppStrings.t('stories.photos', lang: lang)}',
                ),
              ],
            ),
            const SizedBox(height: 28),
            Divider(color: scheme.outlineVariant),
            const SizedBox(height: 20),
            if (story.content.trim().isEmpty)
              Text(
                AppStrings.t('stories.noContent', lang: lang),
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              )
            else
              _StoryBody(
                story: story,
                serverUrl: serverUrl,
              ),
            if (story.photos.isNotEmpty) ...[
              const SizedBox(height: 32),
              Text(
                AppStrings.t('stories.archive', lang: lang),
                style: theme.textTheme.titleLarge,
              ),
              const SizedBox(height: 12),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: story.photos.length,
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 220,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 1,
                ),
                itemBuilder: (context, index) {
                  final photo = story.photos[index];
                  final source = resolveAssetUrl(
                    photo.thumbnailUrl ?? photo.url,
                    serverUrl: serverUrl,
                  );
                  return Material(
                    borderRadius: BorderRadius.circular(AppRadius.small),
                    clipBehavior: Clip.antiAlias,
                    child: Ink.image(
                      image: NetworkImage(source),
                      fit: BoxFit.cover,
                      child: InkWell(
                        onTap: () => context.push(
                          '/gallery/${Uri.encodeComponent(photo.id)}',
                        ),
                      ),
                    ),
                  );
                },
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StoryBody extends StatelessWidget {
  const _StoryBody({required this.story, required this.serverUrl});

  final StoryDto story;
  final String serverUrl;

  @override
  Widget build(BuildContext context) {
    final isHtml = RegExp(r'</?[a-z][\s\S]*>', caseSensitive: false)
        .hasMatch(story.content);
    if (!isHtml) {
      return MarkdownBody(
        data: _hydrateMarkdownImages(story.content, serverUrl),
        selectable: true,
      );
    }
    return Html(
      data: hydrateStoryImages(story, serverUrl: serverUrl),
    );
  }
}

class _StoryCover extends StatelessWidget {
  const _StoryCover({
    required this.source,
    required this.crop,
    required this.height,
  });

  final String source;
  final StoryCoverCrop? crop;
  final double height;

  @override
  Widget build(BuildContext context) {
    final crop = this.crop;
    final alignment = crop == null
        ? Alignment.center
        : Alignment(
            ((crop.x + crop.width / 2) * 2 - 1).clamp(-1, 1),
            ((crop.y + crop.height / 2) * 2 - 1).clamp(-1, 1),
          );
    final finiteHeight = height.isFinite ? height : 120.0;
    if (source.isEmpty) {
      return Container(
        height: height.isFinite ? height : null,
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        child: Center(
          child: Icon(
            Icons.auto_stories_outlined,
            size: height.isFinite ? 28 : 22,
          ),
        ),
      );
    }
    return SizedBox(
      height: height.isFinite ? height : null,
      width: double.infinity,
      child: AppNetworkImage(
        url: source,
        fit: BoxFit.cover,
        alignment: alignment,
        height: height.isFinite ? finiteHeight : null,
        memCacheWidth: 900,
      ),
    );
  }
}

class _PublicationBadge extends StatelessWidget {
  const _PublicationBadge({required this.published, required this.lang});

  final bool published;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = published ? scheme.tertiary : scheme.outline;
    return StatusChip(
      label: AppStrings.t(
        published ? 'stories.published' : 'stories.draft',
        lang: lang,
      ),
      background: color.withValues(alpha: 0.16),
      foreground: color,
    );
  }
}

class _StoryMetric extends StatelessWidget {
  const _StoryMetric({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.onSurfaceVariant;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 17, color: color),
        const SizedBox(width: 6),
        Text(label, style: TextStyle(color: color)),
      ],
    );
  }
}

String _storyDate(DateTime? date) {
  if (date == null) return '—';
  final local = date.toLocal();
  return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
}

String _hydrateMarkdownImages(String markdown, String serverUrl) {
  return markdown.replaceAllMapped(
    RegExp(r'(!\[[^\]]*\]\()([^\s\)]+)([^\)]*\))'),
    (match) =>
        '${match.group(1)}${resolveAssetUrl(match.group(2), serverUrl: serverUrl)}${match.group(3)}',
  );
}
