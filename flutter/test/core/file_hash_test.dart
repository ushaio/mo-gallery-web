import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mo_gallery_mobile/core/files/file_hash.dart';

void main() {
  test('sha256File matches known vector for abc', () async {
    final file = File('${Directory.systemTemp.path}/mo_gallery_hash_abc.bin');
    await file.writeAsBytes([0x61, 0x62, 0x63]);
    addTearDown(() async {
      if (await file.exists()) await file.delete();
    });

    final hash = await sha256File(file.path);
    expect(
      hash,
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
}
