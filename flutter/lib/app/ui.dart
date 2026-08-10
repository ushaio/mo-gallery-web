import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'theme.dart';

/// MO Gallery custom widget kit.
///
/// Every interactive surface in the app is built from these primitives.
/// None of them render Material ripples, default shadows, default radii or
/// default transitions — feedback is expressed through press scale, dimming
/// and motion tokens from `theme.dart`.

// ---------------------------------------------------------------------------
// Tactile primitives
// ---------------------------------------------------------------------------

/// Unified press target: scale-down + dim on touch, optional haptic tick,
/// pointer cursor and semantics. Replaces GestureDetector/InkWell pairs.
class AppPressable extends StatefulWidget {
  const AppPressable({
    super.key,
    required this.child,
    this.onTap,
    this.onLongPress,
    this.semanticLabel,
    this.enabled = true,
    this.haptic = false,
    this.scale = 0.97,
    this.dim = 0.82,
    this.behavior = HitTestBehavior.opaque,
  });

  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final String? semanticLabel;
  final bool enabled;
  final bool haptic;
  final double scale;
  final double dim;
  final HitTestBehavior behavior;

  @override
  State<AppPressable> createState() => _AppPressableState();
}

class _AppPressableState extends State<AppPressable> {
  bool _pressed = false;

  bool get _active =>
      widget.enabled && (widget.onTap != null || widget.onLongPress != null);

  void _setPressed(bool value) {
    if (_pressed != value && mounted) setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final child = AnimatedScale(
      scale: _pressed && _active ? widget.scale : 1,
      duration: AppMotion.fast,
      curve: AppMotion.curve,
      child: AnimatedOpacity(
        opacity: !_active
            ? 0.45
            : _pressed
                ? widget.dim
                : 1,
        duration: AppMotion.fast,
        child: widget.child,
      ),
    );

    return Semantics(
      button: _active,
      enabled: _active,
      label: widget.semanticLabel,
      child: MouseRegion(
        cursor: _active ? SystemMouseCursors.click : MouseCursor.defer,
        child: GestureDetector(
          behavior: widget.behavior,
          onTapDown: _active ? (_) => _setPressed(true) : null,
          onTapCancel: _active ? () => _setPressed(false) : null,
          onTapUp: _active
              ? (_) {
                  _setPressed(false);
                  if (widget.haptic) HapticFeedback.selectionClick();
                  widget.onTap?.call();
                }
              : null,
          onLongPress: _active
              ? () {
                  if (widget.haptic) HapticFeedback.mediumImpact();
                  widget.onLongPress?.call();
                }
              : null,
          child: child,
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Screen scaffolding
// ---------------------------------------------------------------------------

/// Flat page scaffold: colored body, optional top / bottom bars.
class AppScreen extends StatelessWidget {
  const AppScreen({
    super.key,
    required this.body,
    this.topBar,
    this.bottomBar,
    this.backgroundColor,
  });

  final Widget body;
  final Widget? topBar;
  final Widget? bottomBar;
  final Color? backgroundColor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return ColoredBox(
      color: backgroundColor ?? scheme.surface,
      child: Column(
        children: [
          if (topBar != null) topBar!,
          Expanded(child: body),
          if (bottomBar != null) bottomBar!,
        ],
      ),
    );
  }
}

/// Page top bar: hairline-separated, custom back affordance, no AppBar.
class AppTopBar extends StatelessWidget {
  const AppTopBar({
    super.key,
    required this.title,
    this.onBack,
    this.trailing,
    this.showDivider = true,
  });

  final String title;
  final VoidCallback? onBack;
  final Widget? trailing;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return SafeArea(
      bottom: false,
      child: Container(
        height: 56,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm),
        decoration: BoxDecoration(
          color: scheme.surface,
          border: showDivider
              ? Border(bottom: BorderSide(color: scheme.outlineVariant))
              : null,
        ),
        child: Row(
          children: [
            if (onBack != null) ...[
              AppIconButton(
                icon: Icons.arrow_back,
                onPressed: onBack,
                semanticLabel: 'back',
              ),
              const SizedBox(width: AppSpacing.xs),
            ] else
              const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            if (trailing != null) trailing!,
          ],
        ),
      ),
    );
  }
}

/// Centers content and caps its width on large screens.
class AppPageContainer extends StatelessWidget {
  const AppPageContainer({
    super.key,
    required this.child,
    this.padding,
    this.maxWidth = 920,
    this.includeBottomDock = true,
  });

  final Widget child;
  final EdgeInsetsGeometry? padding;
  final double maxWidth;
  final bool includeBottomDock;

  @override
  Widget build(BuildContext context) {
    final width = MediaQuery.sizeOf(context).width;
    final horizontal = width < 380
        ? AppSpacing.md
        : width >= 840
            ? AppSpacing.xxl
            : AppSpacing.lg;
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: Padding(
          padding: padding ??
              EdgeInsets.fromLTRB(
                horizontal,
                AppSpacing.md,
                horizontal,
                includeBottomDock ? AppChrome.bottomInset : AppSpacing.xl,
              ),
          child: child,
        ),
      ),
    );
  }
}

/// Editorial page header: small-caps eyebrow, display title, quiet subtitle.
class AppPageHeader extends StatelessWidget {
  const AppPageHeader({
    super.key,
    required this.title,
    this.eyebrow,
    this.subtitle,
    this.trailing,
  });

  final String title;
  final String? eyebrow;
  final String? subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (eyebrow != null) ...[
                Text(
                  eyebrow!.toUpperCase(),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: scheme.tertiary,
                    letterSpacing: 1.6,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 6),
              ],
              Text(
                title,
                style: theme.textTheme.headlineMedium?.copyWith(
                  fontFamily: 'serif',
                  fontSize: 31,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 6),
                Text(
                  subtitle!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                    height: 1.45,
                  ),
                ),
              ],
            ],
          ),
        ),
        if (trailing != null) ...[
          const SizedBox(width: AppSpacing.md),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: trailing!,
          ),
        ],
      ],
    );
  }
}

/// Small-caps section label above grouped content.
class AppSectionLabel extends StatelessWidget {
  const AppSectionLabel({super.key, required this.label, this.trailing});

