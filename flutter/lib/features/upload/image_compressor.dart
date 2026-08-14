import 'dart:io';

import 'package:flutter_image_compress/flutter_image_compress.dart';

/// Compresses an upload to WebP on the device.
///
/// The source remains the durable upload input. The returned file is a sibling
/// in the task sandbox and can be safely replaced on retry.
Future<String> compressImageForUpload({
  required String sourcePath,
  required String outputPath,
  double? maxSizeMb,
}) async {
  final source = File(sourcePath);
  if (!await source.exists()) {
    throw StateError('Upload source does not exist');
  }

  final targetBytes = maxSizeMb != null && maxSizeMb > 0
      ? (maxSizeMb * 1024 * 1024).round()
      : null;
  final qualities = targetBytes == null ? const [85] : const [85, 72, 58, 45];
  final widths = targetBytes == null
      ? const [4096]
      : const [4096, 3200, 2560, 2048];

  String? lastPath;
  for (var index = 0; index < qualities.length; index++) {
    final path = index == 0
        ? outputPath
        : outputPath.replaceFirst(RegExp(r'\.webp$'), '-$index.webp');
    final bytes = await FlutterImageCompress.compressWithFile(
      sourcePath,
      minWidth: widths[index],
      minHeight: widths[index],
      quality: qualities[index],
      format: CompressFormat.webp,
      keepExif: false,
    );
    if (bytes == null || bytes.isEmpty) continue;
    await File(path).writeAsBytes(bytes, flush: true);
    lastPath = path;
    if (targetBytes == null || bytes.length <= targetBytes) return path;
  }

  if (lastPath != null) return lastPath;
  throw StateError('Image compression returned no data');
}
