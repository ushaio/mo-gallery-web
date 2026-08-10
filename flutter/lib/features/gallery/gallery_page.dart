import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../app/ui.dart';
import '../../core/api/envelope.dart';
import '../../core/images/app_network_image.dart';
import '../../l10n/strings.dart';
import '../upload/photos_api.dart';
import 'photo_viewer_page.dart';

class GalleryPage extends ConsumerStatefulWidget {
  const GalleryPage({super.key});

  @override
  ConsumerState<GalleryPage> createState() => _GalleryPageState();
}

class _GalleryPageState extends ConsumerState<GalleryPage>
    with AutomaticKeepAliveClientMixin {
  final _scrollController = ScrollController();
  final _searchController = TextEditingController();
  List<PhotoDto> _photos = const [];
  List<String> _categories = const [];
  PhotoPaginationMeta? _meta;
  String? _category;
  String? _error;
  bool _loading = true;
  bool _refreshing = false;
  bool _loadingMore = false;
  bool _categoriesLoading = true;
  bool _searchOpen = false;
  int _requestVersion = 0;
  int _categoryRequestVersion = 0;
  double _categoryDragDistance = 0;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_handleScroll);
    // This is a lifecycle subscription, not a build-time subscription. Keeping
    // it out of build prevents every loading setState from registering another
    // refresh handler and avoids refresh callbacks racing the widget tree.
    ref.listenManual<String?>(tabRefreshProvider, (previous, next) {
      if (next != 'gallery' || !mounted) return;
      ref.read(tabRefreshProvider.notifier).state = null;
      unawaited(_refreshAll());
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0,
          duration: AppMotion.medium,
          curve: AppMotion.curve,
        );
      }
    });
    unawaited(_loadCategories());
    // `_loading` already starts true, so the skeleton is on screen for the
    // first frame. A delayed `setState(_loading = true)` would re-enter the
    // loading state after a fast response had already finished, stranding the
    // page in a skeleton forever.
    unawaited(_loadInitial());
  }

  @override
  void dispose() {
    _scrollController
      ..removeListener(_handleScroll)
      ..dispose();
    _searchController.dispose();
    super.dispose();
  }

  GalleryApi get _api => GalleryApi(ref.read(apiClientProvider));

  void _handleScroll() {
    if (_scrollController.position.extentAfter < 360) {
      _loadMore();
    }
  }

  Future<void> _loadInitial({bool preserveContent = false}) async {
    final version = ++_requestVersion;
    if (mounted) {
      setState(() {
        // Keep the current catalog visible during a refresh. Replacing it with
        // a blank loading viewport makes a slow/network-failed refresh look
        // like the whole page disappeared.
        _loading = !preserveContent || _photos.isEmpty;
        _refreshing = preserveContent && _photos.isNotEmpty;
        _error = null;
      });
    }
    try {
      final page = await _api.listPhotos(
        category: _category,
        search: _searchController.text,
      );
      if (!mounted || version != _requestVersion) return;
      setState(() {
        _photos = page.items;
        _meta = page.meta;
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

  /// Categories load independently from photos. The category rail can become
  /// usable while the first photo page is still in flight, and switching a
  /// category no longer re-fetches the same catalog.
  Future<void> _loadCategories() async {
    final version = ++_categoryRequestVersion;
    if (mounted) setState(() => _categoriesLoading = true);
    try {
      final categories = await _api.getCategories();
      if (!mounted || version != _categoryRequestVersion) return;
      setState(() {
        _categories = categories;
        _categoriesLoading = false;
        if (_category != null && !categories.contains(_category)) {
          _category = null;
        }
      });
    } catch (_) {
      if (!mounted || version != _categoryRequestVersion) return;
      // Categories are best-effort: keep an existing catalog on refresh and
      // never blank photos because this secondary request failed.
      setState(() => _categoriesLoading = false);
    }
  }

  Future<void> _refreshAll() async {
    // Do not let a secondary catalog request determine whether the visible
    // gallery refresh is considered failed. _loadCategories is best-effort.
    await _loadInitial(preserveContent: true);
    await _loadCategories();
  }

  Future<void> _loadMore() async {
    final meta = _meta;
    if (_loading || _loadingMore || meta == null || !meta.hasMore) return;
    setState(() => _loadingMore = true);
    try {
      final next = await _api.listPhotos(
        page: meta.page + 1,
        pageSize: meta.pageSize,
        category: _category,
        search: _searchController.text,
      );
      if (!mounted) return;
      setState(() {
        _photos = [..._photos, ...next.items];
        _meta = next.meta;
      });
    } catch (error) {
      if (mounted) setState(() => _error = '$error');
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _setCategory(String? value) {
    if (_category == value) return;
    setState(() => _category = value);
    HapticFeedback.selectionClick();
    unawaited(_loadInitial());
  }

  void _handleCategoryDragStart(DragStartDetails details) {
    _categoryDragDistance = 0;
  }

  void _handleCategoryDragUpdate(DragUpdateDetails details) {
    _categoryDragDistance += details.primaryDelta ?? 0;
  }

  void _handleCategoryDragEnd(DragEndDetails details) {
    if (_categories.isEmpty) return;
    final velocity = details.primaryVelocity ?? 0;
    final shouldSwitch =
        _categoryDragDistance.abs() >= 56 || velocity.abs() >= 420;
    if (!shouldSwitch) return;

    final values = <String?>[null, ..._categories];
    final current = values.indexOf(_category).clamp(0, values.length - 1);
    // Swipe left advances; swipe right returns to the previous category.
    final forward =
        velocity.abs() >= 420 ? velocity < 0 : _categoryDragDistance < 0;
    final next = (current + (forward ? 1 : -1)).clamp(0, values.length - 1);
    if (next == current) {
      HapticFeedback.lightImpact();
      return;
    }
    _setCategory(values[next]);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionProvider);
    final scheme = Theme.of(context).colorScheme;
    final width = MediaQuery.sizeOf(context).width;
    final cols = width >= 1000
        ? 5
        : width >= 700
            ? 4
            : width >= 420
                ? 3
                : 2;
    final featuredPhoto = _photos.isEmpty
        ? null
        : _photos.firstWhere(
            (photo) => photo.isFeatured,
            orElse: () => _photos.first,
          );
    final collectionPhotos = featuredPhoto == null
        ? _photos
        : _photos.where((photo) => photo.id != featuredPhoto.id).toList();

    return AppScreen(
      body: SafeArea(
        bottom: false,
        child: AppPullRefresh(
          onRefresh: _refreshAll,
          child: GestureDetector(
            behavior: HitTestBehavior.translucent,
            onHorizontalDragStart: _handleCategoryDragStart,
            onHorizontalDragUpdate: _handleCategoryDragUpdate,
            onHorizontalDragEnd: _handleCategoryDragEnd,
            child: CustomScrollView(
              controller: _scrollController,
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 14, 16, 10),
                    child: AppPageHeader(
                      eyebrow: 'MO GALLERY / ARCHIVE INDEX',
                      title: AppStrings.t('gallery.title', lang: lang),
                      trailing: AppCountStamp(
                        value: '${_meta?.total ?? _photos.length}',
                        label: AppStrings.t('gallery.photosCount', lang: lang),
                        icon: Icons.grid_view_rounded,
                      ),
                    ),
                  ),
                ),
                if (_refreshing)
                  const SliverToBoxAdapter(
                    child: LinearProgressIndicator(minHeight: 2),
                  ),
                // Tool rail — category tabs + search trigger.
                SliverToBoxAdapter(
                  child: ColoredBox(
                    color: scheme.surface,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: _categories.isEmpty
                                  ? _categoriesLoading
                                      ? const _CategoryTabsSkeleton()
                                      : _CatalogTab(
                                          label: AppStrings.t(
                                            'gallery.all',
                                            lang: lang,
                                          ),
                                          selected: true,
                                          onTap: () {},
                                        )
                                  : SizedBox(
                                      height: 44,
                                      child: ListView.separated(
                                        padding:
                                            const EdgeInsets.only(left: 16),
                                        scrollDirection: Axis.horizontal,
                                        itemCount: _categories.length + 1,
                                        separatorBuilder: (_, __) =>
                                            const SizedBox(width: 2),
                                        itemBuilder: (context, index) {
                                          if (index == 0) {
                                            return _CatalogTab(
                                              label: AppStrings.t(
                                                'gallery.all',
                                                lang: lang,
                                              ),
                                              selected: _category == null,
                                              onTap: () => _setCategory(null),
                                            );
                                          }
                                          final category =
                                              _categories[index - 1];
                                          return _CatalogTab(
                                            label: category,
                                            selected: _category == category,
                                            onTap: () => _setCategory(category),
                                          );
                                        },
                                      ),
                                    ),
                            ),
                            Padding(
                              padding: const EdgeInsets.only(right: 8),
                              child: AppIconButton(
                                semanticLabel: AppStrings.t(
                                  'gallery.search',
                                  lang: lang,
                                ),
                                onPressed: () => setState(
                                  () => _searchOpen = !_searchOpen,
                                ),
                                selected: _searchOpen,
                                icon: _searchOpen ? Icons.close : Icons.search,
                              ),
                            ),
                          ],
                        ),
                        AnimatedSize(
                          duration: AppMotion.medium,
                          curve: AppMotion.curve,
                          child: _searchOpen
                              ? Padding(
                                  padding: const EdgeInsets.fromLTRB(
                                    16,
                                    0,
                                    16,
                                    8,
                                  ),
                                  child: AppTextField(
                                    controller: _searchController,
                                    autofocus: true,
                                    textInputAction: TextInputAction.search,
                                    onSubmitted: (_) => _loadInitial(),
                                    hint: AppStrings.t(
                                      'gallery.search',
                                      lang: lang,
                                    ),
                                    leading: const Icon(Icons.search),
                                    trailing: AppIconButton(
                                      onPressed: _loadInitial,
                                      semanticLabel: AppStrings.t(
                                        'gallery.search',
                                        lang: lang,
                                      ),
                                      icon: Icons.arrow_forward,
                                      filled: false,
                                      size: 36,
                                      iconSize: 18,
                                    ),
                                  ),
                                )
                              : const SizedBox(width: double.infinity),
                        ),
                      ],
                    ),
                  ),
                ),
                if (!_loading && featuredPhoto != null) ...[
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                      child: _FeaturedPhoto(
                        photo: featuredPhoto,
                        serverUrl: session?.serverUrl ?? '',
                        lang: lang,
                        onTap: () {
                          final index = _photos.indexWhere(
                            (photo) => photo.id == featuredPhoto.id,
                          );
                          context.push(
                            '/gallery/${Uri.encodeComponent(featuredPhoto.id)}',
                            extra: GalleryViewerArgs(
                              photos: _photos,
                              initialIndex: index < 0 ? 0 : index,
                            ),
                          );
                        },
                      ),
                    ),
                  ),
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
                      child: Row(
                        children: [
                          Expanded(
                            child: Text(
                              AppStrings.t('gallery.collection', lang: lang),
                              style: Theme.of(context)
                                  .textTheme
                                  .headlineSmall
                                  ?.copyWith(fontWeight: FontWeight.w700),
                            ),
                          ),
                          Icon(
                            Icons.tune_rounded,
                            size: 19,
                            color: scheme.onSurfaceVariant,
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                if (_error != null && _photos.isNotEmpty)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                      child: AppNotice(
                        message:
                            AppStrings.t('gallery.loadMoreError', lang: lang),
                        icon: Icons.sync_problem_outlined,
                        isError: true,
                        onDismiss: () => setState(() => _error = null),
                      ),
                    ),
                  ),
                if (_loading)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _GalleryLoadingState(
                      columns: cols,
                      label: AppStrings.t('gallery.loading', lang: lang),
                      category:
                          _category ?? AppStrings.t('gallery.all', lang: lang),
                    ),
                  )
                else if (_error != null && _photos.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: AppEmptyState(
                      icon: Icons.cloud_off_outlined,
                      title: AppStrings.t('gallery.errorTitle', lang: lang),
                      description:
                          AppStrings.t('gallery.errorBody', lang: lang),
                      action: AppButton(
                        onPressed: _loadInitial,
                        tone: AppButtonTone.secondary,
                        icon: Icons.refresh,
                        label: AppStrings.t('common.retry', lang: lang),
                      ),
                    ),
                  )
                else if (_photos.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: AppEmptyState(
                      icon: Icons.photo_library_outlined,
                      title: AppStrings.t('gallery.emptyTitle', lang: lang),
                      description:
                          AppStrings.t('gallery.emptyBody', lang: lang),
                    ),
                  )
                else
                  // Contact sheet — tight gutters, hairline-framed cells.
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(12, 6, 12, 0),
                    sliver: SliverGrid(
                      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: cols,
                        mainAxisSpacing: 6,
                        crossAxisSpacing: 6,
                        childAspectRatio: 0.8,
                      ),
                      delegate: SliverChildBuilderDelegate(
                        (context, index) => _ContactCell(
                          photo: collectionPhotos[index],
                          serverUrl: session?.serverUrl ?? '',
                          lang: lang,
                          onTap: () {
                            final photo = collectionPhotos[index];
                            final sourceIndex = _photos.indexWhere(
                              (item) => item.id == photo.id,
                            );
                            context.push(
                              '/gallery/${Uri.encodeComponent(photo.id)}',
                              extra: GalleryViewerArgs(
                                photos: _photos,
                                initialIndex: sourceIndex < 0 ? 0 : sourceIndex,
                              ),
                            );
                          },
                        ),
                        childCount: collectionPhotos.length,
                      ),
                    ),
                  ),
                if (_loadingMore)
                  const SliverToBoxAdapter(
                    child: Padding(
                      padding: EdgeInsets.all(20),
                      child: Center(child: AppSpinner()),
                    ),
                  ),
                const SliverToBoxAdapter(
                  child: SizedBox(height: AppChrome.bottomInset),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Loading feedback for the first gallery page. The explicit state label and
/// progress affordance make it clear that the blank cells are intentional,
/// while the skeleton preserves the final contact-sheet layout.
class _FeaturedPhoto extends StatelessWidget {
  const _FeaturedPhoto({
    required this.photo,
    required this.serverUrl,
    required this.lang,
    required this.onTap,
  });

  final PhotoDto photo;
  final String serverUrl;
  final String lang;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final source = resolveAssetUrl(
      photo.thumbnailUrl ?? photo.url,
      serverUrl: serverUrl,
    );
    final title = photo.title.isEmpty
        ? AppStrings.t('gallery.untitled', lang: lang)
        : photo.title;
    final details = <String>[
      if (photo.category.trim().isNotEmpty) photo.category.trim(),
      if (photo.takenAt != null)
        '${photo.takenAt!.toLocal().year}.${photo.takenAt!.toLocal().month.toString().padLeft(2, '0')}',
      if (photo.photoType?.trim().isNotEmpty == true) photo.photoType!.trim(),
    ];

    return AppPressable(
      onTap: onTap,
      semanticLabel: title,
      scale: 0.985,
      child: Container(
        height: 220,
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(AppRadius.medium),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Hero(
              tag: 'photo-${photo.id}',
              createRectTween: photoHeroRectTween,
              flightShuttleBuilder: photoHeroFlightShuttleBuilder,
              child: AppNetworkImage(url: source, memCacheWidth: 900),
            ),
            Positioned(
              left: 14,
              top: 14,
              child: Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 9,
                  vertical: 7,
                ),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.tertiary,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.auto_awesome,
                      size: 13,
                      color: Colors.white,
                    ),
                    const SizedBox(width: 5),
                    Text(
                      AppStrings.t('gallery.featured', lang: lang),
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: Colors.white,
                            fontSize: 9,
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                  ],
                ),
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                height: 78,
                padding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 12,
                ),
                color: Colors.black.withValues(alpha: 0.6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:
                          Theme.of(context).textTheme.headlineSmall?.copyWith(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                    ),
                    if (details.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        details.join(' / ').toUpperCase(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.labelSmall?.copyWith(
                              color: Colors.white.withValues(alpha: 0.8),
                              fontSize: 9,
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                    ],
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

class _GalleryLoadingState extends StatelessWidget {
  const _GalleryLoadingState({
    required this.columns,
    required this.label,
    required this.category,
  });

  final int columns;
  final String label;
  final String category;

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
              AppStatusChip(
                label: category,
                background: scheme.tertiaryContainer,
                foreground: scheme.onTertiaryContainer,
              ),
            ],
          ),
        ),
        Expanded(child: AppSkeletonGrid(columns: columns, aspectRatio: 0.8)),
      ],
    );
  }
}