  final String label;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Row(
      children: [
        Text(
          label.toUpperCase(),
          style: theme.textTheme.labelSmall?.copyWith(
            color: scheme.onSurfaceVariant,
            letterSpacing: 1.0,
            fontWeight: FontWeight.w700,
          ),
        ),
        if (trailing != null) ...[const Spacer(), trailing!],
      ],
    );
  }
}

/// Brand logotype tile.
class AppBrandMark extends StatelessWidget {
  const AppBrandMark({super.key, this.size = 56, this.iconSize});

  final double size;
  final double? iconSize;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: scheme.primary,
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      child: Icon(
        Icons.photo_camera_back_outlined,
        size: iconSize ?? size * 0.46,
        color: scheme.onPrimary,
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

enum AppButtonTone { primary, secondary, ghost, danger }

class AppButton extends StatelessWidget {
  const AppButton({
    super.key,
    required this.label,
    this.onPressed,
    this.icon,
    this.tone = AppButtonTone.primary,
    this.busy = false,
    this.minHeight = 48,
    this.expand = false,
    this.outlined = false,
    this.elevated = false,
    this.padding = const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final AppButtonTone tone;
  final bool busy;
  final double minHeight;
  final bool expand;
  final bool outlined;

  /// Lifts the button off the page with a hairline shadow. Use for the single
  /// primary action on a page whose flat fill would otherwise have no edge.
  final bool elevated;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    final enabled = onPressed != null && !busy;
    final (resolvedBackground, resolvedForeground) = switch (tone) {
      AppButtonTone.primary => (scheme.primary, scheme.onPrimary),
      AppButtonTone.secondary => (
          scheme.surfaceContainer,
          scheme.onSurface,
        ),
      AppButtonTone.ghost => (scheme.surfaceContainer, scheme.onSurface),
      AppButtonTone.danger => (scheme.error, scheme.onError),
    };
    final foreground = outlined
        ? switch (tone) {
            AppButtonTone.primary => scheme.primary,
            AppButtonTone.danger => scheme.error,
            _ => scheme.onSurface,
          }
        : resolvedForeground;
    final background = outlined ? Colors.transparent : resolvedBackground;

    return AppPressable(
      enabled: enabled || busy,
      onTap: enabled ? onPressed : null,
      semanticLabel: label,
      scale: 0.985,
      dim: 0.88,
      child: Container(
        constraints: BoxConstraints(minHeight: minHeight),
        padding: padding,
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(AppRadius.control),
          border: outlined
              ? Border.all(color: foreground)
              : elevated
                  ? Border.all(color: scheme.outlineVariant)
                  : null,
          boxShadow: elevated && enabled
              ? AppElevation.control(scheme.shadow, dark: isDark)
              : null,
        ),
        child: Row(
          mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (busy)
              AppSpinner(size: 18, stroke: 2.2, color: foreground)
            else if (icon != null)
              Icon(icon, size: 18, color: foreground),
            if (busy || icon != null) const SizedBox(width: AppSpacing.sm),
            Flexible(
              child: Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.labelLarge?.copyWith(
                      color: foreground,
                      fontWeight: FontWeight.w700,
                    ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class AppIconButton extends StatelessWidget {
  const AppIconButton({
    super.key,
    required this.icon,
    this.onPressed,
    this.semanticLabel,
    this.selected = false,
    this.danger = false,
    this.bordered = false,
    this.elevated = false,
    this.filled = true,
    this.size = 40,
    this.iconSize = 20,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String? semanticLabel;
  final bool selected;
  final bool danger;
  final bool bordered;

  /// Hairline lift, matching [AppButton.elevated]. Pair with [bordered] for
  /// header actions that sit directly on the page surface.
  final bool elevated;

  /// When false the button is ghosted — for icons that sit inside a field,
  /// on top of a photo, or inside a notice that already has its own fill.
  final bool filled;
  final double size;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    final enabled = onPressed != null;
    final foreground = danger
        ? scheme.error
        : selected
            ? scheme.onPrimary
            : scheme.onSurfaceVariant;

    final background = danger
        ? scheme.errorContainer
        : selected
            ? scheme.primary
            : !filled
                ? Colors.transparent
                : bordered
                    ? scheme.surfaceContainerLow
                    : scheme.surfaceContainer;

    return AppPressable(
      enabled: enabled,
      onTap: onPressed,
      semanticLabel: semanticLabel,
      scale: 0.92,
      child: AnimatedContainer(
        duration: AppMotion.medium,
        curve: AppMotion.curve,
        width: size,
        height: size,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: background,
          borderRadius: BorderRadius.circular(AppRadius.small),
          border: bordered && !selected
              ? Border.all(color: scheme.outlineVariant)
              : null,
          boxShadow: elevated && enabled
              ? AppElevation.control(scheme.shadow, dark: isDark)
              : null,
        ),
        child: Icon(icon, size: iconSize, color: foreground),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

enum AppCardTone { paper, muted, accent, inverse, danger }

/// Flat tonal surface — the single card primitive. No borders by default;
/// hierarchy comes from tone contrast against the page surface.
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(AppSpacing.lg),
    this.tone = AppCardTone.paper,
    this.radius = AppRadius.large,
    this.outlined = false,
    this.onTap,
    this.onLongPress,
    this.semanticLabel,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final AppCardTone tone;
  final double radius;
  final bool outlined;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final String? semanticLabel;

  Color _background(ColorScheme scheme) => switch (tone) {
        AppCardTone.paper => scheme.surfaceContainerLow,
        AppCardTone.muted => scheme.surfaceContainer,
        AppCardTone.accent => scheme.tertiaryContainer,
        AppCardTone.inverse => scheme.inverseSurface,
        AppCardTone.danger => scheme.errorContainer,
      };

  Color? _outline(ColorScheme scheme) => outlined
      ? switch (tone) {
          AppCardTone.accent => scheme.tertiary.withValues(alpha: 0.38),
          AppCardTone.danger => scheme.error.withValues(alpha: 0.36),
          _ => scheme.outlineVariant,
        }
      : null;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tappable = onTap != null || onLongPress != null;
    final outline = _outline(scheme);
    final content = AnimatedContainer(
      duration: AppMotion.medium,
      curve: AppMotion.curve,
      padding: padding,
      decoration: BoxDecoration(
        color: _background(scheme),
        borderRadius: BorderRadius.circular(radius),
        border: outline == null ? null : Border.all(color: outline),
      ),
      child: child,
    );

    if (!tappable) {
      return Semantics(container: true, label: semanticLabel, child: content);
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: AppPressable(
        onTap: onTap,
        onLongPress: onLongPress,
        semanticLabel: semanticLabel,
        child: content,
      ),
    );
  }
}

/// Hairline separator — 0.7 logical px so it reads as a printed rule.
class AppDivider extends StatelessWidget {
  const AppDivider({super.key, this.indent = 0, this.endIndent = 0});

  final double indent;
  final double endIndent;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 0.7,
      margin: EdgeInsets.only(left: indent, right: endIndent),
      color: Theme.of(context).colorScheme.outlineVariant,
    );
  }
}

/// Vermilion stamp — compact accent tag for meta and status.
class AppStamp extends StatelessWidget {
  const AppStamp({
    super.key,
    required this.label,
    this.icon,
    this.selected = false,
    this.color,
  });

  final String label;
  final IconData? icon;
  final bool selected;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final stamp = color ?? scheme.tertiary;
    return Container(
      constraints: const BoxConstraints(minHeight: 28),
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        color: selected ? stamp : scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(AppRadius.small),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 13, color: selected ? scheme.onTertiary : stamp),
            const SizedBox(width: 5),
          ],
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: selected ? scheme.onTertiary : stamp,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.35,
                ),
          ),
        ],
      ),
    );
  }
}

/// Square counter used by the mobile page headers in the Pencil prototype.
class AppCountStamp extends StatelessWidget {
  const AppCountStamp({
    super.key,
    required this.value,
    required this.label,
    required this.icon,
  });

  final String value;
  final String label;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: 54,
      height: 54,
      decoration: BoxDecoration(
        color: scheme.tertiaryContainer,
        borderRadius: BorderRadius.circular(AppRadius.medium),
        border: Border.all(color: scheme.tertiary),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 13, color: scheme.tertiary),
              const SizedBox(width: 3),
              Flexible(
                child: Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.fade,
                  softWrap: false,
                  style: Theme.of(context).textTheme.labelLarge?.copyWith(
                        color: scheme.tertiary,
                        fontWeight: FontWeight.w800,
                      ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.fade,
            softWrap: false,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: scheme.tertiary,
                  fontSize: 8,
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}

/// Tonal status pill with optional leading icon.
class AppStatusChip extends StatelessWidget {
  const AppStatusChip({
    super.key,
    required this.label,
    required this.background,
    required this.foreground,
    this.icon,
  });

  final String label;
  final Color background;
  final Color foreground;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppRadius.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: foreground),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: Theme.of(context).textTheme.labelSmall?.copyWith(
                  color: foreground,
                  fontWeight: FontWeight.w700,
                ),
          ),
        ],
      ),
    );
  }
}

