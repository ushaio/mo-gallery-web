import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

Future<String> copyIntoUploadSandbox(
  String sourcePath, {
  required String taskId,
}) async {
  final docs = await getApplicationDocumentsDirectory();
  final fileName = p.basename(sourcePath);
  final destDir = Directory(p.join(docs.path, 'upload_inbox', taskId));
  if (!await destDir.exists()) {
    await destDir.create(recursive: true);
  }
  final destPath = p.join(destDir.path, fileName);
  await File(sourcePath).copy(destPath);
  return destPath;
}

Future<void> deleteSandboxTaskDir(String taskId) async {
  final docs = await getApplicationDocumentsDirectory();
  final dir = Directory(p.join(docs.path, 'upload_inbox', taskId));
  if (await dir.exists()) {
    await dir.delete(recursive: true);
  }
}
