import 'dart:convert';

abstract final class UploadPhotoType {
  static const digital = 'digital';
  static const film = 'film';
}

enum UploadTaskStatus {
  pending,
  checking,
  compressing,
  uploading,
  done,
  error,
  duplicate;

  static UploadTaskStatus fromStorage(String value) {
    return UploadTaskStatus.values.firstWhere(
      (e) => e.name == value,
      orElse: () => UploadTaskStatus.pending,
    );
  }
}

class UploadBatchSettings {
  const UploadBatchSettings({
    this.albumIds = const [],
    this.storyIds = const [],
    this.categories = const [],
    this.photoType = UploadPhotoType.digital,
    this.filmRollId,
    this.storageSourceId,
    this.storagePath = '',
    this.storagePathFull = false,
    this.compressEnabled = true,
    this.maxSizeMb,
    this.showFlag = true,
    this.stripGps = false,
    this.titlePrefix = '',
  });

  final List<String> albumIds;
  final List<String> storyIds;
  final List<String> categories;
  final String photoType;
  final String? filmRollId;
  final String? storageSourceId;
  final String storagePath;
  final bool storagePathFull;
  final bool compressEnabled;
  final double? maxSizeMb;
  final bool showFlag;
  final bool stripGps;
  final String titlePrefix;

  UploadBatchSettings copyWith({
    List<String>? albumIds,
    List<String>? storyIds,
    List<String>? categories,
    String? photoType,
    String? filmRollId,
    bool clearFilmRollId = false,
    String? storageSourceId,
    bool clearStorageSourceId = false,
    String? storagePath,
    bool? storagePathFull,
    bool? compressEnabled,
    double? maxSizeMb,
    bool? showFlag,
    bool? stripGps,
    String? titlePrefix,
  }) {
    final nextPhotoType = photoType ?? this.photoType;
    return UploadBatchSettings(
      albumIds: albumIds ?? this.albumIds,
      storyIds: storyIds ?? this.storyIds,
      categories: categories ?? this.categories,
      photoType: nextPhotoType,
      filmRollId: nextPhotoType != UploadPhotoType.film || clearFilmRollId
          ? null
          : (filmRollId ?? this.filmRollId),
      storageSourceId: clearStorageSourceId
          ? null
          : (storageSourceId ?? this.storageSourceId),
      storagePath: storagePath ?? this.storagePath,
      storagePathFull: storagePathFull ?? this.storagePathFull,
      compressEnabled: compressEnabled ?? this.compressEnabled,
      maxSizeMb: maxSizeMb ?? this.maxSizeMb,
      showFlag: showFlag ?? this.showFlag,
      stripGps: stripGps ?? this.stripGps,
      titlePrefix: titlePrefix ?? this.titlePrefix,
    );
  }

  Map<String, dynamic> toJson() => {
        'albumIds': albumIds,
        'storyIds': storyIds,
        'categories': categories,
        'photoType': photoType,
        'filmRollId': filmRollId,
        'storageSourceId': storageSourceId,
        'storagePath': storagePath,
        'storagePathFull': storagePathFull,
        'compressEnabled': compressEnabled,
        'maxSizeMb': maxSizeMb,
        'showFlag': showFlag,
        'stripGps': stripGps,
        'titlePrefix': titlePrefix,
      };

  factory UploadBatchSettings.fromJson(Map<String, dynamic> json) {
    final photoType = json['photoType'] == UploadPhotoType.film
        ? UploadPhotoType.film
        : UploadPhotoType.digital;
    return UploadBatchSettings(
      albumIds:
          (json['albumIds'] as List?)?.map((e) => '$e').toList() ?? const [],
      storyIds:
          (json['storyIds'] as List?)?.map((e) => '$e').toList() ?? const [],
      categories:
          (json['categories'] as List?)?.map((e) => '$e').toList() ?? const [],
      photoType: photoType,
      filmRollId: photoType == UploadPhotoType.film
          ? json['filmRollId'] as String?
          : null,
      storageSourceId: json['storageSourceId'] as String?,
      storagePath: (json['storagePath'] as String?) ?? '',
      storagePathFull: json['storagePathFull'] == true,
      compressEnabled: json['compressEnabled'] != false,
      maxSizeMb: (json['maxSizeMb'] as num?)?.toDouble(),
      showFlag: json['showFlag'] != false,
      stripGps: json['stripGps'] == true,
      titlePrefix: (json['titlePrefix'] as String?) ?? '',
    );
  }

