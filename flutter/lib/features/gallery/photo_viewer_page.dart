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
import '../../app/ui.dart';
import '../../core/api/envelope.dart';
import '../../core/images/app_network_image.dart';
import '../../l10n/strings.dart';
import '../upload/photos_api.dart';

class GalleryViewerArgs {
  const GalleryViewerArgs({
    required this.photos,
    required this.initialIndex,
  });

  final List<PhotoDto> photos;
  final int initialIndex;
}

/// Hero flight shuttle for photo open/close transitions.
///
/// During push (open) the destination widget is used; during pop (close)
/// the source widget is used. Both resolve to the viewer's [BoxFit.contain]
/// image, so the full photograph stays visible throughout the flight — no
/// cover↔contain jump at either end of the animation.
///
/// Note: `fromHeroContext.widget` / `toHeroContext.widget` return the
/// [Hero] widget itself — we must extract `.child` to get the underlying
/// [AppNetworkImage]; otherwise a nested Hero renders in the overlay and
/// distorts the image.
Widget photoHeroFlightShuttleBuilder(
  BuildContext flightContext,
  Animation<double> animation,
  HeroFlightDirection flightDirection,
  BuildContext fromHeroContext,
  BuildContext toHeroContext,
) {
  final hero = flightDirection == HeroFlightDirection.push
      ? toHeroContext.widget as Hero
      : fromHeroContext.widget as Hero;
  return Material(type: MaterialType.transparency, child: hero.child);
}

/// Linear rect tween so the Hero flies in a straight line (cell ↔ centre)
/// instead of the default arc path.
RectTween photoHeroRectTween(Rect? begin, Rect? end) =>
    RectTween(begin: begin, end: end);

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

