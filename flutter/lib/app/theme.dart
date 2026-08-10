import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// MO Gallery design tokens — "Editorial Archive".
///
/// Warm uncoated paper, dense printing ink, and a single restrained vermilion
/// stamp accent. Surfaces are separated by hairline borders, not shadows;
/// elevation is reserved for floating chrome only (dock, sheets, dialogs,
/// toasts). Everything visual in the app is composed from these tokens plus
/// the primitives in `ui.dart` — no Material component styling leaks through.

abstract final class AppColors {
  // Vermilion archive stamp — reserved for progress, active state, decisive
  // actions. Never used for decorative surfaces.
  static const stamp = Color(0xFFB64B2A);
  static const stampBright = Color(0xFFE07852);
  static const stampDeep = Color(0xFF74301F);
  static const stampSoft = Color(0xFFF8DED3);

  // Neutral ramp (light): uncoated paper and dense editorial ink.
  static const ink = Color(0xFF1B1A18);
  static const inkSoft = Color(0xFF706B65);
  static const paper = Color(0xFFF4F0E9);
  static const paperDeep = Color(0xFFEAE3D9);
  static const line = Color(0xFFDED5C9);
  static const lineStrong = Color(0xFFC9BDAF);
  static const white = Color(0xFFFFFFFF);

  // Neutral ramp (dark).
  static const charcoal = Color(0xFF0D0D0F);
  static const slate = Color(0xFF19181B);
  static const slateDeep = Color(0xFF242226);
  static const lineDark = Color(0xFF353139);

  static const success = Color(0xFF2F8A62);
  static const successSoft = Color(0xFFDDF3E8);
  static const danger = Color(0xFFC54B3F);
  static const dangerSoft = Color(0xFFFBE4E0);
}

/// 4pt-based spacing scale.
abstract final class AppSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 24;
  static const double xxl = 32;
  static const double xxxl = 40;
}

/// Corner radius scale. Cards and sheets use stepped radii so nested
/// surfaces stay concentric (outer = inner + padding).
abstract final class AppRadius {
  static const double small = 8;
  static const double medium = 12;
  static const double large = 16;
  static const double xlarge = 24;
  static const double field = 12;
  static const double control = 12;
  static const double pill = 999;
}

/// Motion spec — one curve family, three durations.
abstract final class AppMotion {
  static const fast = Duration(milliseconds: 120);
  static const medium = Duration(milliseconds: 200);
  static const slow = Duration(milliseconds: 320);
  static const curve = Curves.easeOutCubic;
  static const reverseCurve = Curves.easeInCubic;
}

/// Elevation spec. Level 0 (default) is flat with a hairline border — cards,
/// list rows, sections. Level 1 is floating chrome — dock, sheets, dialogs,
/// toasts. Nothing else casts a shadow.
abstract final class AppElevation {
  static List<BoxShadow> overlay(Color base, {bool dark = false}) => [
        BoxShadow(
          color: base.withValues(alpha: dark ? 0.4 : 0.12),
          blurRadius: 28,
          offset: const Offset(0, 10),
        ),
      ];

  static List<BoxShadow> drop(Color base, {bool dark = false}) => [
        BoxShadow(
          color: base.withValues(alpha: dark ? 0.3 : 0.08),
          blurRadius: 16,
          offset: const Offset(0, -6),
        ),
      ];

  /// Floating bottom dock — tighter and quieter than [overlay] so the bar
  /// reads as lifted paper rather than a modal surface.
  static List<BoxShadow> dock(Color base, {bool dark = false}) => [
        BoxShadow(
          color: base.withValues(alpha: dark ? 0.45 : 0.08),
          blurRadius: 18,
          offset: const Offset(0, 6),
        ),
      ];

  /// Hairline lift for flat controls (primary buttons, header icon buttons)
  /// so they read as pressable paper instead of dissolving into the page.
  static List<BoxShadow> control(Color base, {bool dark = false}) => [
        BoxShadow(
          color: base.withValues(alpha: dark ? 0.4 : 0.07),
          blurRadius: 10,
          offset: const Offset(0, 3),
        ),
      ];

