import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../l10n/strings.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionProvider);

    return Scaffold(
      appBar: AppBar(title: Text(AppStrings.t('nav.settings', lang: lang))),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ListTile(
            title: Text(AppStrings.t('settings.server', lang: lang)),
            subtitle: Text(session?.serverUrl ?? '—'),
          ),
          ListTile(
            title: Text(AppStrings.t('settings.account', lang: lang)),
            subtitle: Text(session?.username ?? '—'),
          ),
          const Divider(),
          ListTile(
            title: Text(AppStrings.t('settings.language', lang: lang)),
            subtitle: Text(
              lang == 'en'
                  ? AppStrings.t('settings.lang.en', lang: lang)
                  : AppStrings.t('settings.lang.zh', lang: lang),
            ),
            trailing: SegmentedButton<String>(
              segments: [
                ButtonSegment(
                  value: 'zh',
                  label: Text(AppStrings.t('settings.lang.zh', lang: lang)),
                ),
                ButtonSegment(
                  value: 'en',
                  label: Text(AppStrings.t('settings.lang.en', lang: lang)),
                ),
              ],
              selected: {lang},
              onSelectionChanged: (values) {
                ref.read(languageProvider.notifier).state = values.first;
              },
            ),
          ),
          const SizedBox(height: 24),
          FilledButton.tonalIcon(
            onPressed: session == null
                ? null
                : () => ref.read(authControllerProvider.notifier).logout(),
            icon: const Icon(Icons.logout),
            label: Text(AppStrings.t('settings.logout', lang: lang)),
          ),
        ],
      ),
    );
  }
}
