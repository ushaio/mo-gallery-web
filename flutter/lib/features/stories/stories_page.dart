import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../app/ui.dart';
import '../../core/api/envelope.dart';
import 'story_widgets.dart';
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
  bool _refreshing = false;
  String? _error;
  int _requestVersion = 0;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    // Register once for the page lifetime. Registering from build causes every
    // refresh setState to add another listener, which can leave the page in a
    // perpetual loading/blank state after repeated tab taps.
    ref.listenManual<String?>(tabRefreshProvider, (previous, next) {
      if (next != 'stories' || !mounted) return;
      ref.read(tabRefreshProvider.notifier).state = null;
      _load(preserveContent: true);
    });
    // `_loading` already starts true, so the skeleton is on screen for the
    // first frame. A delayed `setState(_loading = true)` would re-enter the
    // loading state after a fast response had already finished, stranding the
    // page in a skeleton forever.
    _load();
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _load({bool preserveContent = false}) async {
    final version = ++_requestVersion;
    if (mounted) {
      setState(() {
        // Keep existing stories on screen while refreshing. A transient
        // network delay should never turn a populated tab into a white page.
        _loading = !preserveContent || _stories.isEmpty;
        _refreshing = preserveContent && _stories.isNotEmpty;
        _error = null;
      });
    }
    try {
      final stories =
          await StoryBrowseApi(ref.read(apiClientProvider)).listStories();
      if (!mounted || version != _requestVersion) return;
      setState(() {
        _stories = stories;
        _loading = false;
        _refreshing = false;
      });
    } catch (error) {
      if (!mounted || version != _requestVersion) return;
      setState(() {
        _error = '$error';
        _loading = false;
        _refreshing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionProvider);
    final query = _searchController.text.trim().toLowerCase();
    final filtered = query.isEmpty
        ? _stories
        : _stories.where((story) {
            return story.title.toLowerCase().contains(query) ||
                storyPlainText(story.content).toLowerCase().contains(query);
          }).toList();

    return AppScreen(
      body: SafeArea(
        bottom: false,
        child: AppPullRefresh(
          onRefresh: () => _load(preserveContent: true),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                  child: AppPageHeader(
                    eyebrow: 'MO GALLERY / EDITORIAL FILES',
                    title: AppStrings.t('stories.title', lang: lang),
                    trailing: AppCountStamp(
                      value: '${filtered.length}',
                      label: AppStrings.t('stories.countUnit', lang: lang),
                      icon: Icons.auto_stories_rounded,
                    ),
                  ),
                ),
              ),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                  child: AppTextField(
                    controller: _searchController,
                    hint: AppStrings.t('stories.search', lang: lang),
                    leading: const Icon(Icons.search),
                    trailing: query.isEmpty
                        ? null
                        : AppIconButton(
                            semanticLabel:
                                AppStrings.t('common.cancel', lang: lang),
                            onPressed: () {
                              _searchController.clear();
                              setState(() {});
                            },
                            icon: Icons.close,
                            filled: false,
                            size: 36,
                            iconSize: 18,
                          ),
                    textInputAction: TextInputAction.search,
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ),
              if (_refreshing)
                const SliverToBoxAdapter(
                  child: LinearProgressIndicator(minHeight: 2),
                ),
              if (_loading)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _StoriesLoadingState(
                    label: AppStrings.t('stories.loading', lang: lang),
                  ),
                )
              else if (_error != null && _stories.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: AppEmptyState(
                    icon: Icons.cloud_off_outlined,
                    title: AppStrings.t('stories.errorTitle', lang: lang),
                    description: AppStrings.t('stories.errorBody', lang: lang),
                    action: AppButton(
                      onPressed: _load,
                      tone: AppButtonTone.secondary,
                      icon: Icons.refresh,
                      label: AppStrings.t('common.retry', lang: lang),
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
              else ...[
                if (_error != null)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                      child: AppNotice(
                        message: AppStrings.t('stories.errorBody', lang: lang),
                        icon: Icons.sync_problem_outlined,
                        isError: true,
                        onDismiss: () => setState(() => _error = null),
                      ),
                    ),
                  ),
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            AppStrings.t('stories.latest', lang: lang),
                            style: Theme.of(context)
                                .textTheme
                                .headlineSmall
                                ?.copyWith(
                                  fontFamily: 'serif',
                                  fontWeight: FontWeight.w600,
                                  letterSpacing: 0,
                                ),
                          ),
                        ),
                        Text(
                          AppStrings.t('stories.sortDate', lang: lang),
                          style:
                              Theme.of(context).textTheme.labelSmall?.copyWith(
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurfaceVariant,
                                    fontSize: 9,
                                  ),
                        ),
                      ],
                    ),
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.only(bottom: AppChrome.bottomInset),
                  sliver: SliverList.builder(
                    itemCount: filtered.length,
                    itemBuilder: (context, index) => Padding(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 26),
                      child: AppEntrance(
                        delay: Duration(
                          milliseconds: (index * 24).clamp(0, 240),
                        ),
                        child: _StoryCard(
                          story: filtered[index],
                          serverUrl: session?.serverUrl ?? '',
                          lang: lang,
                          onTap: () => context.push(
                            '/stories/${Uri.encodeComponent(filtered[index].id)}',
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Loading feedback for the stories page. Mirrors the gallery's loading
/// state: a spinner + label row at the top, then a skeleton list below.
class _StoriesLoadingState extends StatelessWidget {
  const _StoriesLoadingState({required this.label});

  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
          child: Row(
            children: [
              const AppSpinner(size: 17, stroke: 2),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  label,
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
                ),
              ),
            ],
          ),
        ),
        const Expanded(child: AppSkeletonList()),
      ],
    );
  }
}