/// Placeholder for the independent category request. Unlike the previous
/// empty 44px rail, these shapes communicate that filter controls are loading.
class _CategoryTabsSkeleton extends StatelessWidget {
  const _CategoryTabsSkeleton();

  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: 44,
      child: AppSkeletonPulse(
        child: Row(
          children: [
            SizedBox(width: 16),
            AppSkeletonBox(width: 44, height: 12, radius: 4),
            SizedBox(width: 24),
            AppSkeletonBox(width: 64, height: 12, radius: 4),
            SizedBox(width: 24),
            AppSkeletonBox(width: 52, height: 12, radius: 4),
          ],
        ),
      ),
    );
  }
}

class _CatalogTab extends StatelessWidget {
  const _CatalogTab({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final theme = Theme.of(context);
    return AppPressable(
      onTap: onTap,
      semanticLabel: label,
      scale: 1,
      dim: 0.7,
      child: Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: selected ? scheme.tertiary : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            color: selected ? scheme.onSurface : scheme.onSurfaceVariant,
            fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
            letterSpacing: 0.2,
          ),
        ),
      ),
    );
  }
}

/// Contact-sheet cell: photograph fills the 4:5 frame with a gradient
/// title overlay. A hidden badge marks non-visible photos.
class _ContactCell extends StatelessWidget {
  const _ContactCell({
    required this.photo,
    required this.serverUrl,
    required this.lang,
    required this.onTap,
  });

