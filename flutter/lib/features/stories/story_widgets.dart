import 'package:flutter/material.dart';
import 'package:flutter_html/flutter_html.dart';
import 'package:flutter_markdown_plus/flutter_markdown_plus.dart';

import '../../app/ui.dart';
import '../../core/api/envelope.dart';
import '../catalog/catalog_api.dart';
import '../../core/images/app_network_image.dart';
import '../../l10n/strings.dart';

class StoryBody extends StatelessWidget {
  const StoryBody({super.key, required this.story, required this.serverUrl});

  final StoryDto story;
  final String serverUrl;

  @override
  Widget build(BuildContext context) {
    final isHtml = RegExp(r'</?[a-z][\s\S]*>', caseSensitive: false)
        .hasMatch(story.content);
    if (!isHtml) {
      return MarkdownBody(
        data: hydrateMarkdownImages(story.content, serverUrl),
        selectable: true,
      );
    }
    return Html(
      data: hydrateStoryImages(story, serverUrl: serverUrl),
    );
  }
}

class StoryCover extends StatelessWidget {
  const StoryCover({
    super.key,
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

class PublicationBadge extends StatelessWidget {
  const PublicationBadge(
      {super.key, required this.published, required this.lang});

  final bool published;
  final String lang;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color = published ? scheme.tertiary : scheme.outline;
    return AppStatusChip(
      label: AppStrings.t(
        published ? 'stories.published' : 'stories.draft',
        lang: lang,
      ),
      background: color.withValues(alpha: 0.16),
      foreground: color,
    );
  }
}

class StoryMetric extends StatelessWidget {
  const StoryMetric({super.key, required this.icon, required this.label});

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

String storyDate(DateTime? date) {
  if (date == null) return '—';
  final local = date.toLocal();
  return '${local.year}-${local.month.toString().padLeft(2, '0')}-${local.day.toString().padLeft(2, '0')}';
}

String storyDateShort(DateTime? date) {
  if (date == null) return '—';
  final local = date.toLocal();
  return '${local.month.toString().padLeft(2, '0')}.${local.day.toString().padLeft(2, '0')}';
}

String storyDateYear(DateTime? date) {
  if (date == null) return '';
  return '${date.toLocal().year}';
}

String hydrateMarkdownImages(String markdown, String serverUrl) {
  return markdown.replaceAllMapped(
    RegExp(r'(!\[[^\]]*\]\()([^\s\)]+)([^\)]*\))'),
    (match) =>
        '${match.group(1)}${resolveAssetUrl(match.group(2), serverUrl: serverUrl)}${match.group(3)}',
  );
}
