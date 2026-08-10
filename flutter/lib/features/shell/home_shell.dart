import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../app/ui.dart';
import '../../l10n/strings.dart';
import '../upload/upload_flow.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell>
    with SingleTickerProviderStateMixin {
  static const _branchKeys = ['upload', 'gallery', 'stories', 'settings'];

  bool _picking = false;
  double _pageSlideDirection = 1;
  late final AnimationController _pageTransitionController =
      AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 280),
    value: 1,
  );

  @override
  void dispose() {
    _pageTransitionController.dispose();
    super.dispose();
  }

  void _onSelect(int index) {
    final current = widget.navigationShell.currentIndex;
    if (index == current) {
      // Re-tap on the active tab: scroll to top + refresh (handled by pages).
      ref.read(tabRefreshProvider.notifier).state = _branchKeys[index];
      return;
    }
    HapticFeedback.selectionClick();
    _pageSlideDirection = index > current ? 1 : -1;
    widget.navigationShell.goBranch(index, initialLocation: false);
    if (MediaQuery.disableAnimationsOf(context)) {
      _pageTransitionController.value = 1;
    } else {
      _pageTransitionController.forward(from: 0);
    }
  }

  /// Center dock action: goes straight to the system photo picker and, once
  /// photos are chosen, into the upload preview flow. The current tab is left
  /// alone — no detour through the upload queue.
  Future<void> _onAddPhoto() async {
    if (_picking) return;
    HapticFeedback.selectionClick();
    _picking = true;
    try {
      await startUploadFlow(context: context, ref: ref);
    } finally {
      if (mounted) _picking = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final index = widget.navigationShell.currentIndex;

    final destinations = [
      (
        Icons.cloud_upload_outlined,
        Icons.cloud_upload,
        AppStrings.t('nav.upload', lang: lang),
      ),
      (
        Icons.photo_library_outlined,
        Icons.photo_library,
        AppStrings.t('nav.gallery', lang: lang),
      ),
      (
        Icons.auto_stories_outlined,
        Icons.auto_stories,
        AppStrings.t('nav.stories', lang: lang),
      ),
      (
        Icons.settings_outlined,
        Icons.settings,
        AppStrings.t('nav.settings', lang: lang),
      ),
    ];

    return LayoutBuilder(
      builder: (context, constraints) {
        if (constraints.maxWidth >= 840) {
          return AppScreen(
            topBar: const SizedBox.shrink(),
            body: Row(
              children: [
                SafeArea(
                  child: _SideRail(
                    index: index,
                    destinations: destinations,
                    onSelect: _onSelect,
                  ),
                ),
                Expanded(child: _buildAnimatedPage()),
              ],
            ),
          );
        }

        final bottomPad = MediaQuery.viewPaddingOf(context).bottom;
        final dockWidth = (constraints.maxWidth - 32).clamp(0.0, 358.0);
        final dockBottom = AppChrome.dockMargin + bottomPad;

        return AppScreen(
          topBar: const SizedBox.shrink(),
          body: Stack(
            children: [
              Positioned.fill(child: _buildAnimatedPage()),
              Positioned(
                left: 0,
                right: 0,
                bottom: dockBottom,
                child: Center(
                  child: SizedBox(
                    width: dockWidth,
                    child: _FloatingDock(
                      index: index,
                      destinations: destinations,
                      onSelected: _onSelect,
                      onAddPhoto: _onAddPhoto,
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  /// Animates only the branch content; the bottom dock / side rail remains
  /// anchored. Forward navigation enters from the right, backward navigation
  /// from the left. The underlying indexed shell remains mounted throughout,
  /// preserving every branch's navigator, scroll position and form state.
  Widget _buildAnimatedPage() {
    final curved = CurvedAnimation(
      parent: _pageTransitionController,
      curve: AppMotion.curve,
    );
    return ClipRect(
      child: AnimatedBuilder(
        animation: curved,
        child: widget.navigationShell,
        builder: (context, child) {
          final progress = curved.value;
          return Opacity(
            opacity: 0.88 + progress * 0.12,
            child: FractionalTranslation(
              translation: Offset(
                _pageSlideDirection * 0.075 * (1 - progress),
                0,
              ),
              child: child,
            ),
          );
        },
      ),
    );
  }
}

/// Wide-screen navigation rail — flat panel with a sliding selection rule.
class _SideRail extends StatelessWidget {
  const _SideRail({
    required this.index,
    required this.destinations,
    required this.onSelect,
  });

  final int index;
  final List<(IconData, IconData, String)> destinations;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 232,
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        border: Border(right: BorderSide(color: scheme.outlineVariant)),
      ),
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const AppBrandMark(size: 40),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'MO GALLERY',
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1.2,
                          ),
                    ),
                    Text(
                      'ARCHIVE',
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.tertiary,
                            letterSpacing: 2.2,
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xl),
          Expanded(
            child: ListView.separated(
              itemCount: destinations.length,
              separatorBuilder: (_, __) => const SizedBox(height: 2),
              itemBuilder: (context, i) {
                final item = destinations[i];
                final selected = i == index;
                return _RailItem(
                  selected: selected,
                  icon: selected ? item.$2 : item.$1,
                  label: item.$3,
                  onTap: () => onSelect(i),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _RailItem extends StatelessWidget {
  const _RailItem({
    required this.selected,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AppPressable(
      onTap: onTap,
      semanticLabel: label,
      scale: 0.99,
      dim: 0.85,
      child: AnimatedContainer(
        duration: AppMotion.medium,
        curve: AppMotion.curve,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
        decoration: BoxDecoration(
          color: selected ? scheme.primaryContainer : Colors.transparent,
          borderRadius: BorderRadius.circular(AppRadius.medium),
        ),
        child: Row(
          children: [
            // Selection rule — a short vermilion stamp mark, not a pill.
            AnimatedContainer(
              duration: AppMotion.medium,
              width: 3,
              height: selected ? 18 : 0,
              margin: EdgeInsets.only(right: selected ? 9 : 0),
              decoration: BoxDecoration(
                color: scheme.tertiary,
                borderRadius: BorderRadius.circular(AppRadius.pill),
              ),
            ),
            Icon(
              icon,
              size: 20,
              color: selected ? scheme.onSurface : scheme.onSurfaceVariant,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                label,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color:
                          selected ? scheme.onSurface : scheme.onSurfaceVariant,
                      fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Mobile dock: one floating rounded capsule of lifted paper holding four
/// navigation targets and a centered archive action. The lift comes from a
/// soft shadow rather than a notched silhouette, so nothing overhangs the bar
/// and the whole row shares a single baseline.
class _FloatingDock extends StatelessWidget {
  const _FloatingDock({
    required this.index,
    required this.destinations,
    required this.onSelected,
    required this.onAddPhoto,
  });

  final int index;
  final List<(IconData, IconData, String)> destinations;
  final ValueChanged<int> onSelected;
  final VoidCallback onAddPhoto;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;

    Widget item(int itemIndex) {
      final destination = destinations[itemIndex];
      final selected = itemIndex == index;
      return Expanded(
        child: _DockItem(
          selected: selected,
          icon: selected ? destination.$2 : destination.$1,
          label: destination.$3,
          onTap: () => onSelected(itemIndex),
        ),
      );
    }

    return Container(
      height: AppChrome.dockHeight,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        borderRadius: BorderRadius.circular(AppChrome.dockRadius),
        border: Border.all(color: scheme.outlineVariant),
        boxShadow: AppElevation.dock(scheme.shadow, dark: isDark),
      ),
      child: Row(
        children: [
          item(0),
          item(1),
          const SizedBox(width: 2),
          _DockAddButton(onPressed: onAddPhoto),
          const SizedBox(width: 2),
          item(2),
          item(3),
        ],
      ),
    );
  }
}

class _DockAddButton extends StatelessWidget {
  const _DockAddButton({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AppPressable(
      onTap: onPressed,
      semanticLabel: '添加照片',
      scale: 0.92,
      child: Container(
        width: AppChrome.dockActionSize,
        height: AppChrome.dockActionSize,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: scheme.tertiary,
          boxShadow: AppElevation.accent(scheme.tertiary),
        ),
        child: Icon(
          Icons.add,
          size: 22,
          color: scheme.onTertiary,
        ),
      ),
    );
  }
}

class _DockItem extends StatelessWidget {
  const _DockItem({
    required this.selected,
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final bool selected;
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;

    return AppPressable(
      onTap: onTap,
      semanticLabel: label,
      scale: 0.94,
      dim: 0.85,
      child: SizedBox(
        height: AppChrome.dockItemHeight,
        // Active state is carried entirely by icon/label color and weight —
        // no background fill, so the dock stays a single quiet surface.
        child: Column(
          mainAxisSize: MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              icon,
              size: 20,
              color: selected ? scheme.tertiary : scheme.onSurfaceVariant,
            ),
            const SizedBox(height: 4),
            AnimatedDefaultTextStyle(
              duration: AppMotion.medium,
              style: TextStyle(
                fontSize: 10,
                fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
                letterSpacing: 0,
                height: 1.1,
                color: selected ? scheme.tertiary : scheme.onSurfaceVariant,
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 2),
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
