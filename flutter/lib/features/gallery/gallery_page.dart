import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gal/gal.dart';
import 'package:go_router/go_router.dart';
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/api/envelope.dart';
import '../../core/images/app_network_image.dart';
import '../../l10n/strings.dart';
import '../upload/photos_api.dart';

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
  bool _loadingMore = false;
  int _requestVersion = 0;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_handleScroll);
    _loadInitial();
  }

  void _watchTabRefresh() {
    ref.listen<String?>(tabRefreshProvider, (previous, next) {
      if (next != 'gallery') return;
      // Clear the signal without triggering another listen cycle mid-frame.
      Future.microtask(() {
        if (!mounted) return;
        if (ref.read(tabRefreshProvider) == 'gallery') {
          ref.read(tabRefreshProvider.notifier).state = null;
        }
      });
      _loadInitial();
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          0,
          duration: const Duration(milliseconds: 240),
          curve: Curves.easeOutCubic,
        );
      }
    });
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

  Future<void> _loadInitial() async {
    final version = ++_requestVersion;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      // Photos are primary; categories are best-effort so a catalog failure
      // never blanks the whole gallery.
      final page = await _api.listPhotos(
        category: _category,
        search: _searchController.text,
      );
      if (!mounted || version != _requestVersion) return;
      setState(() {
        _photos = page.items;
        _meta = page.meta;
        _loading = false;
      });
      try {
        final categories = await _api.getCategories();
        if (!mounted || version != _requestVersion) return;
        setState(() => _categories = categories);
      } catch (_) {
        // Keep existing category chips if refresh fails.
      }
    } catch (error) {
      if (!mounted || version != _requestVersion) return;
      setState(() {
        _error = '$error';
        _loading = false;
      });
    }
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
    _loadInitial();
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    _watchTabRefresh();
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionProvider);
    final scheme = Theme.of(context).colorScheme;
    final theme = Theme.of(context);
    final width = MediaQuery.sizeOf(context).width;
    final cols = width >= 1000
        ? 5
        : width >= 700
            ? 4
            : width >= 420
                ? 3
                : 2;
    final total = _meta?.total ?? _photos.length;

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: _loadInitial,
          child: CustomScrollView(
            controller: _scrollController,
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              // Masthead: oversized index number + title
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              AppStrings.t('nav.gallery', lang: lang)
                                  .toUpperCase(),
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: scheme.primary,
                                letterSpacing: 2.4,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              AppStrings.t('gallery.title', lang: lang),
                              style: theme.textTheme.headlineMedium?.copyWith(
                                fontWeight: FontWeight.w900,
                                letterSpacing: -1.1,
                                height: 1.05,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Text(
                        '$total',
                        style: theme.textTheme.displaySmall?.copyWith(
                          fontWeight: FontWeight.w200,
                          letterSpacing: -2,
                          height: 0.9,
                          color: scheme.onSurface.withValues(alpha: 0.18),
                          fontSize: 56,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              // Tool rail
              SliverToBoxAdapter(
                child: Material(
                  color: scheme.surface,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 6),
                        child: TextField(
                          controller: _searchController,
                          textInputAction: TextInputAction.search,
                          onSubmitted: (_) => _loadInitial(),
                          style: theme.textTheme.bodyMedium,
                          decoration: InputDecoration(
                            isDense: true,
                            contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 10,
                            ),
                            hintText:
                                AppStrings.t('gallery.search', lang: lang),
                            prefixIcon: const Icon(Icons.search, size: 18),
                            prefixIconConstraints: const BoxConstraints(
                              minWidth: 40,
                              minHeight: 40,
                            ),
                            suffixIcon: IconButton(
                              onPressed: _loadInitial,
                              icon: const Icon(Icons.arrow_forward, size: 18),
                            ),
                            suffixIconConstraints: const BoxConstraints(
                              minWidth: 40,
                              minHeight: 40,
                            ),
                          ),
                        ),
                      ),
                      if (_categories.isNotEmpty)
                        SizedBox(
                          height: 34,
                          child: ListView.separated(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            scrollDirection: Axis.horizontal,
                            itemCount: _categories.length + 1,
                            separatorBuilder: (_, __) =>
                                const SizedBox(width: 0),
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
                              final category = _categories[index - 1];
                              return _CatalogTab(
                                label: category,
                                selected: _category == category,
                                onTap: () => _setCategory(category),
                              );
                            },
                          ),
                        ),
                      Divider(
                        height: 1,
                        thickness: 1,
                        color: scheme.outlineVariant.withValues(alpha: 0.6),
                      ),
                    ],
                  ),
                ),
              ),
              if (_error != null && _photos.isNotEmpty)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                    child: InlineNotice(
                      message:
                          AppStrings.t('gallery.loadMoreError', lang: lang),
                      icon: Icons.sync_problem_outlined,
                      isError: true,
                      onDismiss: () => setState(() => _error = null),
                    ),
                  ),
                ),
              if (_loading)
                const SliverFillRemaining(
                  child: Center(child: CircularProgressIndicator()),
                )
              else if (_error != null && _photos.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: AppEmptyState(
                    icon: Icons.cloud_off_outlined,
                    title: AppStrings.t('gallery.errorTitle', lang: lang),
                    description: AppStrings.t('gallery.errorBody', lang: lang),
                    action: FilledButton.tonalIcon(
                      onPressed: _loadInitial,
                      icon: const Icon(Icons.refresh),
                      label: Text(AppStrings.t('common.retry', lang: lang)),
                    ),
                  ),
                )
              else if (_photos.isEmpty)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: AppEmptyState(
                    icon: Icons.photo_library_outlined,
                    title: AppStrings.t('gallery.emptyTitle', lang: lang),
                    description: AppStrings.t('gallery.emptyBody', lang: lang),
                  ),
                )
              else
                // Full-bleed contact sheet — 1px gutters, no card chrome
                SliverPadding(
                  padding: const EdgeInsets.only(top: 2),
                  sliver: SliverGrid(
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: cols,
                      mainAxisSpacing: 2,
                      crossAxisSpacing: 2,
                      childAspectRatio: 0.85,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) => _ContactCell(
                        photo: _photos[index],
                        index: index,
                        serverUrl: session?.serverUrl ?? '',
                        lang: lang,
                        onTap: () {
                          _precacheViewerPhotos(
                            context,
                            photos: _photos,
                            center: index,
                            serverUrl: session?.serverUrl ?? '',
                          );
                          context.push(
                            '/gallery/${Uri.encodeComponent(_photos[index].id)}',
                            extra: GalleryViewerArgs(
                              photos: _photos,
                              initialIndex: index,
                            ),
                          );
                        },
                      ),
                      childCount: _photos.length,
                    ),
                  ),
                ),
              if (_loadingMore)
                const SliverToBoxAdapter(
                  child: Padding(
                    padding: EdgeInsets.all(20),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                ),
              const SliverToBoxAdapter(
                child: SizedBox(height: AppChrome.bottomInset),
              ),
            ],
          ),
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
    return InkWell(
      onTap: onTap,
      child: Container(
        alignment: Alignment.center,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        decoration: BoxDecoration(
          border: Border(
            bottom: BorderSide(
              color: selected ? scheme.primary : Colors.transparent,
              width: 2,
            ),
          ),
        ),
        child: Text(
          label,
          style: Theme.of(context).textTheme.labelMedium?.copyWith(
                color: selected ? scheme.primary : scheme.onSurfaceVariant,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
              ),
        ),
      ),
    );
  }
}