  String encode() => jsonEncode(toJson());

  factory UploadBatchSettings.decode(String raw) {
    if (raw.isEmpty) return const UploadBatchSettings();
    return UploadBatchSettings.fromJson(
      Map<String, dynamic>.from(jsonDecode(raw) as Map),
    );
  }
}

class UploadTask {
  const UploadTask({
    required this.id,
    this.environmentId = 'legacy',
    required this.batchId,
    required this.localPath,
    required this.fileName,
    required this.fileHash,
    required this.status,
    required this.progress,
    this.errorMessage,
    required this.settingsJson,
    this.photoId,
    this.sortOrder = 0,
    required this.attemptCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String environmentId;
  final String batchId;
  final String localPath;
  final String fileName;
  final String fileHash;
  final UploadTaskStatus status;
  final int progress;
  final String? errorMessage;
  final String settingsJson;
  final String? photoId;
  final int sortOrder;
  final int attemptCount;
  final int createdAt;
  final int updatedAt;

  UploadBatchSettings get settings => UploadBatchSettings.decode(settingsJson);

  UploadTask copyWith({
    String? id,
    String? environmentId,
    String? batchId,
    String? localPath,
    String? fileName,
    String? fileHash,
    UploadTaskStatus? status,
    int? progress,
    String? errorMessage,
    bool clearError = false,
    String? settingsJson,
    String? photoId,
    bool clearPhotoId = false,
    int? sortOrder,
    int? attemptCount,
    int? createdAt,
    int? updatedAt,
  }) {
    return UploadTask(
      id: id ?? this.id,
      environmentId: environmentId ?? this.environmentId,
      batchId: batchId ?? this.batchId,
      localPath: localPath ?? this.localPath,
      fileName: fileName ?? this.fileName,
      fileHash: fileHash ?? this.fileHash,
      status: status ?? this.status,
      progress: progress ?? this.progress,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      settingsJson: settingsJson ?? this.settingsJson,
      photoId: clearPhotoId ? null : (photoId ?? this.photoId),
      sortOrder: sortOrder ?? this.sortOrder,
      attemptCount: attemptCount ?? this.attemptCount,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, Object?> toMap() => {
        'id': id,
        'environment_id': environmentId,
        'batch_id': batchId,
        'local_path': localPath,
        'file_name': fileName,
        'file_hash': fileHash,
        'status': status.name,
        'progress': progress,
        'error_message': errorMessage,
        'settings_json': settingsJson,
        'photo_id': photoId,
        'sort_order': sortOrder,
        'attempt_count': attemptCount,
        'created_at': createdAt,
        'updated_at': updatedAt,
      };

  factory UploadTask.fromMap(Map<String, Object?> map) {
    return UploadTask(
      id: map['id'] as String,
      environmentId: (map['environment_id'] as String?) ?? 'legacy',
      batchId: map['batch_id'] as String,
      localPath: map['local_path'] as String,
      fileName: map['file_name'] as String,
      fileHash: (map['file_hash'] as String?) ?? '',
      status: UploadTaskStatus.fromStorage(map['status'] as String),
      progress: (map['progress'] as int?) ?? 0,
      errorMessage: map['error_message'] as String?,
      settingsJson: (map['settings_json'] as String?) ?? '{}',
      photoId: map['photo_id'] as String?,
      sortOrder:
          (map['sort_order'] as int?) ?? (map['created_at'] as int?) ?? 0,
      attemptCount: (map['attempt_count'] as int?) ?? 0,
      createdAt: (map['created_at'] as int?) ?? 0,
      updatedAt: (map['updated_at'] as int?) ?? 0,
    );
  }
}
