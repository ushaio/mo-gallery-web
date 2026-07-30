import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../l10n/strings.dart';

class HomeShell extends ConsumerStatefulWidget {
  const HomeShell({super.key, required this.navigationShell});

  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends ConsumerState<HomeShell> {
  static const _branchKeys = ['upload', 'gallery', 'stories', 'settings'];

  /// Dock is visible when true; hides by sliding downward on scroll-down.
  bool _dockVisible = true;
  double _scrollAccumulator = 0;

  void _onSelect(int index) {
    final current = widget.navigationShell.currentIndex;
    if (index == current) {
      ref.read(tabRefreshProvider.notifier).state = _branchKeys[index];
      _showDock();
      return;
    }
    _showDock();
    widget.navigationShell.goBranch(
      index,
      initialLocation: false,
    );
  }

  void _showDock() {
    if (!_dockVisible) {
      setState(() {
        _dockVisible = true;
        _scrollAccumulator = 0;
      });
    }
  }

  void _hideDock() {
    if (_dockVisible) {
      setState(() {
        _dockVisible = false;
        _scrollAccumulator = 0;
      });
    }
  }

  bool _onScrollNotification(ScrollNotification notification) {
    // Only react to user-driven vertical scrolling from primary scrollables.
    if (notification.metrics.axis != Axis.vertical) return false;

    if (notification is ScrollUpdateNotification) {
      final delta = notification.scrollDelta;
      if (delta == null || delta == 0) return false;

      // Ignore overscroll bounce.
      final metrics = notification.metrics;
      if (metrics.pixels <= metrics.minScrollExtent && delta < 0) {
        _showDock();
        return false;
      }
      if (metrics.pixels >= metrics.maxScrollExtent && delta > 0) {
        return false;
      }

      // delta > 0: finger up / content down → hide
      // delta < 0: finger down / content up → show
      _scrollAccumulator += delta;
      if (_scrollAccumulator > 12) {
        _hideDock();
      } else if (_scrollAccumulator < -8) {
        _showDock();
      }
    } else if (notification is UserScrollNotification) {
      if (notification.direction == ScrollDirection.idle &&
          notification.metrics.pixels <=
              notification.metrics.minScrollExtent + 4) {
        _showDock();
      }
    }
    return false;
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final index = widget.navigationShell.currentIndex;
    final scheme = Theme.of(context).colorScheme;

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
          return Scaffold(
            body: Row(
              children: [
                SafeArea(
                  child: NavigationRail(
                    selectedIndex: index,
                    onDestinationSelected: _onSelect,
                    labelType: NavigationRailLabelType.all,
                    groupAlignment: -0.72,
                    minWidth: 88,
                    leading: const Padding(
                      padding: EdgeInsets.only(
                        top: AppSpacing.md,
                        bottom: AppSpacing.xl,
                      ),
                      child: BrandMark(size: 48),
                    ),
                    destinations: destinations
                        .map(
                          (item) => NavigationRailDestination(
                            icon: Icon(item.$1),
                            selectedIcon: Icon(item.$2),
                            label: Text(item.$3),
                          ),
                        )
                        .toList(),
                  ),
                ),
                VerticalDivider(
                  width: 1,
                  color: scheme.outlineVariant.withValues(alpha: 0.7),
                ),
                Expanded(child: widget.navigationShell),
              ],
            ),
          );
        }

        final bottomPad = MediaQuery.paddingOf(context).bottom;

        return Scaffold(
          body: NotificationListener<ScrollNotification>(
            onNotification: _onScrollNotification,
            child: Stack(
              children: [
                Positioned.fill(child: widget.navigationShell),
                Positioned(
                  left: AppChrome.dockMargin,
                  right: AppChrome.dockMargin,
                  bottom: AppChrome.dockMargin + bottomPad,
                  child: AnimatedSlide(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    offset: _dockVisible ? Offset.zero : const Offset(0, 1.6),
                    child: AnimatedOpacity(
                      duration: const Duration(milliseconds: 180),
                      opacity: _dockVisible ? 1 : 0,
                      child: IgnorePointer(
                        ignoring: !_dockVisible,
                        child: _FloatingDock(
                          index: index,
                          destinations: destinations,
                          onSelected: _onSelect,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _FloatingDock extends StatelessWidget {
  const _FloatingDock({
    required this.index,
    required this.destinations,
    required this.onSelected,
  });

  final int index;
  final List<(IconData, IconData, String)> destinations;
  final ValueChanged<int> onSelected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;

    return DecoratedBox(
      decoration: BoxDecoration(
        color:
            scheme.surfaceContainerLow.withValues(alpha: isDark ? 0.94 : 0.97),
        borderRadius: BorderRadius.circular(AppRadius.xlarge),
        border: Border.all(
          color: scheme.outlineVariant.withValues(alpha: isDark ? 0.5 : 0.75),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.4 : 0.08),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadius.xlarge),
        child: Material(
          color: Colors.transparent,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
            child: Row(
              children: List.generate(destinations.length, (i) {
                final item = destinations[i];
                final selected = i == index;
                return Expanded(
                  child: _DockItem(
                    selected: selected,
                    icon: selected ? item.$2 : item.$1,
                    label: item.$3,
                    onTap: () => onSelected(i),
                  ),
                );
              }),
            ),
          ),
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
    final theme = Theme.of(context);

    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadius.large),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          margin: const EdgeInsets.symmetric(horizontal: 2),
          padding: const EdgeInsets.symmetric(vertical: 6),
          decoration: BoxDecoration(
            color: selected
                ? scheme.primaryContainer.withValues(alpha: 0.9)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(AppRadius.large),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                icon,
                size: 20,
                color: selected ? scheme.primary : scheme.onSurfaceVariant,
              ),
              const SizedBox(height: 2),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: selected ? scheme.primary : scheme.onSurfaceVariant,
                  fontWeight: selected ? FontWeight.w800 : FontWeight.w500,
                  fontSize: 10,
                  height: 1.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