class _PhotoDetailPageState extends ConsumerState<PhotoDetailPage>
    with SingleTickerProviderStateMixin {
  late final PageController _pageController;
  late final TransformationController _zoomController;
  late final AnimationController _snapController;
  Animation<double>? _snapAnimation;

  late List<PhotoDto> _photos;
  late int _index;
  String? _error;
  bool _loading = true;
  bool _showMeta = false;
  bool _busyShare = false;
  bool _busyDownload = false;

  double _dragOffset = 0;
  double _dragScale = 1;
  bool _zoomed = false;
  Offset? _doubleTapFocal;

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
    _zoomController = TransformationController();
    _snapController = AnimationController(
      vsync: this,
      duration: AppMotion.medium,
    );
    if (_photos.isEmpty) {
      _loadSingle();
    } else {
      // Delay pre-caching adjacent photos until after the Hero open
      // animation finishes. Building/pre-caching during the transition
      // can cause frame drops and interfere with the flight.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        Future.delayed(const Duration(milliseconds: 300), () {
          if (!mounted) return;
          _precacheViewerPhotos(
            context,
            photos: _photos,
            center: _index,
            serverUrl: ref.read(sessionProvider)?.serverUrl ?? '',
          );
        });
      });
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    _zoomController.dispose();
    _snapController.dispose();
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

  // --- Zoom handling -------------------------------------------------------

  void _trackZoom() {
    final scale = _zoomController.value.getMaxScaleOnAxis();
    final zoomed = scale > 1.02;
    if (zoomed != _zoomed && mounted) {
      setState(() => _zoomed = zoomed);
    }
  }

  void _onDoubleTap() {
    final focal = _doubleTapFocal;
    setState(() {
      if (_zoomed) {
        _zoomController.value = Matrix4.identity();
        _zoomed = false;
      } else {
        const target = 2.6;
        final origin = focal ??
            Offset(
              MediaQuery.sizeOf(context).width / 2,
              MediaQuery.sizeOf(context).height / 2,
            );
        _zoomController.value = Matrix4.identity()
          ..setEntry(0, 0, target)
          ..setEntry(1, 1, target)
          ..setEntry(0, 3, origin.dx * (1 - target))
          ..setEntry(1, 3, origin.dy * (1 - target));
        _zoomed = true;
      }
    });
  }

  // --- Drag-to-dismiss (only when not zoomed) -------------------------------

  void _onVerticalDragUpdate(DragUpdateDetails details) {
    final delta = details.primaryDelta ?? 0;
    _snapController.stop();
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
    // Spring back instead of jumping.
    _snapAnimation = Tween<double>(begin: _dragOffset, end: 0).animate(
      CurvedAnimation(parent: _snapController, curve: AppMotion.curve),
    )..addListener(() {
        if (!mounted) return;
        setState(() {
          _dragOffset = _snapAnimation!.value;
          _dragScale = (1 - (_dragOffset / 900)).clamp(0.86, 1.0);
        });
      });
    _snapController.forward(from: 0);
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
      showAppToast(context, AppStrings.t('gallery.noOriginal', lang: lang));
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
        showAppToast(context, AppStrings.t('gallery.shareFailed', lang: lang));
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
      showAppToast(context, AppStrings.t('gallery.noOriginal', lang: lang));
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
        showAppToast(
          context,
          AppStrings.t('gallery.downloadDone', lang: lang),
        );
      }
    } catch (_) {
      if (mounted) {
        showAppToast(
          context,
          AppStrings.t('gallery.downloadFailed', lang: lang),
        );
      }
    } finally {
      if (mounted) setState(() => _busyDownload = false);
    }
  }

  Widget _chromeButton({
    required IconData icon,
    required VoidCallback? onPressed,
    bool busy = false,
    String? semanticLabel,
  }) {
    if (busy) {
      return Container(
        width: 42,
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.32),
          shape: BoxShape.circle,
        ),
        child: const AppSpinner(size: 18, color: Colors.white70),
      );
    }
    return AppPressable(
      onTap: onPressed,
      semanticLabel: semanticLabel,
      scale: 0.9,
      dim: 0.8,
      child: Container(
        width: 42,
        height: 42,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.32),
          shape: BoxShape.circle,
        ),
        child: Icon(icon, size: 20, color: Colors.white),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionProvider);
    final serverUrl = session?.serverUrl ?? '';
    final photo = _current;
    final decodeSize = _viewerDecodeSize(context);
    final routeAnim = ModalRoute.of(context)?.animation;
    final dismissProgress = (_dragOffset / 280).clamp(0.0, 1.0);
    final scrim = Color.lerp(
      Colors.black,
      Colors.black.withValues(alpha: 0.35),
      dismissProgress,
    )!;

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: AppScreen(
        backgroundColor: scrim,
        body: _loading
            ? const Center(child: AppSpinner(color: Colors.white70))
            : _error != null || photo == null
                ? SafeArea(
                    child: AppEmptyState(
                      icon: Icons.broken_image_outlined,
                      title: AppStrings.t('gallery.detailError', lang: lang),
                      description:
                          AppStrings.t('gallery.errorBody', lang: lang),
                      action: AppButton(
                        onPressed: _loadSingle,
                        tone: AppButtonTone.secondary,
                        icon: Icons.refresh,
                        label: AppStrings.t('common.retry', lang: lang),
                      ),
                    ),
                  )
                : Stack(
                    fit: StackFit.expand,
                    children: [
                      GestureDetector(
                        // Drag-to-dismiss only competes when the photo is not
                        // zoomed; while zoomed, pan belongs to the viewer.
                        onVerticalDragUpdate:
                            _zoomed ? null : _onVerticalDragUpdate,
                        onVerticalDragEnd: _zoomed ? null : _onVerticalDragEnd,
                        onTap: () => setState(() => _showMeta = !_showMeta),
                        onDoubleTapDown: (details) =>
                            _doubleTapFocal = details.localPosition,
                        onDoubleTap: _onDoubleTap,
                        child: Transform.translate(
                          offset: Offset(0, _dragOffset),
                          child: Transform.scale(
                            scale: _dragScale,
                            child: PageView.builder(
                              // Horizontal paging pauses while zoomed so pans
                              // move the photo instead of the page.
                              physics: _zoomed
                                  ? const NeverScrollableScrollPhysics()
                                  : const BouncingScrollPhysics(),
                              controller: _pageController,
                              itemCount: _photos.length,
                              onPageChanged: (value) {
                                _zoomController.value = Matrix4.identity();
                                setState(() {
                                  _index = value;
                                  _zoomed = false;
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
                                  transformationController: _zoomController,
                                  minScale: 1,
                                  maxScale: 4,
                                  panEnabled: _zoomed,
                                  onInteractionUpdate: (_) => _trackZoom(),
                                  onInteractionEnd: (_) => _trackZoom(),
                                  child: Hero(
                                    tag: 'photo-${item.id}',
                                    createRectTween: photoHeroRectTween,
                                    flightShuttleBuilder:
                                        photoHeroFlightShuttleBuilder,
                                    child: SizedBox.expand(
                                      child: AppNetworkImage(
                                        url: source,
                                        fit: BoxFit.contain,
                                        darkPlaceholder: true,
                                        memCacheWidth: decodeSize.width,
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
                        child: AnimatedBuilder(
                          animation: routeAnim ??
                              const AlwaysStoppedAnimation<double>(1.0),
                          builder: (context, chrome) {
                            final routeComplete =
                                routeAnim == null || routeAnim.value >= 1.0;
                            return AnimatedOpacity(
                              opacity:
                                  routeComplete && dismissProgress <= 0.2
                                      ? 1
                                      : 0,
                              duration: AppMotion.fast,
                              child: chrome,
                            );
                          },
                          child: SafeArea(
                            bottom: false,
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(10, 6, 10, 0),
                              child: Row(
                                children: [
                                  _chromeButton(
                                    icon: Icons.close,
                                    onPressed: _close,
                                    semanticLabel: 'close',
                                  ),
                                  const Spacer(),
                                  if (_photos.length > 1)
                                    Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 10,
                                        vertical: 5,
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
                                    semanticLabel: AppStrings.t(
                                      'gallery.share',
                                      lang: lang,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  _chromeButton(
                                    icon: Icons.download_rounded,
                                    onPressed: _downloadCurrent,
                                    busy: _busyDownload,
                                    semanticLabel: AppStrings.t(
                                      'gallery.download',
                                      lang: lang,
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  _chromeButton(
                                    icon: _showMeta
                                        ? Icons.info
                                        : Icons.info_outline,
                                    onPressed: () => setState(
                                      () => _showMeta = !_showMeta,
                                    ),
                                    semanticLabel: AppStrings.t(
                                      'gallery.detail',
                                      lang: lang,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                      ),
                      AnimatedPositioned(
                        duration: AppMotion.medium,
                        curve: AppMotion.curve,
                        left: 0,
                        right: 0,
                        bottom: _showMeta && dismissProgress < 0.15 ? 0 : -420,
                        child: SafeArea(
                          top: false,
                          child: _ViewerMetaPanel(photo: photo, lang: lang),
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
    final isDark = scheme.brightness == Brightness.dark;
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
        color: scheme.surface.withValues(alpha: 0.97),
        borderRadius: BorderRadius.circular(AppRadius.xlarge),
        boxShadow: AppElevation.overlay(scheme.shadow, dark: isDark),
      ),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
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
            const SizedBox(height: 12),
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
                      fontWeight: FontWeight.w700,
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
                AppStatusChip(
                  label: AppStrings.t(
                    photo.showFlag ? 'gallery.visible' : 'gallery.hidden',
                    lang: lang,
                  ),
                  background:
                      (photo.showFlag ? scheme.tertiary : scheme.outline)
                          .withValues(alpha: 0.16),
                  foreground: photo.showFlag ? scheme.tertiary : scheme.outline,
                ),
              ],
            ),
            if (photo.dominantColors.isNotEmpty) ...[
              const SizedBox(height: 12),
              SizedBox(
                height: 16,
                child: Row(
                  children: [
                    for (final value in photo.dominantColors.take(8))
                      Expanded(
                        child: Container(
                          margin: const EdgeInsets.only(right: 3),
                          decoration: BoxDecoration(
                            color: _parseColor(value) ??
                                scheme.surfaceContainerHighest,
                            borderRadius: BorderRadius.circular(3),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ],
            if (!hasAny) ...[
              const SizedBox(height: 12),
              Text(
                AppStrings.t('gallery.noMetadata', lang: lang),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ],
            if (stats.isNotEmpty) ...[
              const SizedBox(height: 12),
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
                      borderRadius: BorderRadius.circular(AppRadius.small),
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
        borderRadius: BorderRadius.circular(AppRadius.small),
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

String _dateLabel(DateTime date) {
  final local = date.toLocal();
  return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
}