/// Color-coded leading dot + quiet label.
class AppStatusDot extends StatelessWidget {
  const AppStatusDot({
    super.key,
    required this.label,
    required this.color,
    this.labelColor,
  });

  final String label;
  final Color color;
  final Color? labelColor;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 7,
          height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall?.copyWith(
                color: labelColor ?? scheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

class AppSpinner extends StatefulWidget {
  const AppSpinner({super.key, this.size = 24, this.color, this.stroke = 2.4});

  final double size;
  final Color? color;
  final double stroke;

  @override
  State<AppSpinner> createState() => _AppSpinnerState();
}

class _AppSpinnerState extends State<AppSpinner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 850),
  )..repeat();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? Theme.of(context).colorScheme.tertiary;
    return SizedBox.square(
      dimension: widget.size,
      child: AnimatedBuilder(
        animation: _controller,
        builder: (context, child) => Transform.rotate(
          angle: _controller.value * math.pi * 2,
          child: CustomPaint(
            painter: _SpinnerPainter(color: color, stroke: widget.stroke),
          ),
        ),
      ),
    );
  }
}

class _SpinnerPainter extends CustomPainter {
  const _SpinnerPainter({required this.color, required this.stroke});

  final Color color;
  final double stroke;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = stroke
      ..strokeCap = StrokeCap.round;
    final inset = stroke / 2;
    canvas.drawArc(
      Rect.fromLTWH(inset, inset, size.width - stroke, size.height - stroke),
      -.6,
      math.pi * 1.35,
      false,
      paint,
    );
  }

  @override
  bool shouldRepaint(covariant _SpinnerPainter oldDelegate) =>
      oldDelegate.color != color || oldDelegate.stroke != stroke;
}

/// Indeterminate/determinate hairline progress with animated fill.
class AppProgress extends StatelessWidget {
  const AppProgress({super.key, this.value, this.height = 4});

  final double? value;
  final double height;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final normalized = (value ?? 0.4).clamp(0.0, 1.0);
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadius.pill),
      child: SizedBox(
        height: height,
        child: LayoutBuilder(
          builder: (context, constraints) => Stack(
            alignment: Alignment.centerLeft,
            children: [
              Positioned.fill(
                child: ColoredBox(color: scheme.surfaceContainerHighest),
              ),
              AnimatedContainer(
                duration: AppMotion.medium,
                curve: AppMotion.curve,
                width: constraints.maxWidth * normalized,
                color: scheme.tertiary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class AppEmptyState extends StatelessWidget {
  const AppEmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.description,
    this.action,
  });

  final IconData icon;
  final String title;
  final String description;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 320),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: scheme.surfaceContainer,
                  borderRadius: BorderRadius.circular(AppRadius.large),
                ),
                child: Icon(icon, size: 26, color: scheme.onSurfaceVariant),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                title,
                textAlign: TextAlign.center,
                style: theme.textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                description,
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                  height: 1.45,
                ),
              ),
              if (action != null) ...[
                const SizedBox(height: AppSpacing.lg),
                action!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}