/// Cover plate with editorial date block and meta line below.
class _StoryCard extends StatelessWidget {
  const _StoryCard({
    required this.story,
    required this.serverUrl,
    required this.lang,
    required this.onTap,
  });

  final StoryDto story;
  final String serverUrl;
  final String lang;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final cover = story.coverPhoto;
    final source = resolveAssetUrl(
      cover?.thumbnailUrl ?? cover?.url,
      serverUrl: serverUrl,
    );
    final title = story.title.isEmpty
        ? AppStrings.t('stories.untitled', lang: lang)
        : story.title;

    return AppPressable(
      onTap: onTap,
      semanticLabel: title,
      scale: 0.985,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
            ),
            clipBehavior: Clip.antiAlias,
            child: AspectRatio(
              aspectRatio: 16 / 10,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  Hero(
                    tag: 'story-${story.id}',
                    child: StoryCover(
                      source: source,
                      crop: story.coverCrop,
                      height: double.infinity,
                    ),
                  ),
                  // Editorial date plate — bottom-left, for readability.
                  Positioned(
                    left: 0,
                    right: 0,
                    bottom: 0,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.transparent,
                            Colors.black.withValues(alpha: 0.5),
                          ],
                        ),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(14, 20, 14, 10),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              storyDateShort(story.displayDate),
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 17,
                                fontWeight: FontWeight.w800,
                                letterSpacing: 0.4,
                                fontFeatures: [FontFeature.tabularFigures()],
                                height: 1.1,
                              ),
                            ),
                            Text(
                              storyDateYear(story.displayDate),
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.7),
                                fontSize: 10,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.8,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  Positioned(
                    top: 14,
                    right: 14,
                    child: PublicationBadge(
                      published: story.isPublished,
                      lang: lang,
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Flexible(
                child: Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontFamily: 'serif',
                    fontSize: 23,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 0,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      Icons.photo_library_outlined,
                      size: 14,
                      color: scheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '${story.photos.length} ${AppStrings.t('stories.photos', lang: lang)}',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                        fontSize: 11,
                      ),
                    ),
                  ],
                ),
              ),
              const Spacer(),
              Container(
                width: 30,
                height: 30,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(9),
                ),
                child: Icon(
                  Icons.arrow_forward,
                  size: 18,
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