  /// Halo under a solid stamp-colored action, tinted by the action itself.
  static List<BoxShadow> accent(Color base) => [
        BoxShadow(
          color: base.withValues(alpha: 0.35),
          blurRadius: 12,
          offset: const Offset(0, 4),
        ),
      ];
}

/// Bottom-nav dock metrics shared by the shell and page content insets.
abstract final class AppChrome {
  /// Height of the floating capsule itself — nothing overhangs it.
  static const double dockHeight = 64;
  static const double dockMargin = 18;
  static const double dockRadius = 20;
  static const double dockItemHeight = 48;
  static const double dockActionSize = 46;
  static const double bottomInset = dockHeight + dockMargin + 8;
  static const double pageGutter = 16;
}

TextTheme _buildTextTheme(ColorScheme scheme) {
  TextStyle style(
    double size,
    FontWeight weight,
    double height, {
    double letterSpacing = 0,
  }) {
    return TextStyle(
      fontSize: size,
      fontWeight: weight,
      height: height,
      letterSpacing: letterSpacing,
      color: scheme.onSurface,
    );
  }

  return TextTheme(
    displayLarge: style(57, FontWeight.w700, 1.05, letterSpacing: -1.4),
    displayMedium: style(45, FontWeight.w700, 1.08, letterSpacing: -1.0),
    displaySmall: style(36, FontWeight.w700, 1.1, letterSpacing: -0.8),
    headlineLarge: style(30, FontWeight.w700, 1.12, letterSpacing: -0.7),
    headlineMedium: style(26, FontWeight.w700, 1.16, letterSpacing: -0.5),
    headlineSmall: style(22, FontWeight.w700, 1.2, letterSpacing: -0.3),
    titleLarge: style(19, FontWeight.w700, 1.28, letterSpacing: -0.25),
    titleMedium: style(16, FontWeight.w600, 1.32, letterSpacing: -0.1),
    titleSmall: style(14, FontWeight.w600, 1.32),
    bodyLarge: style(16, FontWeight.w400, 1.5, letterSpacing: 0.05),
    bodyMedium: style(14, FontWeight.w400, 1.45, letterSpacing: 0.05),
    bodySmall: style(12, FontWeight.w400, 1.4, letterSpacing: 0.1),
    labelLarge: style(14, FontWeight.w600, 1.3, letterSpacing: 0.1),
    labelMedium: style(12, FontWeight.w600, 1.3, letterSpacing: 0.25),
    labelSmall: style(11, FontWeight.w600, 1.3, letterSpacing: 0.4),
  );
}

/// Global page transition: quiet fade with a 2% rise. Applied on every
/// platform so no Material/Cupertino default transition survives.
class AppPageTransitionsBuilder extends PageTransitionsBuilder {
  const AppPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
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
    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.02),
          end: Offset.zero,
        ).animate(curved),
        child: child,
      ),
    );
  }
}

/// Scroll behaviour without the Android glow or Material scrollbar.
class AppScrollBehavior extends ScrollBehavior {
  const AppScrollBehavior();

  @override
  Widget buildOverscrollIndicator(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) {
    return child;
  }

  @override
  Widget buildScrollbar(
    BuildContext context,
    Widget child,
    ScrollableDetails details,
  ) {
    return child;
  }

  @override
  ScrollPhysics getScrollPhysics(BuildContext context) {
    return const BouncingScrollPhysics(
      parent: AlwaysScrollableScrollPhysics(),
    );
  }
}

