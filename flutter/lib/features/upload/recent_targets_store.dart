import 'package:shared_preferences/shared_preferences.dart';

import 'upload_models.dart';

class RecentTargetsStore {
  RecentTargetsStore({SharedPreferences? prefs}) : _prefs = prefs;

  SharedPreferences? _prefs;
  static const _key = 'recent_upload_targets_v1';

  Future<SharedPreferences> _ensure() async {
    return _prefs ??= await SharedPreferences.getInstance();
  }

  Future<UploadBatchSettings?> read() async {
    final prefs = await _ensure();
    final raw = prefs.getString(_key);
    if (raw == null || raw.isEmpty) return null;
    return UploadBatchSettings.decode(raw);
  }

  Future<void> write(UploadBatchSettings settings) async {
    final prefs = await _ensure();
    await prefs.setString(_key, settings.encode());
  }
}