/// Inline notice strip (info / error) with optional dismiss.
class AppNotice extends StatelessWidget {
  const AppNotice({
    super.key,
    required this.message,
    required this.icon,
    this.isError = false,
    this.onDismiss,
  });

  final String message;
  final IconData icon;
  final bool isError;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final background =
        isError ? scheme.errorContainer : scheme.surfaceContainer;
    final foreground = isError ? scheme.onErrorContainer : scheme.onSurface;

    return Container(
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(AppRadius.medium),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 6, 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: foreground),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(top: 1),
              child: Text(
                message,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: foreground,
                      height: 1.4,
                    ),
              ),
            ),
          ),
          if (onDismiss != null)
            AppIconButton(
              icon: Icons.close,
              onPressed: onDismiss,
              semanticLabel: 'dismiss',
              filled: false,
              size: 34,
              iconSize: 18,
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

class AppSwitch extends StatelessWidget {
  const AppSwitch({
    super.key,
    required this.value,
    required this.onChanged,
    this.semanticLabel,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AppPressable(
      semanticLabel: semanticLabel,
      enabled: onChanged != null,
      onTap: () => onChanged?.call(!value),
      scale: 0.94,
      dim: 1,
      child: AnimatedContainer(
        duration: AppMotion.medium,
        curve: AppMotion.curve,
        width: 46,
        height: 28,
        padding: const EdgeInsets.all(3),
        decoration: BoxDecoration(
          color: value ? scheme.primary : scheme.surfaceContainer,
          borderRadius: BorderRadius.circular(AppRadius.pill),
        ),
        child: AnimatedAlign(
          duration: AppMotion.medium,
          curve: AppMotion.curve,
          alignment: value ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              color: value ? scheme.onPrimary : scheme.onSurfaceVariant,
              shape: BoxShape.circle,
            ),
          ),
        ),
      ),
    );
  }
}

/// Selectable list row — radio-style check or custom trailing.
class AppChoiceRow extends StatelessWidget {
  const AppChoiceRow({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
    this.subtitle,
    this.icon,
    this.trailing,
    this.danger = false,
  });

  final String label;
  final String? subtitle;
  final IconData? icon;
  final bool selected;
  final VoidCallback? onTap;
  final Widget? trailing;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final theme = Theme.of(context);
    final labelColor = danger
        ? scheme.error
        : selected
            ? scheme.onSurface
            : scheme.onSurface;

    return AppPressable(
      onTap: onTap,
      semanticLabel: label,
      scale: 0.99,
      dim: 0.86,
      child: AnimatedContainer(
        duration: AppMotion.medium,
        curve: AppMotion.curve,
        constraints: const BoxConstraints(minHeight: 56),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? scheme.primaryContainer : scheme.surfaceContainer,
          borderRadius: BorderRadius.circular(AppRadius.medium),
        ),
        child: Row(
          children: [
            if (icon != null) ...[
              Icon(
                icon,
                size: 20,
                color: danger
                    ? scheme.error
                    : selected
                        ? scheme.primary
                        : scheme.onSurfaceVariant,
              ),
              const SizedBox(width: AppSpacing.md),
            ],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    label,
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: labelColor,
                      fontWeight: selected ? FontWeight.w700 : FontWeight.w600,
                    ),
                  ),
                  if (subtitle != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      subtitle!,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: danger
                            ? scheme.error.withValues(alpha: 0.8)
                            : scheme.onSurfaceVariant,
                        height: 1.35,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            if (trailing != null)
              trailing!
            else
              AnimatedContainer(
                duration: AppMotion.medium,
                width: 20,
                height: 20,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: selected ? scheme.primary : Colors.transparent,
                  border: Border.all(
                    color: selected ? scheme.primary : scheme.outline,
                    width: 1.5,
                  ),
                ),
                child: selected
                    ? Icon(Icons.check, size: 13, color: scheme.onPrimary)
                    : null,
              ),
          ],
        ),
      ),
    );
  }
}

/// Segmented control with a sliding thumb.
class AppSegmented<T> extends StatelessWidget {
  const AppSegmented({
    super.key,
    required this.items,
    required this.value,
    required this.onChanged,
  });