ThemeData buildLightTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.light,
    primary: AppColors.ink,
    onPrimary: AppColors.white,
    primaryContainer: AppColors.paperDeep,
    onPrimaryContainer: AppColors.ink,
    secondary: AppColors.inkSoft,
    onSecondary: AppColors.white,
    secondaryContainer: AppColors.paperDeep,
    onSecondaryContainer: AppColors.ink,
    tertiary: AppColors.stamp,
    onTertiary: AppColors.white,
    tertiaryContainer: AppColors.stampSoft,
    onTertiaryContainer: AppColors.stampDeep,
    error: AppColors.danger,
    onError: AppColors.white,
    errorContainer: AppColors.dangerSoft,
    onErrorContainer: Color(0xFF4A1510),
    surface: AppColors.paper,
    onSurface: AppColors.ink,
    onSurfaceVariant: AppColors.inkSoft,
    outline: AppColors.lineStrong,
    outlineVariant: AppColors.line,
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: AppColors.ink,
    onInverseSurface: AppColors.paper,
    inversePrimary: AppColors.white,
    surfaceContainerLowest: AppColors.white,
    surfaceContainerLow: AppColors.white,
    surfaceContainer: AppColors.paperDeep,
    surfaceContainerHigh: Color(0xFFE4DBCE),
    surfaceContainerHighest: Color(0xFFDBD1C2),
  );
  return _buildTheme(scheme);
}

ThemeData buildDarkTheme() {
  const scheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFFF4F1EC),
    onPrimary: Color(0xFF0B0B0C),
    primaryContainer: Color(0xFF262420),
    onPrimaryContainer: Color(0xFFF4F1EC),
    secondary: Color(0xFFA1A1AA),
    onSecondary: Color(0xFF1C1C1F),
    secondaryContainer: Color(0xFF2A2926),
    onSecondaryContainer: Color(0xFFE4E1DB),
    tertiary: AppColors.stampBright,
    onTertiary: Color(0xFF2A1208),
    tertiaryContainer: Color(0xFF4A2418),
    onTertiaryContainer: Color(0xFFF8DED3),
    error: Color(0xFFE8988D),
    onError: Color(0xFF4A1510),
    errorContainer: Color(0xFF5A2620),
    onErrorContainer: Color(0xFFFBE4E0),
    surface: AppColors.charcoal,
    onSurface: Color(0xFFF4F1EC),
    onSurfaceVariant: Color(0xFFA1A1AA),
    outline: Color(0xFF57524C),
    outlineVariant: AppColors.lineDark,
    shadow: Colors.black,
    scrim: Colors.black,
    inverseSurface: AppColors.paper,
    onInverseSurface: AppColors.ink,
    inversePrimary: AppColors.ink,
    surfaceContainerLowest: Color(0xFF101012),
    surfaceContainerLow: AppColors.slate,
    surfaceContainer: AppColors.slateDeep,
    surfaceContainerHigh: Color(0xFF2B2925),
    surfaceContainerHighest: Color(0xFF33302B),
  );
  return _buildTheme(scheme);
}

ThemeData _buildTheme(ColorScheme scheme) {
  final isDark = scheme.brightness == Brightness.dark;
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: scheme.surface,
    textTheme: _buildTextTheme(scheme),
    // Kill every Material touch feedback channel globally.
    splashFactory: NoSplash.splashFactory,
    splashColor: Colors.transparent,
    highlightColor: Colors.transparent,
    hoverColor: Colors.transparent,
    focusColor: Colors.transparent,
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {
        TargetPlatform.android: AppPageTransitionsBuilder(),
        TargetPlatform.iOS: AppPageTransitionsBuilder(),
        TargetPlatform.macOS: AppPageTransitionsBuilder(),
        TargetPlatform.windows: AppPageTransitionsBuilder(),
        TargetPlatform.linux: AppPageTransitionsBuilder(),
      },
    ),
    appBarTheme: AppBarTheme(
      backgroundColor: scheme.surface,
      foregroundColor: scheme.onSurface,
      elevation: 0,
      scrolledUnderElevation: 0,
      systemOverlayStyle:
          isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    ),
    dividerTheme: DividerThemeData(
      color: scheme.outlineVariant,
      thickness: 1,
      space: 1,
    ),
    visualDensity: VisualDensity.standard,
  );
}
