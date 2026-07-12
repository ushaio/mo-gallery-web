import 'dart:convert';

enum UploadTaskStatus {
  pending,
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
    this.filmRollId,
    this.compressEnabled = true,
    this.maxSizeMb,
    this.showFlag = true,
    this.stripGps = false,
    this.titlePrefix = '',
  });

  final List<String> albumIds;
  final List<String> storyIds;
  final String? filmRollId;
  final bool compressEnabled;
  final double? maxSizeMb;
  final bool showFlag;
  final bool stripGps;
  final String titlePrefix;

  UploadBatchSettings copyWith({
    List<String>? albumIds,
    List<String>? storyIds,
    String? filmRollId,
    bool clearFilmRollId = false,
    bool? compressEnabled,
    double? maxSizeMb,
    bool? showFlag,
    bool? stripGps,
    String? titlePrefix,
  }) {
    return UploadBatchSettings(
      albumIds: albumIds ?? this.albumIds,
      storyIds: storyIds ?? this.storyIds,
      filmRollId: clearFilmRollId ? null : (filmRollId ?? this.filmRollId),
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
        'filmRollId': filmRollId,
        'compressEnabled': compressEnabled,
        'maxSizeMb': maxSizeMb,
        'showFlag': showFlag,
        'stripGps': stripGps,
        'titlePrefix': titlePrefix,
      };

  factory UploadBatchSettings.fromJson(Map<String, dynamic> json) {
    return UploadBatchSettings(
      albumIds: (json['albumIds'] as List?)?.map((e) => '$e').toList() ?? const [],
      storyIds: (json['storyIds'] as List?)?.map((e) => '$e').toList() ?? const [],
      filmRollId: json['filmRollId'] as String?,
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
    required this.batchId,
    required this.localPath,
    required this.fileName,
    required this.fileHash,
    required this.status,
    required this.progress,
    this.errorMessage,
    required this.settingsJson,
    this.photoId,
    required this.attemptCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String batchId;
  final String localPath;
  final String fileName;
  final String fileHash;
  final UploadTaskStatus status;
  final int progress;
  final String? errorMessage;
  final String settingsJson;
  final String? photoId;
  final int attemptCount;
  final int createdAt;
  final int updatedAt;

  UploadBatchSettings get settings => UploadBatchSettings.decode(settingsJson);

  UploadTask copyWith({
    String? id,
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
    int? attemptCount,
    int? createdAt,
    int? updatedAt,
  }) {
    return UploadTask(
      id: id ?? this.id,
      batchId: batchId ?? this.batchId,
      localPath: localPath ?? this.localPath,
      fileName: fileName ?? this.fileName,
      fileHash: fileHash ?? this.fileHash,
      status: status ?? this.status,
      progress: progress ?? this.progress,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      settingsJson: settingsJson ?? this.settingsJson,
      photoId: clearPhotoId ? null : (photoId ?? this.photoId),
      attemptCount: attemptCount ?? this.attemptCount,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
    );
  }

  Map<String, Object?> toMap() => {
        'id': id,
        'batch_id': batchId,
        'local_path': localPath,
        'file_name': fileName,
        'file_hash': fileHash,
        'status': status.name,
        'progress': progress,
        'error_message': errorMessage,
        'settings_json': settingsJson,
        'photo_id': photoId,
        'attempt_count': attemptCount,
        'created_at': createdAt,
        'updated_at': updatedAt,
      };

  factory UploadTask.fromMap(Map<String, Object?> map) {
    return UploadTask(
      id: map['id'] as String,
      batchId: map['batch_id'] as String,
      localPath: map['local_path'] as String,
      fileName: map['file_name'] as String,
      fileHash: (map['file_hash'] as String?) ?? '',
      status: UploadTaskStatus.fromStorage(map['status'] as String),
      progress: (map['progress'] as int?) ?? 0,
      errorMessage: map['error_message'] as String?,
      settingsJson: (map['settings_json'] as String?) ?? '{}',
      photoId: map['photo_id'] as String?,
      attemptCount: (map['attempt_count'] as int?) ?? 0,
      createdAt: (map['created_at'] as int?) ?? 0,
      updatedAt: (map['updated_at'] as int?) ?? 0,
    );
  }
}
