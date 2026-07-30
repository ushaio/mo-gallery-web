import '../../core/api/api_client.dart';
import '../../core/api/envelope.dart';
import '../upload/photos_api.dart';

class IdName {
  const IdName({required this.id, required this.name});

  final String id;
  final String name;
}

List<IdName> parseIdNameList(
  Object? raw, {
  String nameKey = 'name',
  String fallbackNameKey = 'title',
}) {
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((item) {
        final map = Map<String, dynamic>.from(item);
        final name = (map[nameKey] as String?) ??
            (map[fallbackNameKey] as String?) ??
            '';
        return IdName(id: '${map['id'] ?? ''}', name: name);
      })
      .where((e) => e.id.isNotEmpty)
      .toList();
}

class AlbumsApi {
  AlbumsApi(this.client);

  final ApiClient client;

  Future<List<IdName>> list() async {
    final json = await client.getJson('/admin/albums');
    return parseDataEnvelope(json, parseIdNameList);
  }

  Future<void> addPhotos(String albumId, List<String> photoIds) async {
    if (photoIds.isEmpty) return;
    await client.postJson(
      '/admin/albums/${Uri.encodeComponent(albumId)}/photos',
      body: {'photoIds': photoIds},
    );
  }
}

class StoriesApi {
  StoriesApi(this.client);

  final ApiClient client;

  Future<List<IdName>> list() async {
    final json = await client.getJson('/admin/stories');
    return parseDataEnvelope(
      json,
      (raw) => parseIdNameList(raw, nameKey: 'title', fallbackNameKey: 'name'),
    );
  }

  Future<void> addPhotos(String storyId, List<String> photoIds) async {
    if (photoIds.isEmpty) return;
    await client.postJson(
      '/admin/stories/${Uri.encodeComponent(storyId)}/photos',
      body: {'photoIds': photoIds},
    );
  }
}

class FilmRollsApi {
  FilmRollsApi(this.client);

  final ApiClient client;

  Future<List<IdName>> list() async {
    final json = await client.getJson('/film-rolls');
    return parseDataEnvelope(json, parseIdNameList);
  }

  Future<void> addPhotos(String rollId, List<String> photoIds) async {
    if (photoIds.isEmpty) return;
    await client.postJson(
      '/admin/film-rolls/${Uri.encodeComponent(rollId)}/photos',
      body: {'photoIds': photoIds},
    );
  }
}

class StorageSourcesApi {
  StorageSourcesApi(this.client);

  final ApiClient client;

  Future<List<IdName>> list() async {
    final json = await client.getJson('/admin/storage-sources');
    return parseDataEnvelope(json, parseIdNameList);
  }
}

class StoryCoverCrop {
  const StoryCoverCrop({
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  final double x;
  final double y;
  final double width;
  final double height;

  factory StoryCoverCrop.fromJson(Map<String, dynamic> json) {
    return StoryCoverCrop(
      x: (json['x'] as num?)?.toDouble() ?? 0,
      y: (json['y'] as num?)?.toDouble() ?? 0,
      width: (json['width'] as num?)?.toDouble() ?? 1,
      height: (json['height'] as num?)?.toDouble() ?? 1,
    );
  }
}

class StoryDto {
  const StoryDto({
    required this.id,
    required this.title,
    required this.content,
    required this.isPublished,
    required this.photos,
    this.contentJson,
    this.coverPhotoId,
    this.coverCrop,
    this.storyDate,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String title;
  final String content;
  final Map<String, dynamic>? contentJson;
  final String? coverPhotoId;
  final StoryCoverCrop? coverCrop;
  final bool isPublished;
  final DateTime? storyDate;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final List<PhotoDto> photos;

  PhotoDto? get coverPhoto {
    final coverId = coverPhotoId;
    if (coverId != null) {
      for (final photo in photos) {
        if (photo.id == coverId) return photo;
      }
    }
    return photos.isEmpty ? null : photos.first;
  }

  DateTime? get displayDate => storyDate ?? createdAt;

  factory StoryDto.fromJson(Map<String, dynamic> json) {
    final rawContentJson = json['contentJson'];
    final rawCrop = json['coverCrop'];
    return StoryDto(
      id: '${json['id'] ?? ''}',
      title: (json['title'] as String?) ?? '',
      content: (json['content'] as String?) ?? '',
      contentJson: rawContentJson is Map
          ? Map<String, dynamic>.from(rawContentJson)
          : null,
      coverPhotoId: json['coverPhotoId'] as String?,
      coverCrop: rawCrop is Map
          ? StoryCoverCrop.fromJson(Map<String, dynamic>.from(rawCrop))
          : null,
      isPublished: json['isPublished'] == true,
      storyDate: parseApiDate(json['storyDate']),
      createdAt: parseApiDate(json['createdAt']),
      updatedAt: parseApiDate(json['updatedAt']),
      photos: (json['photos'] as List? ?? const [])
          .whereType<Map>()
          .map((item) => PhotoDto.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
    );
  }
}

class StoryBrowseApi {
  StoryBrowseApi(this.client);

  final ApiClient client;

  Future<List<StoryDto>> listStories() async {
    final json = await client.getJson('/admin/stories');
    return parseDataEnvelope(
      json,
      (raw) => (raw as List? ?? const [])
          .whereType<Map>()
          .map((item) => StoryDto.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
    );
  }

  Future<StoryDto> getStory(String id) async {
    final json = await client.getJson(
      '/admin/stories/${Uri.encodeComponent(id)}',
    );
    return parseDataEnvelope(
      json,
      (raw) => StoryDto.fromJson(Map<String, dynamic>.from(raw as Map)),
    );
  }
}

String storyPlainText(String content) {
  return content
      .replaceAll(
          RegExp(r'<(script|style)[^>]*>[\s\S]*?</\1>', caseSensitive: false),
          ' ')
      .replaceAll(RegExp(r'<[^>]+>'), ' ')
      .replaceAll('&nbsp;', ' ')
      .replaceAll('&amp;', '&')
      .replaceAll('&lt;', '<')
      .replaceAll('&gt;', '>')
      .replaceAll('&quot;', '"')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
}

String storyPreview(String content, {int maxLength = 140}) {
  final text = storyPlainText(content);
  if (text.length <= maxLength) return text;
  return '${text.substring(0, maxLength).trimRight()}…';
}

String hydrateStoryImages(
  StoryDto story, {
  required String serverUrl,
}) {
  var html = story.content;
  final imagePattern = RegExp(
    r'''<img\b[^>]*data-photo-id=["']([^"']+)["'][^>]*>''',
    caseSensitive: false,
  );
  html = html.replaceAllMapped(imagePattern, (match) {
    final id = match.group(1);
    PhotoDto? photo;
    for (final candidate in story.photos) {
      if (candidate.id == id) {
        photo = candidate;
        break;
      }
    }
    if (photo == null) return match.group(0)!;
    final source = resolveAssetUrl(photo.url, serverUrl: serverUrl);
    final tag = match.group(0)!.replaceFirst(
          RegExp(r'''\s+src=["'][^"']*["']''', caseSensitive: false),
          '',
        );
    return tag.replaceFirst('<img', '<img src="$source"');
  });

  return html.replaceAllMapped(
    RegExp(r'''\bsrc=["']([^"']+)["']''', caseSensitive: false),
    (match) => 'src="${resolveAssetUrl(match.group(1), serverUrl: serverUrl)}"',
  );
}
