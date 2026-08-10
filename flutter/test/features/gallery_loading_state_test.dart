import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http_mock_adapter/http_mock_adapter.dart';
import 'package:mo_gallery_mobile/app/providers.dart';
import 'package:mo_gallery_mobile/app/theme.dart';
import 'package:mo_gallery_mobile/app/ui.dart';
import 'package:mo_gallery_mobile/core/api/api_client.dart';
import 'package:mo_gallery_mobile/core/auth/session.dart';
import 'package:mo_gallery_mobile/features/gallery/gallery_page.dart';
import 'package:mo_gallery_mobile/features/stories/stories_page.dart';

const _session = Session(
  serverUrl: 'https://example.com',
  jwtSecret: 'secret',
  token: 'token',
  username: 'tester',
  isAdmin: true,
);

ApiClient _slowClient() {
  final dio = Dio(BaseOptions(baseUrl: 'https://example.com/api'));
  final adapter = DioAdapter(dio: dio);
  const slow = Duration(seconds: 5);
  adapter
    ..onGet(
      '/admin/photos',
      (server) => server.reply(
        200,
        {'success': true, 'data': <dynamic>[], 'meta': <String, dynamic>{}},
        delay: slow,
      ),
    )
    ..onGet(
      '/categories',
      (server) => server.reply(
        200,
        {'success': true, 'data': <dynamic>[]},
        delay: slow,
      ),
    )
    ..onGet(
      '/admin/stories',
      (server) => server.reply(
        200,
        {'success': true, 'data': <dynamic>[]},
        delay: slow,
      ),
    );
  return ApiClient(baseUrl: 'https://example.com', dio: dio);
}

/// Responds immediately. Reproduces the case where the first page lands before
/// any post-frame delay would fire.
ApiClient _fastClient({List<String> categories = const ['风景', '人文']}) {
  final dio = Dio(BaseOptions(baseUrl: 'https://example.com/api'));
  final adapter = DioAdapter(dio: dio);
  adapter
    ..onGet(
      '/admin/photos',
      (server) => server.reply(200, {
        'success': true,
        'data': [
          {
            'id': 'p1',
            'title': 'Photo one',
            'url': '/uploads/p1.jpg',
            'category': '风景',
            'showFlag': true,
          },
          {
            'id': 'p2',
            'title': 'Photo two',
            'url': '/uploads/p2.jpg',
            'category': '人文',
            'showFlag': true,
          },
        ],
        'meta': {'page': 1, 'pageSize': 30, 'total': 2, 'totalPages': 1},
      }),
    )
    ..onGet(
      '/categories',
      (server) => server.reply(200, {'success': true, 'data': categories}),
    );
  return ApiClient(baseUrl: 'https://example.com', dio: dio);
}

Widget _host(Widget child, {ApiClient? client}) {
  return ProviderScope(
    overrides: [
      apiClientProvider.overrideWithValue(client ?? _slowClient()),
      sessionProvider.overrideWithValue(_session),
    ],
    child: MaterialApp(theme: buildLightTheme(), home: child),
  );
}

void main() {
  testWidgets('gallery first-load skeleton lays out without exceptions', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 892);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(const GalleryPage()));
    await tester.pump(const Duration(milliseconds: 200));

    expect(tester.takeException(), isNull);
    expect(find.byType(AppSkeletonGrid), findsOneWidget);
    expect(
      tester.getSize(find.byType(AppSkeletonGrid)).height,
      greaterThan(100),
    );

    // Let the mocked responses land so the skeleton is replaced and no mock
    // timer outlives the widget tree.
    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    expect(find.byType(AppSkeletonGrid), findsNothing);
  });

  testWidgets('stories first-load skeleton lays out without exceptions', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 892);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(const StoriesPage()));
    await tester.pump(const Duration(milliseconds: 200));

    expect(tester.takeException(), isNull);
    expect(find.byType(AppSkeletonList), findsOneWidget);
    expect(
      tester.getSize(find.byType(AppSkeletonList)).height,
      greaterThan(100),
    );

    await tester.pump(const Duration(seconds: 6));
    await tester.pumpAndSettle();
    expect(find.byType(AppSkeletonList), findsNothing);
  });

  testWidgets('a fast first response is not re-hidden by a delayed skeleton', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 892);
    addTearDown(tester.view.reset);

    // pumpAndSettle is unusable here: the photo placeholders run a looping
    // animation, so the tree never reaches a quiescent state.
    await tester.pumpWidget(_host(const GalleryPage(), client: _fastClient()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(tester.takeException(), isNull);
    expect(find.byType(AppSkeletonGrid), findsNothing);
    expect(find.text('Photo two'), findsOneWidget);

    // Past the old 120ms delayed setState(_loading = true) window: content must
    // stay on screen instead of flipping back to a skeleton.
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(AppSkeletonGrid), findsNothing);
    expect(find.text('Photo two'), findsOneWidget);
  });

  testWidgets('switching a category tab renders photos, not a blank page', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 892);
    addTearDown(tester.view.reset);

    await tester.pumpWidget(_host(const GalleryPage(), client: _fastClient()));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    // The category rail tab, not the photo caption of the same name.
    await tester.tap(
      find.descendant(
        of: find.byType(ListView),
        matching: find.text('人文'),
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 50));

    expect(tester.takeException(), isNull);
    expect(find.byType(AppSkeletonGrid), findsNothing);
    expect(find.text('Photo two'), findsOneWidget);
  });
}