/// Full-bleed contact-sheet cell — image first, index plate.
class _ContactCell extends StatelessWidget {
  const _ContactCell({
    required this.photo,
    required this.index,
    required this.serverUrl,
    required this.lang,
    required this.onTap,
  });

  final PhotoDto photo;
  final int index;
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

    return Material(
      color: Theme.of(context).colorScheme.surfaceContainerHighest,
      child: InkWell(
        onTap: onTap,
        child: Stack(
          fit: StackFit.expand,
          children: [
            Hero(
              tag: 'photo-${photo.id}',
              child: AppNetworkImage(
                url: source,
                // Thumbnail decode size — keeps memory low and cache hits high.
                memCacheWidth: 420,
              ),
            ),
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
                      Colors.black.withValues(alpha: 0.7),
                    ],
                  ),
                ),
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(6, 16, 6, 6),
                  child: Row(
                    children: [
                      Text(
                        (index + 1).toString().padLeft(2, '0'),
                        style: const TextStyle(
                          color: Colors.white70,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      _VisibilityDot(visible: photo.showFlag),
                    ],
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

class GalleryViewerArgs {
  const GalleryViewerArgs({
    required this.photos,
    required this.initialIndex,
  });

  final List<PhotoDto> photos;
  final int initialIndex;
}

class PhotoDetailPage extends ConsumerStatefulWidget {
  const PhotoDetailPage({
    super.key,
    required this.photoId,
    this.initialPhotos,
    this.initialIndex,
  });

  final String photoId;
  final List<PhotoDto>? initialPhotos;
  final int? initialIndex;

  @override
  ConsumerState<PhotoDetailPage> createState() => _PhotoDetailPageState();
}

class _PhotoDetailPageState extends ConsumerState<PhotoDetailPage> {
  late final PageController _pageController;
  late List<PhotoDto> _photos;
  late int _index;
  String? _error;
  bool _loading = true;
  bool _showMeta = false;
  bool _busyShare = false;
  bool _busyDownload = false;

  double _dragOffset = 0;
  double _dragScale = 1;

  @override
  void initState() {
    super.initState();
    final seed = widget.initialPhotos;
    if (seed != null && seed.isNotEmpty) {
      _photos = List<PhotoDto>.from(seed);
      final preferred = widget.initialIndex ?? 0;
      final byId = _photos.indexWhere((p) => p.id == widget.photoId);
      _index = byId >= 0 ? byId : preferred.clamp(0, _photos.length - 1);
      _loading = false;
    } else {
      _photos = const [];
      _index = 0;
    }
    _pageController = PageController(initialPage: _index);
    if (_photos.isEmpty) {
      _loadSingle();
    } else {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _precacheViewerPhotos(
          context,
          photos: _photos,
          center: _index,
          serverUrl: ref.read(sessionProvider)?.serverUrl ?? '',
        );
      });
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _loadSingle() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final photo = await GalleryApi(ref.read(apiClientProvider))
          .getPhoto(widget.photoId);
      if (!mounted) return;
      setState(() {
        _photos = [photo];
        _index = 0;
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

  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go('/gallery');
    }
  }

  void _onVerticalDragUpdate(DragUpdateDetails details) {
    final delta = details.primaryDelta ?? 0;
    setState(() {
      _dragOffset = (_dragOffset + delta).clamp(0.0, 420.0);
      _dragScale = (1 - (_dragOffset / 900)).clamp(0.86, 1.0);
    });
  }

  void _onVerticalDragEnd(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    if (_dragOffset > 110 || velocity > 900) {
      _close();
      return;
    }
    setState(() {
      _dragOffset = 0;
      _dragScale = 1;
    });
  }

  PhotoDto? get _current {
    if (_photos.isEmpty || _index < 0 || _index >= _photos.length) return null;
    return _photos[_index];
  }

  String _originalUrl(PhotoDto photo, String serverUrl) {
    return resolveAssetUrl(photo.url ?? photo.thumbnailUrl,
        serverUrl: serverUrl);
  }

  Future<Uint8List> _fetchBytes(String url) async {
    final response = await http.get(Uri.parse(url));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError('HTTP ${response.statusCode}');
    }
    return response.bodyBytes;
  }

  Future<void> _shareCurrent() async {
    final photo = _current;
    if (photo == null || _busyShare || _busyDownload) return;
    final lang = ref.read(languageProvider);
    final serverUrl = ref.read(sessionProvider)?.serverUrl ?? '';
    final url = _originalUrl(photo, serverUrl);
    if (url.isEmpty) {
      _toast(AppStrings.t('gallery.noOriginal', lang: lang));
      return;
    }

    setState(() => _busyShare = true);
    try {
      final bytes = await _fetchBytes(url);
      final dir = await getTemporaryDirectory();
      final ext = p.extension(Uri.parse(url).path);
      final safeExt = ext.isEmpty ? '.jpg' : ext;
      final name = photo.title.isEmpty
          ? 'mo-gallery-${photo.id}$safeExt'
          : '${photo.title}$safeExt';
      final file = File(
        p.join(
          dir.path,
          name.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_'),
        ),
      );
      await file.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles(
        [XFile(file.path)],
        text: photo.title.isEmpty
            ? AppStrings.t('gallery.untitled', lang: lang)
            : photo.title,
      );
    } catch (_) {
      if (mounted) {
        _toast(AppStrings.t('gallery.shareFailed', lang: lang));
      }
    } finally {
      if (mounted) setState(() => _busyShare = false);
    }
  }

  Future<void> _downloadCurrent() async {
    final photo = _current;
    if (photo == null || _busyShare || _busyDownload) return;
    final lang = ref.read(languageProvider);
    final serverUrl = ref.read(sessionProvider)?.serverUrl ?? '';
    final url = _originalUrl(photo, serverUrl);
    if (url.isEmpty) {
      _toast(AppStrings.t('gallery.noOriginal', lang: lang));
      return;
    }

    setState(() => _busyDownload = true);
    try {
      final hasAccess = await Gal.hasAccess(toAlbum: true);
      if (!hasAccess) {
        final granted = await Gal.requestAccess(toAlbum: true);
        if (!granted) {
          throw StateError('permission denied');
        }
      }
      final bytes = await _fetchBytes(url);
      final dir = await getTemporaryDirectory();
      final ext = p.extension(Uri.parse(url).path);
      final safeExt = ext.isEmpty ? '.jpg' : ext;
      final file = File(
        p.join(dir.path, 'mo-gallery-download-${photo.id}$safeExt'),
      );
      await file.writeAsBytes(bytes, flush: true);
      await Gal.putImage(file.path, album: 'MO Gallery');
      if (mounted) {
        _toast(AppStrings.t('gallery.downloadDone', lang: lang));
      }
    } catch (_) {
      if (mounted) {
        _toast(AppStrings.t('gallery.downloadFailed', lang: lang));
      }
    } finally {
      if (mounted) setState(() => _busyDownload = false);
    }
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Widget _chromeButton({
    required IconData icon,
    required VoidCallback? onPressed,
    bool busy = false,
  }) {
    return IconButton(
      onPressed: busy ? null : onPressed,
      style: IconButton.styleFrom(
        foregroundColor: Colors.white,
        backgroundColor: Colors.black.withValues(alpha: 0.32),
      ),
      icon: busy
          ? const SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white70,
              ),
            )
          : Icon(icon),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionProvider);
    final serverUrl = session?.serverUrl ?? '';
    final photo = _current;
    final decodeSize = _viewerDecodeSize(context);
    final dismissProgress = (_dragOffset / 280).clamp(0.0, 1.0);
    final scrim = Color.lerp(
      Colors.black,
      Colors.black.withValues(alpha: 0.35),
      dismissProgress,
    )!;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(
        backgroundColor: scrim,
        body: _loading
            ? const Center(
                child: CircularProgressIndicator(color: Colors.white70),
              )
            : _error != null || photo == null
                ? SafeArea(
                    child: AppEmptyState(
                      icon: Icons.broken_image_outlined,
                      title: AppStrings.t('gallery.detailError', lang: lang),
                      description:
                          AppStrings.t('gallery.errorBody', lang: lang),
                      action: FilledButton.tonalIcon(
                        onPressed: _loadSingle,
                        icon: const Icon(Icons.refresh),
                        label: Text(AppStrings.t('common.retry', lang: lang)),
                      ),
                    ),
                  )
                : Stack(
                    fit: StackFit.expand,
                    children: [
                      GestureDetector(
                        onVerticalDragUpdate: _onVerticalDragUpdate,
                        onVerticalDragEnd: _onVerticalDragEnd,
                        onTap: () => setState(() => _showMeta = !_showMeta),
                        child: Transform.translate(
                          offset: Offset(0, _dragOffset),
                          child: Transform.scale(
                            scale: _dragScale,
                            child: PageView.builder(
                              controller: _pageController,
                              itemCount: _photos.length,
                              allowImplicitScrolling: true,
                              onPageChanged: (value) {
                                setState(() {
                                  _index = value;
                                  _showMeta = false;
                                });
                                _precacheViewerPhotos(
                                  context,
                                  photos: _photos,
                                  center: value,
                                  serverUrl: serverUrl,
                                );
                              },
                              itemBuilder: (context, index) {
                                final item = _photos[index];
                                final thumbnail = resolveAssetUrl(
                                  item.thumbnailUrl ?? item.url,
                                  serverUrl: serverUrl,
                                );
                                final source = resolveAssetUrl(
                                  item.url ?? item.thumbnailUrl,
                                  serverUrl: serverUrl,
                                );
                                return InteractiveViewer(
                                  minScale: 1,
                                  maxScale: 4,
                                  child: Center(
                                    child: Hero(
                                      tag: 'photo-${item.id}',
                                      child: AppNetworkImage(
                                        url: source,
                                        fit: BoxFit.contain,
                                        darkPlaceholder: true,
                                        memCacheWidth: decodeSize.width,
                                        memCacheHeight: decodeSize.height,
                                        placeholderUrl: thumbnail,
                                        placeholderMemCacheWidth: 420,
                                      ),
                                    ),
                                  ),
                                );
                              },
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        top: 0,
                        left: 0,
                        right: 0,
                        child: AnimatedOpacity(
                          opacity: dismissProgress > 0.2 ? 0 : 1,
                          duration: const Duration(milliseconds: 120),
                          child: SafeArea(
                            bottom: false,
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(8, 4, 8, 0),
                              child: Row(
                                children: [
                                  _chromeButton(
                                    icon: Icons.close,
                                    onPressed: _close,
                                  ),
                                  const Spacer(),
                                  if (_photos.length > 1)
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 6,
                                      ),
                                      decoration: BoxDecoration(
                                        color: Colors.black
                                            .withValues(alpha: 0.35),
                                        borderRadius: BorderRadius.circular(99),
                                      ),
                                      child: Text(
                                        '${_index + 1} / ${_photos.length}',
                                        style: const TextStyle(
                                          color: Colors.white,
                                          fontWeight: FontWeight.w700,
                                          fontSize: 12,
                                          letterSpacing: 0.4,
                                        ),
                                      ),
                                    ),
                                  const Spacer(),
                                  _chromeButton(
                                    icon: Icons.ios_share_rounded,
                                    onPressed: _shareCurrent,
                                    busy: _busyShare,
                                  ),
                                  const SizedBox(width: 4),
                                  _chromeButton(
                                    icon: Icons.download_rounded,
                                    onPressed: _downloadCurrent,
                                    busy: _busyDownload,
                                  ),
                                  const SizedBox(width: 4),
                                  _chromeButton(
                                    icon: _showMeta
                                        ? Icons.info
                                        : Icons.info_outline,
                                    onPressed: () => setState(
                                      () => _showMeta = !_showMeta,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      AnimatedPositioned(
                        duration: const Duration(milliseconds: 240),
                        curve: Curves.easeOutCubic,
                        left: 0,
                        right: 0,
                        bottom: _showMeta && dismissProgress < 0.15 ? 0 : -420,
                        child: SafeArea(
                          top: false,
                          child: _ViewerMetaPanel(
                            photo: photo,
                            lang: lang,
                          ),
                        ),
                      ),
                    ],
                  ),
      ),
    );
  }
}

({int width, int height}) _viewerDecodeSize(BuildContext context) {
  final size = MediaQuery.sizeOf(context);
  final pixelRatio = MediaQuery.devicePixelRatioOf(context);
  return (
    width: (size.width * pixelRatio).round().clamp(720, 1600),
    height: (size.height * pixelRatio).round().clamp(960, 2400),
  );
}

void _precacheViewerPhotos(
  BuildContext context, {
  required List<PhotoDto> photos,
  required int center,
  required String serverUrl,
}) {
  if (photos.isEmpty || center < 0 || center >= photos.length) return;

  final decodeSize = _viewerDecodeSize(context);
  final fullIndexes = [center, center + 1, center - 1];
  final previewIndexes = [...fullIndexes, center + 2, center - 2];

  final fullUrls = fullIndexes
      .where((index) => index >= 0 && index < photos.length)
      .map(
        (index) => resolveAssetUrl(
          photos[index].url ?? photos[index].thumbnailUrl,
          serverUrl: serverUrl,
        ),
      )
      .toSet();
  precacheAppNetworkImages(
    context,
    fullUrls,
    memCacheWidth: decodeSize.width,
    memCacheHeight: decodeSize.height,
  );

  final previewUrls = previewIndexes
      .where((index) => index >= 0 && index < photos.length)
      .map(
        (index) => resolveAssetUrl(
          photos[index].thumbnailUrl ?? photos[index].url,
          serverUrl: serverUrl,
        ),
      )
      .toSet();
  precacheAppNetworkImages(context, previewUrls, memCacheWidth: 420);
}

class _ViewerMetaPanel extends StatelessWidget {
  const _ViewerMetaPanel({required this.photo, required this.lang});

  final PhotoDto photo;
  final String lang;

  Color? _parseColor(String value) {
    final normalized = value.replaceFirst('#', '');
    if (normalized.length != 6) return null;
    final number = int.tryParse(normalized, radix: 16);
    return number == null ? null : Color(0xFF000000 | number);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final date = photo.takenAt ?? photo.createdAt;

    // Dense EXIF strip — short values first, long labels last.
    final stats = <(String, String)>[
      if (photo.aperture?.isNotEmpty == true)
        (AppStrings.t('gallery.aperture', lang: lang), photo.aperture!),
      if (photo.shutterSpeed?.isNotEmpty == true)
        (AppStrings.t('gallery.shutter', lang: lang), photo.shutterSpeed!),
      if (photo.iso != null) ('ISO', '${photo.iso}'),
      if (photo.focalLength?.isNotEmpty == true)
        (AppStrings.t('gallery.focalLength', lang: lang), photo.focalLength!),
      if (photo.width != null && photo.height != null)
        (
          AppStrings.t('gallery.dimensions', lang: lang),
          '${photo.width}×${photo.height}',
        ),
      if (date != null)
        (AppStrings.t('gallery.date', lang: lang), _dateLabel(date)),
    ];
    final longRows = <(String, String)>[
      if (photo.cameraModel?.isNotEmpty == true)
        (AppStrings.t('gallery.camera', lang: lang), photo.cameraModel!),
      if (photo.lensModel?.isNotEmpty == true)
        (AppStrings.t('gallery.lens', lang: lang), photo.lensModel!),
    ];

    final hasAny = stats.isNotEmpty ||
        longRows.isNotEmpty ||
        photo.dominantColors.isNotEmpty;

    return Container(
      margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      decoration: BoxDecoration(
        color: scheme.surface.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(AppRadius.large),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: 0.45),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.28),
            blurRadius: 24,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 32,
                height: 3,
                decoration: BoxDecoration(
                  color: scheme.outlineVariant,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Text(
                    photo.title.isEmpty
                        ? AppStrings.t('gallery.untitled', lang: lang)
                        : photo.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.2,
                    ),
                  ),
                ),
                if (photo.category.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      photo.category,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.right,
                      style: theme.textTheme.labelSmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
                const SizedBox(width: 8),
                _StatusPill(
                  label: AppStrings.t(
                    photo.showFlag ? 'gallery.visible' : 'gallery.hidden',
                    lang: lang,
                  ),
                  color: photo.showFlag ? scheme.tertiary : scheme.outline,
                ),
              ],
            ),
            if (photo.dominantColors.isNotEmpty) ...[
              const SizedBox(height: 10),
              SizedBox(
                height: 18,
                child: Row(
                  children: [
                    for (final value in photo.dominantColors.take(8))
                      Expanded(
                        child: Container(
                          margin: const EdgeInsets.only(right: 3),
                          decoration: BoxDecoration(
                            color: _parseColor(value) ??
                                scheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
            if (!hasAny) ...[
              const SizedBox(height: 10),
              Text(
                AppStrings.t('gallery.noMetadata', lang: lang),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ],
            if (stats.isNotEmpty) ...[
              const SizedBox(height: 10),
              _DenseStatGrid(items: stats),
            ],
            if (longRows.isNotEmpty) ...[
              const SizedBox(height: 6),
              for (final row in longRows)
                Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: _DenseKeyValueRow(label: row.$1, value: row.$2),
                ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Compact multi-column EXIF tiles (3–4 per row).
class _DenseStatGrid extends StatelessWidget {
  const _DenseStatGrid({required this.items});

  final List<(String, String)> items;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final theme = Theme.of(context);
    return LayoutBuilder(
      builder: (context, constraints) {
        final cols = constraints.maxWidth >= 420
            ? 4
            : constraints.maxWidth >= 300
                ? 3
                : 2;
        const gap = 6.0;
        final tileWidth = (constraints.maxWidth - gap * (cols - 1)) / cols;
        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: items
              .map(
                (item) => SizedBox(
                  width: tileWidth,
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    decoration: BoxDecoration(
                      color: scheme.surfaceContainer,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          item.$1,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                            fontSize: 10,
                            height: 1.1,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          item.$2,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                            height: 1.15,
                            letterSpacing: -0.1,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              )
              .toList(),
        );
      },
    );
  }
}

class _DenseKeyValueRow extends StatelessWidget {
  const _DenseKeyValueRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: scheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
              fontSize: 10,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
              style: theme.textTheme.labelLarge?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VisibilityDot extends StatelessWidget {
  const _VisibilityDot({required this.visible});

  final bool visible;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 8,
      height: 8,
      decoration: BoxDecoration(
        color: visible ? scheme.tertiary : Colors.white.withValues(alpha: 0.45),
        shape: BoxShape.circle,
        border:
            Border.all(color: Colors.black.withValues(alpha: 0.25), width: 0.5),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return StatusChip(
      label: label,
      background: color.withValues(alpha: 0.16),
      foreground: color,
    );
  }
}

String _dateLabel(DateTime date) {
  final local = date.toLocal();
  return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
}
