import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/login_page.dart';
import '../features/gallery/gallery_page.dart';
import '../features/settings/settings_page.dart';
import '../features/shell/home_shell.dart';
import '../features/stories/story_pages.dart';
import '../features/upload/upload_page.dart';
import 'providers.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();
final _uploadNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'upload');
final _galleryNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'gallery');
final _storiesNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'stories');
final _settingsNavigatorKey = GlobalKey<NavigatorState>(debugLabel: 'settings');

CustomTransitionPage<void> _fadePage({
  required LocalKey key,
  required Widget child,
}) {
  return CustomTransitionPage<void>(
    key: key,
    child: child,
    transitionDuration: const Duration(milliseconds: 180),
    reverseTransitionDuration: const Duration(milliseconds: 140),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return FadeTransition(
        opacity: CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
        child: child,
      );
    },
  );
}

final routerProvider = Provider<GoRouter>((ref) {
  final authListenable = ref.watch(authListenableProvider);

  return GoRouter(
    navigatorKey: _rootNavigatorKey,
    initialLocation: '/session',
    refreshListenable: authListenable,
    redirect: (context, state) {
      final auth = ref.read(authControllerProvider);
      final restoring = state.matchedLocation == '/session';
      if (auth.isLoading) return restoring ? null : '/session';
      final loggedIn = auth.valueOrNull != null;
      final loggingIn = state.matchedLocation == '/login';
      if (restoring) return loggedIn ? '/upload' : '/login';
      if (!loggedIn && !loggingIn) return '/login';
      if (loggedIn && loggingIn) return '/upload';
      return null;
    },
    routes: [
      GoRoute(
        path: '/session',
        pageBuilder: (context, state) => _fadePage(
          key: state.pageKey,
          child: const SessionGatePage(),
        ),
      ),
      GoRoute(
        path: '/login',
        pageBuilder: (context, state) => _fadePage(
          key: state.pageKey,
          child: const LoginPage(),
        ),
      ),
      // Indexed stack keeps each tab's Element tree alive across switches.
      // Use `builder` (not pageBuilder) for branch roots so pages are not
      // recreated with a new pageKey on every goBranch().
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) {
          return HomeShell(navigationShell: navigationShell);
        },
        branches: [
          StatefulShellBranch(
            navigatorKey: _uploadNavigatorKey,
            routes: [
              GoRoute(
                path: '/upload',
                builder: (context, state) => const UploadPage(),
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _galleryNavigatorKey,
            routes: [
              GoRoute(
                path: '/gallery',
                builder: (context, state) => const GalleryPage(),
                routes: [
                  GoRoute(
                    parentNavigatorKey: _rootNavigatorKey,
                    path: ':photoId',
                    pageBuilder: (context, state) {
                      final extra = state.extra;
                      GalleryViewerArgs? args;
                      if (extra is GalleryViewerArgs) {
                        args = extra;
                      }
                      return CustomTransitionPage<void>(
                        key: state.pageKey,
                        opaque: true,
                        transitionDuration: const Duration(milliseconds: 220),
                        reverseTransitionDuration:
                            const Duration(milliseconds: 180),
                        transitionsBuilder: (
                          context,
                          animation,
                          secondaryAnimation,
                          child,
                        ) {
                          return FadeTransition(
                            opacity: CurvedAnimation(
                              parent: animation,
                              curve: Curves.easeOutCubic,
                            ),
                            child: child,
                          );
                        },
                        child: PhotoDetailPage(
                          photoId: Uri.decodeComponent(
                            state.pathParameters['photoId'] ?? '',
                          ),
                          initialPhotos: args?.photos,
                          initialIndex: args?.initialIndex,
                        ),
                      );
                    },
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _storiesNavigatorKey,
            routes: [
              GoRoute(
                path: '/stories',
                builder: (context, state) => const StoriesPage(),
                routes: [
                  GoRoute(
                    parentNavigatorKey: _rootNavigatorKey,
                    path: ':storyId',
                    pageBuilder: (context, state) => _fadePage(
                      key: state.pageKey,
                      child: StoryDetailPage(
                        storyId: state.pathParameters['storyId'] ?? '',
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            navigatorKey: _settingsNavigatorKey,
            routes: [
              GoRoute(
                path: '/settings',
                builder: (context, state) => const SettingsPage(),
              ),
            ],
          ),
        ],
      ),
    ],
  );
});