  final PhotoDto photo;
  final String serverUrl;
  final String lang;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final source = resolveAssetUrl(
      photo.thumbnailUrl ?? photo.url,
      serverUrl: serverUrl,
    );
    final title = photo.title.isEmpty
        ? AppStrings.t('gallery.untitled', lang: lang)
        : photo.title;

    final theme = Theme.of(context);
    return AppPressable(
      onTap: onTap,
      semanticLabel: title,
      scale: 0.96,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          color: theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(AppRadius.small),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Hero(
              tag: 'photo-${photo.id}',
              createRectTween: photoHeroRectTween,
              flightShuttleBuilder: photoHeroFlightShuttleBuilder,
              child: AppNetworkImage(url: source, memCacheWidth: 420),
            ),
            // Bottom gradient + title overlay.
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: IgnorePointer(
                child: Container(
                  padding: const EdgeInsets.fromLTRB(8, 24, 8, 7),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [
                        Colors.black.withValues(alpha: 0),
                        Colors.black.withValues(alpha: 0.55),
                      ],
                    ),
                  ),
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            ),
            // Hidden badge for non-visible photos.
            if (!photo.showFlag)
              Positioned(
                top: 6,
                right: 6,
                child: IgnorePointer(
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.45),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Icon(
                      Icons.visibility_off,
                      size: 12,
                      color: Colors.white70,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