  final List<(T, String, IconData?)> items;
  final T value;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final selectedIndex =
        items.indexWhere((item) => item.$1 == value).clamp(0, items.length);

    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(AppRadius.control),
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final segmentWidth = (constraints.maxWidth - 8) / items.length;
          return SizedBox(
            height: 40,
            child: Stack(
              children: [
                // Minimal sliding thumb — flatter, less plastic, distinct from background
                AnimatedPositioned(
                  duration: AppMotion.medium,
                  curve: AppMotion.curve,
                  left: segmentWidth * selectedIndex,
                  top: 2,
                  bottom: 2,
                  width: segmentWidth,
                  child: Container(
                    decoration: BoxDecoration(
                      color: scheme.tertiary,
                      borderRadius: BorderRadius.circular(AppRadius.small),
                    ),
                  ),
                ),
                Row(
                  children: [
                    for (final item in items)
                      Expanded(
                        child: AppPressable(
                          onTap: () {
                            HapticFeedback.selectionClick();
                            onChanged(item.$1);
                          },
                          semanticLabel: item.$2,
                          scale: 0.96,
                          dim: 0.82,
                          child: SizedBox(
                            height: 40,
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                if (item.$3 != null) ...[
                                  Icon(
                                    item.$3,
                                    size: 16,
                                    color: item.$1 == value
                                        ? scheme.onPrimary
                                        : scheme.onSurfaceVariant,
                                  ),
                                  const SizedBox(width: 6),
                                ],
                                Flexible(
                                  child: Text(
                                    item.$2,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    textAlign: TextAlign.center,
                                    style: Theme.of(context)
                                        .textTheme
                                        .labelLarge
                                        ?.copyWith(
                                          color: item.$1 == value
                                              ? scheme.onPrimary
                                              : scheme.onSurfaceVariant,
                                          fontWeight: item.$1 == value
                                              ? FontWeight.w700
                                              : FontWeight.w600,
                                        ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

/// Segmented tabs synced to a [PageView] — tap to animate, swipe to follow.
class AppSwipeTabs extends StatefulWidget {
  const AppSwipeTabs({
    super.key,
    required this.labels,
    required this.children,
    this.initialIndex = 0,
  });

  final List<String> labels;
  final List<Widget> children;
  final int initialIndex;

  @override
  State<AppSwipeTabs> createState() => AppSwipeTabsState();
}

class AppSwipeTabsState extends State<AppSwipeTabs> {
  late final PageController _pageController;
  int _index = 0;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void animateTo(int index) {
    _pageController.animateToPage(
      index,
      duration: AppMotion.slow,
      curve: AppMotion.curve,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        AppSegmented<int>(
          value: _index,
          onChanged: animateTo,
          items: [
            for (var i = 0; i < widget.labels.length; i++)
              (i, widget.labels[i], null),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: PageView.builder(
            controller: _pageController,
            itemCount: widget.children.length,
            onPageChanged: (value) => setState(() => _index = value),
            itemBuilder: (context, index) => widget.children[index],
          ),
        ),
      ],
    );
  }
}

/// Custom text field: floating label above, animated focus border,
/// custom hint overlay — no InputDecoration/Material internals.
class AppTextField extends StatefulWidget {
  const AppTextField({
    super.key,
    required this.controller,
    this.label,
    this.hint,
    this.leading,
    this.trailing,
    this.keyboardType,
    this.textInputAction,
    this.obscureText = false,
    this.autofocus = false,
    this.enabled = true,
    this.maxLines = 1,
    this.onChanged,
    this.onSubmitted,
    this.errorText,
    this.autofillHints,
  });

  final TextEditingController controller;
  final String? label;
  final String? hint;
  final Widget? leading;
  final Widget? trailing;
  final TextInputType? keyboardType;
  final TextInputAction? textInputAction;
  final bool obscureText;
  final bool autofocus;
  final bool enabled;
  final int? maxLines;
  final ValueChanged<String>? onChanged;
  final ValueChanged<String>? onSubmitted;
  final String? errorText;

  /// Passed through to the inner [EditableText] so a surrounding
  /// [AutofillGroup] can offer platform credential suggestions.
  final List<String>? autofillHints;

  @override
  State<AppTextField> createState() => _AppTextFieldState();
}

class _AppTextFieldState extends State<AppTextField> {
  late final FocusNode _focusNode = FocusNode()..addListener(_refresh);

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _focusNode
      ..removeListener(_refresh)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final hasError = widget.errorText?.isNotEmpty == true;
    final focused = _focusNode.hasFocus;
    final borderColor = hasError
        ? scheme.error
        : focused
            ? scheme.primary
            : scheme.outlineVariant;
    final style = theme.textTheme.bodyLarge ?? const TextStyle(fontSize: 16);

    return AnimatedOpacity(
      opacity: widget.enabled ? 1 : 0.46,
      duration: AppMotion.fast,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (widget.label != null) ...[
            Text(
              widget.label!,
              style: theme.textTheme.labelMedium?.copyWith(
                color: hasError
                    ? scheme.error
                    : focused
                        ? scheme.primary
                        : scheme.onSurfaceVariant,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 6),
          ],
          AnimatedContainer(
            duration: AppMotion.fast,
            constraints: const BoxConstraints(minHeight: 50),
            padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 10),
            decoration: BoxDecoration(
              color: scheme.surfaceContainer,
              borderRadius: BorderRadius.circular(AppRadius.field),
              border: Border.all(
                color: borderColor,
                width: focused || hasError ? 1.5 : 1,
              ),
            ),
            child: Row(
              crossAxisAlignment: widget.maxLines == 1
                  ? CrossAxisAlignment.center
                  : CrossAxisAlignment.start,
              children: [
                if (widget.leading != null) ...[
                  IconTheme(
                    data: IconThemeData(
                      color: scheme.onSurfaceVariant,
                      size: 19,
                    ),
                    child: widget.leading!,
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  child: Stack(
                    alignment: Alignment.centerLeft,
                    children: [
                      if (widget.controller.text.isEmpty && widget.hint != null)
                        IgnorePointer(
                          child: Text(
                            widget.hint!,
                            maxLines: widget.maxLines,
                            overflow: TextOverflow.ellipsis,
                            style: style.copyWith(
                              color: scheme.onSurfaceVariant
                                  .withValues(alpha: 0.72),
                            ),
                          ),
                        ),
                      EditableText(
                        controller: widget.controller,
                        focusNode: _focusNode,
                        style: style.copyWith(color: scheme.onSurface),
                        cursorColor: scheme.primary,
                        backgroundCursorColor: scheme.onSurfaceVariant,
                        keyboardType: widget.keyboardType,
                        textInputAction: widget.textInputAction,
                        obscureText: widget.obscureText,
                        autofocus: widget.autofocus,
                        readOnly: !widget.enabled,
                        maxLines: widget.obscureText ? 1 : widget.maxLines,
                        onChanged: (value) {
                          setState(() {});
                          widget.onChanged?.call(value);
                        },
                        onSubmitted: widget.onSubmitted,
                        autofillHints: widget.autofillHints,
                        selectionColor: scheme.primary.withValues(alpha: 0.22),
                      ),
                    ],
                  ),
                ),
                if (widget.trailing != null) ...[
                  const SizedBox(width: 8),
                  widget.trailing!,
                ],
              ],
            ),
          ),
          if (hasError) ...[
            const SizedBox(height: 5),
            Text(
              widget.errorText!,
              style: theme.textTheme.bodySmall?.copyWith(color: scheme.error),
            ),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Overlays: dialog / sheet / toast
// ---------------------------------------------------------------------------

class AppDialog extends StatelessWidget {
  const AppDialog({
    super.key,
    required this.title,
    required this.content,
    required this.actions,
    this.icon,
  });

  final String title;
  final Widget content;
  final List<Widget> actions;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    return Center(
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Container(
            width: math.min(MediaQuery.sizeOf(context).width - 32, 520),
            padding: const EdgeInsets.all(AppSpacing.xl),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerLow,
              borderRadius: BorderRadius.circular(AppRadius.xlarge),
              boxShadow: AppElevation.overlay(scheme.shadow, dark: isDark),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Row(
                  children: [
                    if (icon != null) ...[
                      Container(
                        width: 40,
                        height: 40,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: scheme.tertiaryContainer,
                          borderRadius: BorderRadius.circular(AppRadius.small),
                        ),
                        child: Icon(icon, color: scheme.tertiary, size: 20),
                      ),
                      const SizedBox(width: AppSpacing.md),
                    ],
                    Expanded(
                      child: Text(
                        title,
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                DefaultTextStyle(
                  style: Theme.of(context).textTheme.bodyMedium!.copyWith(
                        color: scheme.onSurfaceVariant,
                        height: 1.5,
                      ),
                  child: content,
                ),
                const SizedBox(height: AppSpacing.xl),
                Wrap(
                  alignment: WrapAlignment.end,
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: actions,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<T?> showAppDialog<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  bool dismissible = true,
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: dismissible,
    barrierLabel: 'dismiss',
    barrierColor: Colors.black.withValues(alpha: 0.52),
    transitionDuration: AppMotion.medium,
    pageBuilder: (context, animation, secondaryAnimation) => builder(context),
    transitionBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: AppMotion.curve,
      );
      return FadeTransition(
        opacity: curved,
        child: ScaleTransition(
          scale: Tween<double>(begin: 0.96, end: 1).animate(curved),
          child: child,
        ),
      );
    },
  );
}

/// Bottom sheet with a working drag-to-dismiss handle and slide-up entry.
Future<T?> showAppSheet<T>({
  required BuildContext context,
  required WidgetBuilder builder,
  double maxWidth = 720,
  bool dismissible = true,
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: dismissible,
    barrierLabel: 'dismiss',
    barrierColor: Colors.black.withValues(alpha: 0.48),
    transitionDuration: AppMotion.slow,
    pageBuilder: (context, animation, secondaryAnimation) {
      return _AppSheetFrame(
        maxWidth: maxWidth,
        onDismiss: dismissible ? () => Navigator.of(context).pop() : null,
        child: builder(context),
      );
    },
    transitionBuilder: (context, animation, secondaryAnimation, child) {
      final curved = CurvedAnimation(
        parent: animation,
        curve: AppMotion.curve,
        reverseCurve: AppMotion.reverseCurve,
      );
      return SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.12),
          end: Offset.zero,
        ).animate(curved),
        child: FadeTransition(opacity: curved, child: child),
      );
    },
  );
}

class _AppSheetFrame extends StatefulWidget {
  const _AppSheetFrame({
    required this.maxWidth,
    required this.child,
    this.onDismiss,
  });

  final double maxWidth;
  final Widget child;
  final VoidCallback? onDismiss;

  @override
  State<_AppSheetFrame> createState() => _AppSheetFrameState();
}

class _AppSheetFrameState extends State<_AppSheetFrame>
    with SingleTickerProviderStateMixin {
  double _drag = 0;
  late final AnimationController _snapController = AnimationController(
    vsync: this,
    duration: AppMotion.medium,
  );
  Animation<double>? _snapAnimation;

  @override
  void dispose() {
    _snapController.dispose();
    super.dispose();
  }

  void _onDragUpdate(DragUpdateDetails details) {
    if (widget.onDismiss == null) return;
    _snapController.stop();
    setState(() {
      _drag = (_drag + details.primaryDelta!).clamp(0.0, 400.0);
    });
  }

  void _onDragEnd(DragEndDetails details) {
    if (widget.onDismiss == null) return;
    final velocity = details.primaryVelocity ?? 0;
    if (_drag > 110 || velocity > 700) {
      widget.onDismiss!();
      return;
    }
    _snapAnimation = Tween<double>(begin: _drag, end: 0).animate(
      CurvedAnimation(parent: _snapController, curve: AppMotion.curve),
    )..addListener(() => setState(() => _drag = _snapAnimation!.value));
    _snapController.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    return Align(
      alignment: Alignment.bottomCenter,
      child: SafeArea(
        top: false,
        child: Transform.translate(
          offset: Offset(0, _drag),
          child: Container(
            width: math.min(MediaQuery.sizeOf(context).width, widget.maxWidth),
            constraints: BoxConstraints(
              maxHeight: MediaQuery.sizeOf(context).height * 0.92,
            ),
            decoration: BoxDecoration(
              color: scheme.surfaceContainerLow,
              borderRadius: const BorderRadius.vertical(
                top: Radius.circular(AppRadius.xlarge),
              ),
              boxShadow: AppElevation.drop(scheme.shadow, dark: isDark),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onVerticalDragUpdate: _onDragUpdate,
                  onVerticalDragEnd: _onDragEnd,
                  child: Container(
                    width: double.infinity,
                    color: Colors.transparent,
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Center(
                      child: Container(
                        width: 44,
                        height: 4,
                        decoration: BoxDecoration(
                          color: scheme.outline.withValues(alpha: 0.5),
                          borderRadius: BorderRadius.circular(AppRadius.pill),
                        ),
                      ),
                    ),
                  ),
                ),
                Flexible(child: widget.child),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Toast with slide+fade entry and exit (no SnackBar).
void showAppToast(BuildContext context, String message) {
  final overlay = Overlay.of(context);
  late OverlayEntry entry;
  final controller = AnimationController(
    vsync: Navigator.of(context),
    duration: AppMotion.medium,
  );

  entry = OverlayEntry(
    builder: (context) {
      final scheme = Theme.of(context).colorScheme;
      final isDark = scheme.brightness == Brightness.dark;
      final curved = CurvedAnimation(
        parent: controller,
        curve: AppMotion.curve,
        reverseCurve: AppMotion.reverseCurve,
      );
      return Positioned(
        left: 16,
        right: 16,
        bottom: 24 + MediaQuery.paddingOf(context).bottom,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.6),
            end: Offset.zero,
          ).animate(curved),
          child: FadeTransition(
            opacity: curved,
            child: IgnorePointer(
              child: Center(
                child: Container(
                  constraints: const BoxConstraints(maxWidth: 520),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 12,
                  ),
                  decoration: BoxDecoration(
                    color: scheme.inverseSurface,
                    borderRadius: BorderRadius.circular(AppRadius.control),
                    boxShadow:
                        AppElevation.overlay(scheme.shadow, dark: isDark),
                  ),
                  child: Text(
                    message,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: scheme.onInverseSurface,
                          fontWeight: FontWeight.w600,
                        ),
                  ),
                ),
              ),
            ),
          ),
        ),
      );
    },
  );

  overlay.insert(entry);
  controller.forward();
  Future<void>.delayed(const Duration(seconds: 2), () async {
    await controller.reverse();
    entry.remove();
    controller.dispose();
  });
}

// ---------------------------------------------------------------------------
// Pull to refresh
// ---------------------------------------------------------------------------

class AppPullRefresh extends StatefulWidget {
  const AppPullRefresh({
    super.key,
    required this.onRefresh,
    required this.child,
  });

  final Future<void> Function() onRefresh;
  final Widget child;

  @override
  State<AppPullRefresh> createState() => _AppPullRefreshState();
}

class _AppPullRefreshState extends State<AppPullRefresh> {
  double _drag = 0;
  bool _refreshing = false;

  bool _onNotification(ScrollNotification notification) {
    if (_refreshing) return false;
    if (notification is OverscrollNotification &&
        notification.metrics.pixels <= notification.metrics.minScrollExtent &&
        notification.overscroll < 0) {
      setState(() => _drag = (_drag - notification.overscroll).clamp(0, 84));
    } else if (notification is ScrollEndNotification) {
      if (_drag >= 58) {
        _runRefresh();
      } else if (_drag != 0) {
        setState(() => _drag = 0);
      }
    }
    return false;
  }

  Future<void> _runRefresh() async {
    HapticFeedback.lightImpact();
    setState(() {
      _refreshing = true;
      _drag = 58;
    });
    try {
      await widget.onRefresh();
    } finally {
      if (mounted) {
        setState(() {
          _refreshing = false;
          _drag = 0;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return NotificationListener<ScrollNotification>(
      onNotification: _onNotification,
      child: Stack(
        children: [
          AnimatedContainer(
            duration: AppMotion.fast,
            transform: Matrix4.translationValues(0, _drag * 0.42, 0),
            child: widget.child,
          ),
          if (_drag > 0 || _refreshing)
            Positioned(
              top: 8,
              left: 0,
              right: 0,
              child: Center(
                child: Container(
                  width: 38,
                  height: 38,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: scheme.surfaceContainerLow,
                    shape: BoxShape.circle,
                  ),
                  child: _refreshing
                      ? const AppSpinner(size: 18)
                      : Transform.rotate(
                          angle: (_drag / 84) * math.pi,
                          child: Icon(
                            Icons.arrow_downward,
                            size: 18,
                            color: scheme.onSurfaceVariant,
                          ),
                        ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Loading skeletons
// ---------------------------------------------------------------------------

class AppSkeletonPulse extends StatefulWidget {
  const AppSkeletonPulse({super.key, required this.child});

  final Widget child;

  @override
  State<AppSkeletonPulse> createState() => _AppSkeletonPulseState();
}

class _AppSkeletonPulseState extends State<AppSkeletonPulse>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.55, end: 1).animate(
        CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
      ),
      child: widget.child,
    );
  }
}

class AppSkeletonBox extends StatelessWidget {
  const AppSkeletonBox({
    super.key,
    this.width,
    this.height = 12,
    this.radius = 8,
  });

  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHigh,
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// Placeholder contact sheet. Built from plain [Column]/[Row] boxes rather
/// than a [GridView]: a nested scrollable reports no intrinsic dimensions, so
/// hosting one inside `SliverFillRemaining(hasScrollBody: false)` aborts the
/// viewport layout and paints nothing at all.
class AppSkeletonGrid extends StatelessWidget {
  const AppSkeletonGrid({
    super.key,
    this.columns = 3,
    this.rows = 3,
    this.aspectRatio = 0.8,
  });

  final int columns;
  final int rows;

  /// Cell width / height. Defaults to the contact-sheet cell ratio so the
  /// placeholder occupies the same space the real grid will.
  final double aspectRatio;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final decoration = BoxDecoration(
      color: scheme.surfaceContainerHigh,
      borderRadius: BorderRadius.circular(AppRadius.medium),
    );

    return AppSkeletonPulse(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 2, 8, 0),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var row = 0; row < rows; row++) ...[
              if (row > 0) const SizedBox(height: 6),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var column = 0; column < columns; column++) ...[
                    if (column > 0) const SizedBox(width: 6),
                    Expanded(
                      child: AspectRatio(
                        aspectRatio: aspectRatio,
                        child: DecoratedBox(decoration: decoration),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Placeholder rows. Uses a plain [Column] for the same reason as
/// [AppSkeletonGrid]: nested scrollables cannot report intrinsic dimensions and
/// silently collapse a `SliverFillRemaining(hasScrollBody: false)` host.
class AppSkeletonList extends StatelessWidget {
  const AppSkeletonList({super.key, this.rows = 5});

  final int rows;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AppSkeletonPulse(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var index = 0; index < rows; index++) ...[
              if (index > 0) const SizedBox(height: AppSpacing.sm),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: scheme.surfaceContainerLow,
                  borderRadius: BorderRadius.circular(AppRadius.large),
                ),
                child: const Row(
                  children: [
                    AppSkeletonBox(
                      width: 52,
                      height: 52,
                      radius: AppRadius.medium,
                    ),
                    SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          AppSkeletonBox(width: 160, height: 14),
                          SizedBox(height: 8),
                          AppSkeletonBox(width: 96, height: 10),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Entrance animation
// ---------------------------------------------------------------------------

/// One-shot entrance: fade + slight rise. [delay] staggers siblings.
class AppEntrance extends StatelessWidget {
  const AppEntrance({
    super.key,
    required this.child,
    this.delay = Duration.zero,
    this.duration = const Duration(milliseconds: 280),
    this.offset = const Offset(0, 10),
  });

  final Widget child;
  final Duration delay;
  final Duration duration;
  final Offset offset;

  @override
  Widget build(BuildContext context) {
    return TweenAnimationBuilder<double>(
      tween: _DelayedTween(delay: delay, duration: duration),
      duration: delay + duration,
      curve: AppMotion.curve,
      builder: (context, t, child) {
        return Opacity(
          opacity: t,
          child: Transform.translate(
            offset: Offset(offset.dx * (1 - t), offset.dy * (1 - t)),
            child: child,
          ),
        );
      },
      child: child,
    );
  }
}

class _DelayedTween extends Tween<double> {
  _DelayedTween({required this.delay, required this.duration})
      : super(begin: 0, end: 1);

  final Duration delay;
  final Duration duration;

  @override
  double lerp(double t) {
    final total = delay.inMilliseconds + duration.inMilliseconds;
    final local = (t * total - delay.inMilliseconds) / duration.inMilliseconds;
    return super.lerp(local.clamp(0.0, 1.0));
  }
}

// ---------------------------------------------------------------------------
// Wizard chrome
// ---------------------------------------------------------------------------

/// Horizontal step indicator — numbered stops with connecting rules.
class AppStepStrip extends StatelessWidget {
  const AppStepStrip({
    super.key,
    required this.current,
    required this.labels,
    this.onStepTap,
  });

  final int current;
  final List<String> labels;
  final ValueChanged<int>? onStepTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: '${current + 1} / ${labels.length}: ${labels[current]}',
      child: Row(
        children: List.generate(labels.length, (index) {
          final active = index == current;
          final complete = index < current;
          return Expanded(
            child: Padding(
              padding:
                  EdgeInsets.only(right: index == labels.length - 1 ? 0 : 6),
              child: AppPressable(
                onTap: onStepTap == null ? null : () => onStepTap!(index),
                semanticLabel: labels[index],
                scale: 0.98,
                dim: 0.85,
                child: AnimatedContainer(
                  duration: AppMotion.medium,
                  curve: AppMotion.curve,
                  height: 44,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  decoration: BoxDecoration(
                    color: active
                        ? scheme.tertiaryContainer
                        : scheme.surfaceContainerLow,
                    borderRadius: BorderRadius.circular(AppRadius.medium),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AnimatedContainer(
                        duration: AppMotion.medium,
                        width: 20,
                        height: 20,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: active || complete
                              ? scheme.tertiary
                              : scheme.surfaceContainerHighest,
                        ),
                        child: complete
                            ? Icon(Icons.check,
                                size: 13, color: scheme.onTertiary)
                            : Text(
                                '${index + 1}',
                                style: Theme.of(context)
                                    .textTheme
                                    .labelSmall
                                    ?.copyWith(
                                      color: active
                                          ? scheme.onTertiary
                                          : scheme.onSurfaceVariant,
                                      fontWeight: FontWeight.w800,
                                    ),
                              ),
                      ),
                      if (MediaQuery.sizeOf(context).width >= 390) ...[
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            labels[index],
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context)
                                .textTheme
                                .labelSmall
                                ?.copyWith(
                                  color: active
                                      ? scheme.onTertiaryContainer
                                      : scheme.onSurfaceVariant,
                                  fontWeight: active
                                      ? FontWeight.w800
                                      : FontWeight.w600,
                                ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

/// Pinned bottom action bar with optional progress hairline.
class AppBottomAction extends StatelessWidget {
  const AppBottomAction({
    super.key,
    required this.primaryLabel,
    required this.onPrimary,
    this.primaryIcon,
    this.secondaryLabel,
    this.onSecondary,
    this.progress,
    this.busy = false,
  });

  final String primaryLabel;
  final VoidCallback? onPrimary;
  final IconData? primaryIcon;
  final String? secondaryLabel;
  final VoidCallback? onSecondary;
  final double? progress;
  final bool busy;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      decoration: BoxDecoration(
        color: scheme.surfaceContainerLow,
        border: Border(top: BorderSide(color: scheme.outlineVariant)),
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (busy) AppProgress(value: progress, height: 2),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 840),
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      final primaryButton = AppButton(
                        onPressed: busy ? null : onPrimary,
                        busy: busy,
                        minHeight: 52,
                        expand: true,
                        icon: primaryIcon ?? Icons.arrow_forward,
                        label: primaryLabel,
                      );
                      final secondaryButton = secondaryLabel == null
                          ? null
                          : AppButton(
                              onPressed: busy ? null : onSecondary,
                              tone: AppButtonTone.secondary,
                              expand: true,
                              label: secondaryLabel!,
                            );

                      if (secondaryButton != null &&
                          constraints.maxWidth < 420) {
                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            primaryButton,
                            const SizedBox(height: AppSpacing.sm),
                            secondaryButton,
                          ],
                        );
                      }

                      return Row(
                        children: [
                          if (secondaryButton != null) ...[
                            Expanded(child: secondaryButton),
                            const SizedBox(width: AppSpacing.sm),
                          ],
                          Expanded(
                            flex: secondaryButton == null ? 1 : 2,
                            child: primaryButton,
                          ),
                        ],
                      );
                    },
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

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/// Fullscreen modal route: rises from bottom, quiet fade on the scrim.
/// Replaces MaterialPageRoute(fullscreenDialog: true).
class AppModalRoute<T> extends PageRoute<T> {
  AppModalRoute({required this.builder});

  final WidgetBuilder builder;

  @override
  bool get opaque => true;

  @override
  bool get barrierDismissible => false;

  @override
  Color? get barrierColor => null;

  @override
  String? get barrierLabel => null;

  @override
  bool get maintainState => true;

  @override
  Duration get transitionDuration => AppMotion.slow;

  @override
  Duration get reverseTransitionDuration => AppMotion.medium;

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) {
    return builder(context);
  }

  @override
  Widget buildTransitions(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    final curved = CurvedAnimation(
      parent: animation,
      curve: AppMotion.curve,
      reverseCurve: AppMotion.reverseCurve,
    );
    return SlideTransition(
      position: Tween<Offset>(
        begin: const Offset(0, 0.06),
        end: Offset.zero,
      ).animate(curved),
      child: FadeTransition(opacity: curved, child: child),
    );
  }
}
