import 'dart:convert';
import 'dart:io';

import 'package:exif/exif.dart';

/// Reads EXIF from the original file before client-side compression.
///
/// Browser-side compression loses EXIF, so the server accepts this normalized
/// JSON shape through `exif_json`. Values are intentionally conservative: an
/// unreadable tag is omitted and the upload is allowed to continue.
Future<String?> extractExifJson(String path, {required bool stripGps}) async {
  try {
    final bytes = await File(path).readAsBytes();
    final tags = await readExifFromBytes(bytes);
    final payload = <String, dynamic>{};

    void put(String key, Iterable<String> names) {
      for (final name in names) {
        final value = tags[name]?.printable.trim();
        if (value != null && value.isNotEmpty) {
          payload[key] = value;
          return;
        }
      }
    }

    put('cameraMake', const ['Image Make', 'EXIF Make']);
    put('cameraModel', const ['Image Model', 'EXIF Model']);
    put('lens', const ['EXIF LensModel', 'EXIF Lens Model']);
    put('focalLength', const ['EXIF FocalLength']);
    put('aperture', const ['EXIF FNumber']);
    put('shutterSpeed', const ['EXIF ExposureTime']);
    put('takenAt', const ['EXIF DateTimeOriginal', 'Image DateTime']);

    final iso = tags['EXIF ISOSpeedRatings']?.printable.trim();
    final isoNumber = int.tryParse(iso ?? '');
    if (isoNumber != null) payload['iso'] = isoNumber;

    if (!stripGps) {
      final latitude = tags['GPS GPSLatitude']?.printable.trim();
      final longitude = tags['GPS GPSLongitude']?.printable.trim();
      if (latitude != null && longitude != null && latitude.isNotEmpty && longitude.isNotEmpty) {
        payload['gps'] = jsonEncode({
          'latitude': latitude,
          'longitude': longitude,
        });
      }
    }

    return payload.isEmpty ? null : jsonEncode(payload);
  } catch (_) {
    return null;
  }
}
