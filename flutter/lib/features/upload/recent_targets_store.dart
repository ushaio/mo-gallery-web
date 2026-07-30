import 'package:shared_preferences/shared_preferences.dart';

import 'upload_models.dart';

class RecentTargetsStore {
  RecentTargetsStore({
    required this.environmentId,
    SharedPreferences? prefs,
  }) : _prefs = prefs;

  final String environmentId;
  SharedPreferences? _prefs;
  static const _legacyKey = 'recent_upload_targets_v1';

  String get _key => 'recent_upload_targets_v2:$environmentId';

  Future<SharedPreferences> _ensure() async {
    return _prefs ??= await SharedPreferences.getInstance();
  }

  Future<UploadBatchSettings?> read() async {
    final prefs = await _ensure();
    var raw = prefs.getString(_key);
    if ((raw == null || raw.isEmpty) && environmentId == 'legacy') {
      raw = prefs.getString(_legacyKey);
      if (raw != null && raw.isNotEmpty) {
        await prefs.setString(_key, raw);
        await prefs.remove(_legacyKey);
      }
    }
    if (raw == null || raw.isEmpty) return null;
    return UploadBatchSettings.decode(raw);
  }

  Future<void> write(UploadBatchSettings settings) async {
    final prefs = await _ensure();
    await prefs.setString(_key, settings.encode());
  }

  Future<void> clear() async {
    final prefs = await _ensure();
    await prefs.remove(_key);
    if (environmentId == 'legacy') {
      await prefs.remove(_legacyKey);
    }
  }
}
