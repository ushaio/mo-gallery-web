import 'package:dio/dio.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/envelope.dart';

class PhotoDto {
  const PhotoDto({
    required this.id,
    required this.title,
    this.thumbnailUrl,
    this.url,
  });

  final String id;
  final String title;
  final String? thumbnailUrl;
  final String? url;

  factory PhotoDto.fromJson(Map<String, dynamic> json) {
    return PhotoDto(
      id: '${json['id'] ?? ''}',
      title: (json['title'] as String?) ?? '',
      thumbnailUrl: json['thumbnailUrl'] as String? ?? json['thumbnail_url'] as String?,
      url: json['url'] as String?,
    );
  }
}

class DuplicateInfo {
  const DuplicateInfo({
    required this.id,
    required this.title,
  });

  final String id;
  final String title;
}

class PhotosApi {
  PhotosApi(this.client);

  final ApiClient client;

  Future<Map<String, DuplicateInfo>> checkDuplicates(List<String> fileHashes) async {
    if (fileHashes.isEmpty) return {};
    final json = await client.postJson(
      '/admin/photos/check-duplicate',
      body: {'fileHashes': fileHashes},
    );
    final data = parseDataEnvelope<Map<String, dynamic>>(
      json,
      (raw) => Map<String, dynamic>.from(raw as Map? ?? const {}),
    );
    final duplicatesRaw = data['duplicates'];
    if (duplicatesRaw is! Map) return {};
    final result = <String, DuplicateInfo>{};
    duplicatesRaw.forEach((key, value) {
      if (value is Map) {
        final map = Map<String, dynamic>.from(value);
        result['$key'] = DuplicateInfo(
          id: '${map['id'] ?? ''}',
          title: (map['title'] as String?) ?? '',
        );
      }
    });
    return result;
  }

  Future<PhotoDto> uploadPhoto({
    required String filePath,
    required String title,
    required String fileHash,
    String? filmRollId,
    bool showFlag = true,
    bool compressEnabled = false,
    double? maxSizeMb,
    bool stripGps = false,
    void Function(int sent, int total)? onSendProgress,
  }) async {
    final form = FormData();
    form.files.add(
      MapEntry(
        'file',
        await MultipartFile.fromFile(filePath, filename: title),
      ),
    );
    form.fields.addAll([
      MapEntry('title', title),
      const MapEntry('origin_flag', 'mobile'),
      MapEntry('file_hash', fileHash),
    ]);
    if (filmRollId != null && filmRollId.isNotEmpty) {
      form.fields.add(MapEntry('film_roll_id', filmRollId));
    }
    if (!showFlag) {
      form.fields.add(const MapEntry('show_flag', 'false'));
    }
    if (compressEnabled) {
      form.fields.add(const MapEntry('compression_mode', 'compress'));
      if (maxSizeMb != null && maxSizeMb > 0) {
        form.fields.add(MapEntry('max_size_mb', maxSizeMb.round().toString()));
      }
    }
    if (stripGps) {
      form.fields.add(const MapEntry('strip_gps', 'true'));
    }

    try {
      final json = await client.postMultipart(
        '/admin/photos',
        form: form,
        onSendProgress: onSendProgress,
      );
      return parseDataEnvelope(
        json,
        (raw) => PhotoDto.fromJson(Map<String, dynamic>.from(raw as Map)),
      );
    } on ApiException {
      rethrow;
    }
  }
}
