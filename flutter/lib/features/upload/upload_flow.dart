import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../app/providers.dart';
import '../../app/ui.dart';
import '../../core/error/error_messages.dart';
import 'upload_models.dart';
import 'upload_preview_page.dart';

/// Resolves the settings a new batch should start from: the in-session working
/// copy when the user already adjusted targets, otherwise the persisted recent
/// targets for the active environment.
Future<UploadBatchSettings> resolveUploadSettings(WidgetRef ref) async {
  final current = ref.read(uploadSettingsProvider);
  if (current != null) return current;
  UploadBatchSettings? recent;
  try {
    recent = await ref.read(recentTargetsProvider).read();
  } catch (_) {
    recent = null;
  }
  final resolved = recent ?? const UploadBatchSettings();
  ref.read(uploadSettingsProvider.notifier).state = resolved;
  return resolved;
}

/// Opens the system photo picker and, when photos were selected, pushes the
/// upload preview flow on the root navigator.
///
/// This is the single entry point for starting an upload, shared by the dock's
/// center action and the upload page's own buttons, so neither has to switch
/// tabs first. Returns the settings the batch was queued with, or null when the
/// user cancelled at any step.
Future<UploadBatchSettings?> startUploadFlow({
  required BuildContext context,
  required WidgetRef ref,
  void Function(String message)? onError,
}) async {
  final lang = ref.read(languageProvider);
  try {
    final settings = await resolveUploadSettings(ref);
    final files = await ImagePicker().pickMultiImage(imageQuality: 100);
    if (files.isEmpty || !context.mounted) return null;

    final result =
        await Navigator.of(context, rootNavigator: true).push<UploadBatchSettings>(
      AppModalRoute(
        builder: (context) => UploadPreviewPage(
          sourcePaths: files.map((file) => file.path).toList(),
          initialSettings: settings,
        ),
      ),
    );
    if (result != null) {
      ref.read(uploadSettingsProvider.notifier).state = result;
    }
    return result;
  } catch (error) {
    final message = mapErrorMessage(error, lang: lang);
    if (onError != null) {
      onError(message);
    } else if (context.mounted) {
      showAppToast(context, message);
    }
    return null;
  }
}
