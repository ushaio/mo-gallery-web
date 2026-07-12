import '../../core/api/api_client.dart';
import '../../core/api/envelope.dart';

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
  return raw.whereType<Map>().map((item) {
    final map = Map<String, dynamic>.from(item);
    final name = (map[nameKey] as String?) ??
        (map[fallbackNameKey] as String?) ??
        '';
    return IdName(id: '${map['id'] ?? ''}', name: name);
  }).where((e) => e.id.isNotEmpty).toList();
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
