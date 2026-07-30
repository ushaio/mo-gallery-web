import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/app.dart';
import 'features/upload/foreground_upload_service.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await ForegroundUploadService.init();
  runApp(const ProviderScope(child: MoGalleryApp()));
}
