import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../app/ui.dart';
import '../../core/api/envelope.dart';
import '../../core/images/app_network_image.dart';
import '../../l10n/strings.dart';
import '../catalog/catalog_api.dart';
import 'story_widgets.dart';

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
    return AppScreen(
      topBar: AppTopBar(
        title: AppStrings.t('stories.detail', lang: lang),
        onBack: () => Navigator.of(context).maybePop(),
      ),
      body: _loading
          ? const Center(child: AppSpinner())
          : _error != null || story == null
              ? AppEmptyState(
                  icon: Icons.menu_book_outlined,
                  title: AppStrings.t('stories.detailError', lang: lang),
                  description: AppStrings.t('stories.errorBody', lang: lang),
                  action: AppButton(
                    onPressed: _load,
                    tone: AppButtonTone.secondary,
                    icon: Icons.refresh,
                    label: AppStrings.t('common.retry', lang: lang),
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

    return AppPageContainer(
      maxWidth: 860,
      padding: EdgeInsets.zero,
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 48),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Hero(
              tag: 'story-${story.id}',
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(AppRadius.xlarge),
                ),
                clipBehavior: Clip.antiAlias,
                child: StoryCover(
                  source: coverSource,
                  crop: story.coverCrop,
                  height: MediaQuery.sizeOf(context).width < 600 ? 260 : 420,
                ),
              ),
            ),
            const SizedBox(height: 24),
            Row(
              children: [
                PublicationBadge(published: story.isPublished, lang: lang),
                const SizedBox(width: 10),
                Text(
                  storyDate(story.displayDate),
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
                StoryMetric(
                  icon: Icons.schedule,
                  label:
                      '$readingMinutes ${AppStrings.t('stories.minutes', lang: lang)}',
                ),
                StoryMetric(
                  icon: Icons.photo_library_outlined,
                  label:
                      '${story.photos.length} ${AppStrings.t('stories.photos', lang: lang)}',
                ),
              ],
            ),
            const SizedBox(height: 24),
            const AppDivider(),
            const SizedBox(height: 20),
            if (story.content.trim().isEmpty)
              Text(
                AppStrings.t('stories.noContent', lang: lang),
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              )
            else
              StoryBody(story: story, serverUrl: serverUrl),
            if (story.photos.isNotEmpty) ...[
              const SizedBox(height: 32),
              AppSectionLabel(
                label: AppStrings.t('stories.archive', lang: lang),
              ),
              const SizedBox(height: 12),
              GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: story.photos.length,
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 220,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 1,
                ),
                itemBuilder: (context, index) {
                  final photo = story.photos[index];
                  final source = resolveAssetUrl(
                    photo.thumbnailUrl ?? photo.url,
                    serverUrl: serverUrl,
                  );
                  return AppPressable(
                    onTap: () => context.push(
                      '/gallery/${Uri.encodeComponent(photo.id)}',
                    ),
                    semanticLabel: photo.title,
                    scale: 0.96,
                    child: Container(
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppRadius.medium),
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: AppNetworkImage(url: source, memCacheWidth: 420),
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
