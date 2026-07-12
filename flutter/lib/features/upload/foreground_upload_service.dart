import 'package:flutter_foreground_task/flutter_foreground_task.dart';

@pragma('vm:entry-point')
void uploadForegroundCallback() {
  FlutterForegroundTask.setTaskHandler(_UploadTaskHandler());
}

class _UploadTaskHandler extends TaskHandler {
  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {}

  @override
  void onRepeatEvent(DateTime timestamp) {}

  @override
  Future<void> onDestroy(DateTime timestamp) async {}
}

class ForegroundUploadService {
  static bool _initialized = false;

  static Future<void> init() async {
    if (_initialized) return;
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'mo_gallery_upload',
        channelName: 'MO Gallery Upload',
        channelDescription: 'Shows upload progress',
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
      ),
      iosNotificationOptions: const IOSNotificationOptions(
        showNotification: false,
        playSound: false,
      ),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.nothing(),
        autoRunOnBoot: false,
        autoRunOnMyPackageReplaced: false,
        allowWakeLock: true,
        allowWifiLock: true,
      ),
    );
    _initialized = true;
  }

  static Future<void> sync({
    required bool active,
    required String detail,
  }) async {
    await init();
    final isRunning = await FlutterForegroundTask.isRunningService;
    if (!active) {
      if (isRunning) {
        await FlutterForegroundTask.stopService();
      }
      return;
    }
    final text = detail.isEmpty ? 'Uploading…' : detail;
    if (isRunning) {
      await FlutterForegroundTask.updateService(
        notificationTitle: 'MO Gallery 上传中',
        notificationText: text,
      );
    } else {
      await FlutterForegroundTask.startService(
        notificationTitle: 'MO Gallery 上传中',
        notificationText: text,
        callback: uploadForegroundCallback,
      );
    }
  }
}
