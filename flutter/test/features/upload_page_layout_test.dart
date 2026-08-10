import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mo_gallery_mobile/app/providers.dart';
import 'package:mo_gallery_mobile/app/theme.dart';
import 'package:mo_gallery_mobile/core/db/app_database.dart';
import 'package:mo_gallery_mobile/features/shell/home_shell.dart';
import 'package:mo_gallery_mobile/features/upload/recent_targets_store.dart';
import 'package:mo_gallery_mobile/features/upload/upload_models.dart';
import 'package:mo_gallery_mobile/features/upload/upload_page.dart';
import 'package:mo_gallery_mobile/features/upload/upload_queue_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

void main() {
  setUpAll(() {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  });

  testWidgets('upload queue and dock fit the mobile prototype viewport', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(390, 892);
    addTearDown(tester.view.reset);

    SharedPreferences.setMockInitialValues({});
    final prefs = await SharedPreferences.getInstance();
    final database = AppDatabase(
      factory: databaseFactoryFfi,
      path: inMemoryDatabasePath,
    );
    final queue = UploadQueueRepository(database, environmentId: 'preview');
    final previewDir = await Directory.systemTemp.createTemp(
      'mo-gallery-upload-preview-',
    );
    addTearDown(() async {
      await queue.dispose();
      await database.close();
      await previewDir.delete(recursive: true);
    });

    final paths = <String>[
      await _writePreview(previewDir, 'uploading.png', const Color(0xFF8E7563)),
      await _writePreview(previewDir, 'pending.png', const Color(0xFF627D83)),
      await _writePreview(previewDir, 'failed.png', const Color(0xFF8D5E57)),
    ];
    await queue.enqueue(
      items: [
        (
          taskId: 'uploading',
          sandboxPath: paths[0],
          fileName: 'IMG_4821.JPG',
          fileHash: 'hash-uploading',
        ),
        (
          taskId: 'pending',
          sandboxPath: paths[1],
          fileName: '海风笔记.HEIC',
          fileHash: 'hash-pending',
        ),
        (
          taskId: 'failed',
          sandboxPath: paths[2],
          fileName: '旧城门廊.JPG',
          fileHash: 'hash-failed',
        ),
      ],
      settings: const UploadBatchSettings(
        albumIds: ['coast'],
        categories: ['landscape'],
      ),
      batchId: 'preview-batch',
    );
    final tasks = await queue.listAll();
    for (final task in tasks) {
      final updated = switch (task.id) {
        'uploading' => task.copyWith(
            status: UploadTaskStatus.uploading,
            progress: 72,
          ),
        'failed' => task.copyWith(
            status: UploadTaskStatus.error,
            errorMessage: '连接中断，请检查网络后重试',
          ),
        _ => task,
      };
      await queue.updateTask(updated);
    }

    final router = GoRouter(
      initialLocation: '/upload',
      routes: [
        StatefulShellRoute.indexedStack(
          builder: (context, state, shell) {
            return HomeShell(navigationShell: shell);
          },
          branches: [
            StatefulShellBranch(
              routes: [
                GoRoute(
                  path: '/upload',
                  builder: (context, state) => const UploadPage(),
                ),
              ],
            ),
            for (final path in ['/gallery', '/stories', '/settings'])
              StatefulShellBranch(
                routes: [
                  GoRoute(
                    path: path,
                    builder: (context, state) => const SizedBox.expand(),
                  ),
                ],
              ),
          ],
        ),
      ],
    );
    addTearDown(router.dispose);

    const previewKey = ValueKey('upload-page-preview');
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          uploadQueueProvider.overrideWithValue(queue),
          recentTargetsProvider.overrideWithValue(
            RecentTargetsStore(environmentId: 'preview', prefs: prefs),
          ),
        ],
        child: MaterialApp.router(
          theme: buildLightTheme(),
          routerConfig: router,
          builder: (context, child) {
            return RepaintBoundary(
              key: previewKey,
              child: child ?? const SizedBox.shrink(),
            );
          },
        ),
      ),
    );
    await tester.pump(const Duration(milliseconds: 700));

    expect(tester.takeException(), isNull);
    expect(find.text('照片队列'), findsOneWidget);
    expect(find.text('IMG_4821.JPG'), findsOneWidget);
    expect(find.text('上传'), findsOneWidget);

    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(previewKey),
    );
    final image = await boundary.toImage(pixelRatio: 2);
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    final screenshot = File(
      '${Directory.current.path}/build/test-screenshots/upload-page.png',
    );
    await screenshot.parent.create(recursive: true);
    await screenshot.writeAsBytes(bytes!.buffer.asUint8List());

    await tester.tap(find.text('需处理 1').last);
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('旧城门廊.JPG'), findsOneWidget);
    expect(find.text('IMG_4821.JPG'), findsNothing);
    expect(tester.takeException(), isNull);
  });
}

Future<String> _writePreview(
  Directory directory,
  String name,
  Color color,
) async {
  final recorder = ui.PictureRecorder();
  final canvas = Canvas(recorder);
  canvas.drawRect(
    const Rect.fromLTWH(0, 0, 144, 168),
    Paint()..color = color,
  );
  canvas.drawCircle(
    const Offset(104, 44),
    30,
    Paint()..color = Colors.white.withValues(alpha: 0.28),
  );
  final image = await recorder.endRecording().toImage(144, 168);
  final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
  final file = File('${directory.path}/$name');
  await file.writeAsBytes(bytes!.buffer.asUint8List());
  return file.path;
}
