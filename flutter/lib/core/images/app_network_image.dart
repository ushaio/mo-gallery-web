import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../app/ui.dart';

/// Shared network image with disk + memory cache.
///
/// [memCacheWidth] / [memCacheHeight] limit decoded bitmap size so gallery
/// thumbnails stay cheap and survive tab switches / Hero flights.
class AppNetworkImage extends StatelessWidget {
  const AppNetworkImage({
    super.key,
    required this.url,
    this.fit = BoxFit.cover,
    this.alignment = Alignment.center,
    this.width,
    this.height,
    this.memCacheWidth,
    this.memCacheHeight,
    this.placeholderUrl,
    this.placeholderMemCacheWidth,
    this.darkPlaceholder = false,
    this.borderRadius,
  });

  final String url;
  final BoxFit fit;
  final Alignment alignment;
  final double? width;
  final double? height;
  final int? memCacheWidth;
  final int? memCacheHeight;
  final String? placeholderUrl;
  final int? placeholderMemCacheWidth;
  final bool darkPlaceholder;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) {
    final placeholderColor = darkPlaceholder
        ? Colors.black
        : Theme.of(context).colorScheme.surfaceContainerHighest;
    final iconColor = darkPlaceholder ? Colors.white38 : null;
    final progressColor = darkPlaceholder ? Colors.white70 : null;

    Widget loadingPlaceholder() {
      final previewUrl = placeholderUrl;
      if (previewUrl != null && previewUrl.isNotEmpty) {
        return CachedNetworkImage(
          imageUrl: previewUrl,
          fit: fit,
          alignment: alignment,
          width: width,
          height: height,
          memCacheWidth: placeholderMemCacheWidth,
          fadeInDuration: Duration.zero,
          errorWidget: (context, _, __) => ColoredBox(
            color: placeholderColor,
            child: Center(
              child: Icon(Icons.broken_image_outlined, color: iconColor),
            ),
          ),
        );
      }

      return ColoredBox(
        color: placeholderColor,
        child: Center(
          child: AppSpinner(
            size: 18,
            stroke: 2,
            color: progressColor,
          ),
        ),
      );
    }

    if (url.isEmpty) {
      return ColoredBox(
        color: placeholderColor,
        child: Center(
          child: Icon(Icons.broken_image_outlined, color: iconColor),
        ),
      );
    }

    final dpr = MediaQuery.devicePixelRatioOf(context);
    final resolvedMemWidth = memCacheWidth ??
        (width != null && width!.isFinite ? (width! * dpr).round() : null);
    final resolvedMemHeight = memCacheHeight ??
        (height != null && height!.isFinite ? (height! * dpr).round() : null);

    Widget image = CachedNetworkImage(
      imageUrl: url,
      fit: fit,
      alignment: alignment,
      width: width,
      height: height,
      fadeInDuration: const Duration(milliseconds: 120),
      fadeOutDuration: const Duration(milliseconds: 80),
      memCacheWidth: resolvedMemWidth,
      memCacheHeight: resolvedMemHeight,
      placeholder: (context, _) => loadingPlaceholder(),
      errorWidget: (context, _, __) => ColoredBox(
        color: placeholderColor,
        child: Center(
          child: Icon(Icons.broken_image_outlined, color: iconColor),
        ),
      ),
    );

    if (borderRadius != null) {
      image = ClipRRect(borderRadius: borderRadius!, child: image);
    }
    return image;
  }
}

/// Pre-warm a few nearby full-size images for the photo viewer.
void precacheAppNetworkImages(
  BuildContext context,
  Iterable<String> urls, {
  int? memCacheWidth,
  int? memCacheHeight,
}) {
  for (final url in urls) {
    if (url.isEmpty) continue;
    precacheImage(
      CachedNetworkImageProvider(
        url,
        maxWidth: memCacheWidth,
        maxHeight: memCacheHeight,
      ),
      context,
    );
  }
}
