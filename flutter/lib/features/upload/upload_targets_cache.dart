import '../catalog/catalog_api.dart';

/// In-memory snapshot of the upload target picker catalogs.
///
/// Holds everything the settings sheet fetches from the server (albums,
/// stories, film rolls, storage sources, categories) so that closing and
/// reopening the picker does not re-fetch from the network.
///
/// Deliberately memory-only: the snapshot is discarded when the app process
/// ends (app closed or restarted) and is reset whenever the active
/// environment changes, so catalog data never leaks across servers or
/// survives a restart.
class UploadTargetsCache {
  const UploadTargetsCache({
    required this.albums,
    required this.stories,
    required this.rolls,
    required this.storageSources,
    required this.categories,
  });

  final List<IdName> albums;
  final List<IdName> stories;
  final List<IdName> rolls;
  final List<IdName> storageSources;
  final List<String> categories;
}
