import 'dart:convert';

import 'package:dio/dio.dart';

import '../../core/api/api_client.dart';
import '../../core/api/api_exception.dart';
import '../../core/api/envelope.dart';

class PhotoDto {
  const PhotoDto({
    required this.id,
    required this.title,
    this.category = '',
    this.thumbnailUrl,
    this.url,
    this.photoType,
    this.filmRollName,
    this.originFlag,
    this.width,
    this.height,
    this.size,
    this.isFeatured = false,
    this.showFlag = true,
    this.createdAt,
    this.takenAt,
    this.dominantColors = const [],
    this.cameraModel,
    this.lensModel,
    this.focalLength,
    this.aperture,
    this.shutterSpeed,
    this.iso,
    this.gps,
  });

  final String id;
  final String title;
  final String category;
  final String? thumbnailUrl;
  final String? url;
  final String? photoType;
  final String? filmRollName;
  final String? originFlag;
  final int? width;
  final int? height;
  final int? size;
  final bool isFeatured;
  final bool showFlag;
  final DateTime? createdAt;
  final DateTime? takenAt;
  final List<String> dominantColors;
  final String? cameraModel;
  final String? lensModel;
  final String? focalLength;
  final String? aperture;
  final String? shutterSpeed;
  final int? iso;
  final String? gps;

  static String? _nestedDisplayName(Object? raw) {
    if (raw is! Map) return null;
    final map = Map<String, dynamic>.from(raw);
    return map['displayName'] as String? ?? map['name'] as String?;
  }

  static List<String> _colors(Object? raw) {
    if (raw is List) return raw.map((value) => '$value').toList();
    if (raw is String && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is List) return decoded.map((value) => '$value').toList();
      } catch (_) {}
    }
    return const [];
  }

  factory PhotoDto.fromJson(Map<String, dynamic> json) {
    return PhotoDto(
      id: '${json['id'] ?? ''}',
      title: (json['title'] as String?) ?? '',
      category: (json['category'] as String?) ?? '',
      thumbnailUrl:
          json['thumbnailUrl'] as String? ?? json['thumbnail_url'] as String?,
      url: json['url'] as String?,
      photoType: json['photoType'] as String?,
      filmRollName: json['filmRollName'] as String?,
      originFlag: json['originFlag'] as String?,
      width: (json['width'] as num?)?.toInt(),
      height: (json['height'] as num?)?.toInt(),
      size: (json['size'] as num?)?.toInt(),
      isFeatured: json['isFeatured'] == true,
      showFlag: json['showFlag'] != false,
      createdAt: parseApiDate(json['createdAt']),
      takenAt: parseApiDate(json['takenAt']),
      dominantColors: _colors(json['dominantColors']),
      cameraModel: _nestedDisplayName(json['camera']) ??
          json['cameraModel'] as String? ??
          json['cameraMake'] as String?,
      lensModel:
          _nestedDisplayName(json['lens']) ?? json['lensModel'] as String?,
      focalLength: json['focalLength'] as String?,
      aperture: json['aperture'] as String?,
      shutterSpeed: json['shutterSpeed'] as String?,
      iso: (json['iso'] as num?)?.toInt(),
      gps: json['gps'] as String?,
    );
  }
}

class PhotoPaginationMeta {
  const PhotoPaginationMeta({
    required this.total,
    required this.page,
    required this.pageSize,
    required this.totalPages,
    required this.hasMore,
  });

  final int total;
  final int page;
  final int pageSize;
  final int totalPages;
  final bool hasMore;

  factory PhotoPaginationMeta.fromJson(Map<String, dynamic> json) {
    return PhotoPaginationMeta(
      total: (json['total'] as num?)?.toInt() ?? 0,
      page: (json['page'] as num?)?.toInt() ?? 1,
      pageSize: (json['pageSize'] as num?)?.toInt() ?? 30,
      totalPages: (json['totalPages'] as num?)?.toInt() ?? 1,
      hasMore: json['hasMore'] == true,
    );
  }
}

class PhotoPage {
  const PhotoPage({required this.items, required this.meta});

  final List<PhotoDto> items;
  final PhotoPaginationMeta meta;
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

  Future<Map<String, DuplicateInfo>> checkDuplicates(
      List<String> fileHashes) async {
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
    List<String> categories = const [],
    String? filmRollId,
    String? storageSourceId,
    String? storagePath,
    bool storagePathFull = false,
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
    if (categories.isNotEmpty) {
      form.fields.add(MapEntry('category', categories.join(',')));
    }
    if (filmRollId != null && filmRollId.isNotEmpty) {
      form.fields.add(MapEntry('film_roll_id', filmRollId));
    }
    if (storageSourceId != null && storageSourceId.isNotEmpty) {
      form.fields.add(MapEntry('storage_source_id', storageSourceId));
    }
    if (storagePath != null && storagePath.isNotEmpty) {
      form.fields.add(MapEntry('storage_path', storagePath));
    }
    if (storagePathFull) {
      form.fields.add(const MapEntry('storage_path_full', 'true'));
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

  Future<void> deletePhoto(
    String photoId, {
    bool deleteOriginal = false,
    bool deleteThumbnail = false,
  }) async {
    final json = await client.deleteJson(
      '/admin/photos/${Uri.encodeComponent(photoId)}',
      query: {
        if (deleteOriginal) 'deleteOriginal': 'true',
        if (deleteThumbnail) 'deleteThumbnail': 'true',
      },
    );
    parseDataEnvelope<Object?>(json, (raw) => raw);
  }
}

class GalleryApi {
  GalleryApi(this.client);

  final ApiClient client;

  Future<PhotoPage> listPhotos({
    int page = 1,
    int pageSize = 30,
    String? category,
    String? search,
  }) async {
    final json = await client.getJson(
      '/admin/photos',
      query: {
        'page': page,
        'pageSize': pageSize,
        'sortBy': 'takenAt',
        'sortOrder': 'desc',
        if (category != null && category.isNotEmpty) 'category': category,
        if (search != null && search.trim().isNotEmpty) 'search': search.trim(),
      },
    );
    final items = parseDataEnvelope<List<PhotoDto>>(
      json,
      (raw) => (raw as List? ?? const [])
          .whereType<Map>()
          .map((item) => PhotoDto.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
    );
    final rawMeta = json['meta'];
    final meta = PhotoPaginationMeta.fromJson(
      rawMeta is Map ? Map<String, dynamic>.from(rawMeta) : const {},
    );
    return PhotoPage(items: items, meta: meta);
  }

  Future<PhotoDto> getPhoto(String id) async {
    final json = await client.getJson(
      '/admin/photos/${Uri.encodeComponent(id)}',
    );
    return parseDataEnvelope(
      json,
      (raw) => PhotoDto.fromJson(Map<String, dynamic>.from(raw as Map)),
    );
  }

  Future<List<String>> getCategories() async {
    final json = await client.getJson('/categories');
    return parseDataEnvelope(
      json,
      (raw) => (raw as List? ?? const [])
          .map((item) => '$item')
          .where((item) => item.isNotEmpty && item != '全部' && item != 'all')
          .toList(),
    );
  }
}
