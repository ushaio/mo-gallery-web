import 'dart:io';

import 'package:crypto/crypto.dart';

Future<String> sha256File(String path) async {
  final file = File(path);
  final digest = await sha256.bind(file.openRead()).single;
  return digest.toString();
}

String sha256Bytes(List<int> bytes) {
  return sha256.convert(bytes).toString();
}
