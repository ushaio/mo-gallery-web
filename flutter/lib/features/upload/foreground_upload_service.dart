/// Optional foreground upload indicator.
///
/// P0 keeps this as a no-op so Android builds do not depend on
/// flutter_foreground_task (which pulls an old AGP and often fails to
/// download Google Maven artifacts on restricted networks).
///
/// Queue persistence + app-resume still recover pending uploads.
class ForegroundUploadService {
  static Future<void> init() async {}

  static Future<void> sync({
    required bool active,
    required String detail,
  }) async {
    // Intentionally empty for P0.
  }
}
