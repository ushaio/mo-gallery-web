import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../app/ui.dart';
import '../../core/auth/session.dart';
import '../../core/error/error_messages.dart';
import '../../l10n/strings.dart';

String _serverHost(String? serverUrl) {
  if (serverUrl == null || serverUrl.isEmpty) return '—';
  final host = Uri.tryParse(serverUrl)?.host;
  return host?.isNotEmpty == true ? host! : serverUrl;
}

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  Future<void> _showEnvironmentSwitcher(
    BuildContext context,
    WidgetRef ref,
  ) async {
    await showAppSheet<void>(
      context: context,
      builder: (context) => const _EnvironmentSwitcherSheet(),
    );
  }

  Future<void> _logout(BuildContext context, WidgetRef ref, String lang) async {
    final confirmed = await showAppDialog<bool>(
      context: context,
      builder: (dialogContext) => AppDialog(
        title: AppStrings.t('settings.logoutConfirmTitle', lang: lang),
        icon: Icons.logout,
        content: Text(AppStrings.t('settings.logoutConfirmBody', lang: lang)),
        actions: [
          AppButton(
            tone: AppButtonTone.secondary,
            onPressed: () => Navigator.pop(dialogContext, false),
            label: AppStrings.t('common.cancel', lang: lang),
          ),
          AppButton(
            tone: AppButtonTone.danger,
            onPressed: () => Navigator.pop(dialogContext, true),
            label: AppStrings.t('settings.logout', lang: lang),
          ),
        ],
      ),
    );
    if (confirmed != true || !context.mounted) return;
    await ref.read(authControllerProvider.notifier).logout();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lang = ref.watch(languageProvider);
    final session = ref.watch(sessionProvider);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return AppScreen(
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.only(bottom: AppChrome.bottomInset),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 12),
              child: AppPageHeader(
                eyebrow: 'MO GALLERY / REGISTRY',
                title: AppStrings.t('nav.settings', lang: lang),
                trailing: AppCountStamp(
                  value: lang.toUpperCase(),
                  label: AppStrings.t('settings.language', lang: lang),
                  icon: Icons.tune_rounded,
                ),
              ),
            ),
            // Identity card
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Container(
                constraints: const BoxConstraints(minHeight: 112),
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: scheme.inverseSurface,
                  borderRadius: BorderRadius.circular(AppRadius.large),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 58,
                      height: 58,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: scheme.tertiary,
                        borderRadius: BorderRadius.circular(AppRadius.large),
                      ),
                      child: Text(
                        (session?.username.isNotEmpty == true
                                ? session!.username
                                : '?')
                            .characters
                            .first
                            .toUpperCase(),
                        style: theme.textTheme.headlineSmall?.copyWith(
                          color: scheme.onInverseSurface,
                          fontFamily: 'serif',
                          fontSize: 25,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            session?.displayName ?? '—',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: scheme.onInverseSurface,
                              fontSize: 17,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 3),
                          Text(
                            session?.serverUrl ?? '—',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: scheme.onInverseSurface
                                  .withValues(alpha: 0.7),
                              fontSize: 10,
                            ),
                          ),
                          const SizedBox(height: 7),
                          Row(
                            children: [
                              const DecoratedBox(
                                decoration: BoxDecoration(
                                  color: AppColors.success,
                                  shape: BoxShape.circle,
                                ),
                                child: SizedBox(width: 7, height: 7),
                              ),
                              const SizedBox(width: 6),
                              Text(
                                AppStrings.t('settings.connected', lang: lang),
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: scheme.onInverseSurface
                                      .withValues(alpha: 0.8),
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              child: AppCard(
                tone: AppCardTone.accent,
                outlined: true,
                radius: 14,
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                onTap: () => _showEnvironmentSwitcher(context, ref),
                semanticLabel: AppStrings.t('settings.environment', lang: lang),
                child: Row(
                  children: [
                    Icon(Icons.hub_outlined, size: 18, color: scheme.tertiary),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        AppStrings.t('settings.environment', lang: lang),
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: scheme.onTertiaryContainer,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Flexible(
                      child: Text(
                        session?.displayName ?? '—',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.end,
                        style: theme.textTheme.labelMedium?.copyWith(
                          color: scheme.onTertiaryContainer,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Icon(
                      Icons.chevron_right,
                      size: 18,
                      color: scheme.onTertiaryContainer,
                    ),
                  ],
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: [
                  _SettingRow(
                    icon: Icons.dns_outlined,
                    label: AppStrings.t('settings.server', lang: lang),
                    value: _serverHost(session?.serverUrl),
                  ),
                  const AppDivider(),
                  _SettingRow(
                    icon: Icons.person_outline,
                    label: AppStrings.t('settings.account', lang: lang),
                    value: session?.username ?? '—',
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
              child: SizedBox(
                height: 62,
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        AppStrings.t('settings.language', lang: lang),
                        style: theme.textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    SizedBox(
                      width: 220,
                      child: _LanguageControl(
                        language: lang,
                        onChanged: (value) {
                          ref.read(languageProvider.notifier).state = value;
                        },
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Sign out
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
              child: AppButton(
                onPressed:
                    session == null ? null : () => _logout(context, ref, lang),
                tone: AppButtonTone.danger,
                outlined: true,
                expand: true,
                icon: Icons.logout,
                label: AppStrings.t('settings.logout', lang: lang),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: Text(
                AppStrings.t('settings.logoutDescription', lang: lang),
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LanguageControl extends StatelessWidget {
  const _LanguageControl({
    required this.language,
    required this.onChanged,
  });

  final String language;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final labels = <(String, String)>[
      ('zh', AppStrings.t('settings.lang.zh', lang: language)),
      ('en', AppStrings.t('settings.lang.en', lang: language)),
    ];

    return Container(
      height: 42,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: scheme.surfaceContainer,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        children: [
          for (final item in labels)
            Expanded(
              child: AppPressable(
                onTap: () => onChanged(item.$1),
                semanticLabel: item.$2,
                scale: 0.96,
                child: AnimatedContainer(
                  duration: AppMotion.medium,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: item.$1 == language
                        ? scheme.surfaceContainerLow
                        : Colors.transparent,
                    borderRadius: BorderRadius.circular(7),
                    border: item.$1 == language
                        ? Border.all(color: scheme.outlineVariant)
                        : null,
                  ),
                  child: Text(
                    item.$2,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: item.$1 == language
                              ? scheme.onSurface
                              : scheme.onSurfaceVariant,
                          fontWeight: item.$1 == language
                              ? FontWeight.w700
                              : FontWeight.w500,
                        ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _SettingRow extends StatelessWidget {
  const _SettingRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final content = Container(
      constraints: const BoxConstraints(minHeight: 56),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: scheme.surfaceContainer,
              borderRadius: BorderRadius.circular(AppRadius.small),
            ),
            child: Icon(icon, size: 18, color: scheme.onSurfaceVariant),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              label,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 180),
            child: Text(
              value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.right,
              style: theme.textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );

    return Semantics(
      container: true,
      label: '$label, $value',
      child: content,
    );
  }
}

class _EnvironmentSwitcherSheet extends ConsumerStatefulWidget {
  const _EnvironmentSwitcherSheet();

  @override
  ConsumerState<_EnvironmentSwitcherSheet> createState() =>
      _EnvironmentSwitcherSheetState();
}

class _EnvironmentSwitcherSheetState
    extends ConsumerState<_EnvironmentSwitcherSheet> {
  String? _switchingId;
  String? _error;

  Future<void> _switch(Session target) async {
    if (_switchingId != null) return;
    setState(() {
      _switchingId = target.environmentId;
      _error = null;
    });
    try {
      final router = GoRouter.of(context);
      await ref
          .read(authControllerProvider.notifier)
          .switchEnvironment(target.environmentId);
      if (!mounted) return;
      Navigator.of(context).pop();
      if (target.isAuthenticated) {
        router.go('/upload');
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _switchingId = null;
        _error = mapErrorMessage(
          error,
          lang: ref.read(languageProvider),
        );
      });
    }
  }

  Future<void> _addEnvironment() async {
    if (_switchingId != null) return;
    final profile = await showAppDialog<_EnvironmentDraft>(
      context: context,
      builder: (context) => const _AddEnvironmentDialog(),
    );
    if (profile == null || !mounted) return;

    setState(() {
      _switchingId = 'new';
      _error = null;
    });
    try {
      final controller = ref.read(authControllerProvider.notifier);
      await controller.addEnvironment(
        name: profile.name,
        serverUrl: profile.serverUrl,
        jwtSecret: profile.jwtSecret,
        username: profile.username,
        password: profile.password,
      );
      if (mounted) {
        Navigator.of(context).pop();
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _switchingId = null;
        _error = error is ArgumentError
            ? AppStrings.t(
                'settings.environmentRequired',
                lang: ref.read(languageProvider),
              )
            : mapErrorMessage(error, lang: ref.read(languageProvider));
      });
    }
  }

  Future<void> _deleteEnvironment(Session target) async {
    if (_switchingId != null) return;
    final lang = ref.read(languageProvider);
    final confirmed = await showAppDialog<bool>(
      context: context,
      builder: (dialogContext) => AppDialog(
        title: AppStrings.t('settings.environmentDeleteTitle', lang: lang),
        icon: Icons.delete_forever_outlined,
        content: Text(
          '${target.displayName}\n\n'
          '${AppStrings.t('settings.environmentDeleteBody', lang: lang)}',
        ),
        actions: [
          AppButton(
            tone: AppButtonTone.secondary,
            onPressed: () => Navigator.pop(dialogContext, false),
            label: AppStrings.t('common.cancel', lang: lang),
          ),
          AppButton(
            tone: AppButtonTone.danger,
            onPressed: () => Navigator.pop(dialogContext, true),
            label: AppStrings.t('common.delete', lang: lang),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    setState(() {
      _switchingId = target.environmentId;
      _error = null;
    });
    try {
      final router = GoRouter.of(context);
      final activeId = ref.read(sessionProvider)?.environmentId;
      await ref
          .read(authControllerProvider.notifier)
          .deleteEnvironment(target.environmentId);
      if (!mounted) return;

      if (activeId == target.environmentId) {
        final next = await ref.read(sessionStoreProvider).readActive();
        if (!mounted) return;
        Navigator.of(context).pop();
        router.go(next?.isAuthenticated == true ? '/upload' : '/login');
        return;
      }

      setState(() => _switchingId = null);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _switchingId = null;
        _error = mapErrorMessage(
          error,
          lang: ref.read(languageProvider),
        );
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final activeId = ref.watch(sessionProvider)?.environmentId;
    final environments = ref.watch(environmentsProvider);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          16,
          0,
          16,
          16 + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 560),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.only(left: 4),
                child: Text(
                  AppStrings.t('settings.environmentTitle', lang: lang),
                  style: theme.textTheme.titleLarge,
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.md),
                AppNotice(
                  message: _error!,
                  icon: Icons.error_outline,
                  isError: true,
                  onDismiss: () => setState(() => _error = null),
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              Flexible(
                child: environments.when(
                  loading: () => const Center(
                    child: Padding(
                      padding: EdgeInsets.all(AppSpacing.xl),
                      child: AppSpinner(),
                    ),
                  ),
                  error: (error, stackTrace) => Center(
                    child: Text(AppStrings.t('error.generic', lang: lang)),
                  ),
                  data: (items) => ListView.separated(
                    shrinkWrap: true,
                    itemCount: items.length,
                    separatorBuilder: (context, index) =>
                        const SizedBox(height: 6),
                    itemBuilder: (context, index) {
                      final item = items[index];
                      final isActive = item.environmentId == activeId;
                      final switching = _switchingId == item.environmentId;
                      return AppChoiceRow(
                        label: item.displayName,
                        subtitle: item.isAuthenticated
                            ? item.serverUrl
                            : AppStrings.t(
                                'settings.environmentNeedsLogin',
                                lang: lang,
                              ),
                        icon: Icons.dns_outlined,
                        selected: isActive,
                        onTap: isActive || _switchingId != null
                            ? null
                            : () => _switch(item),
                        trailing: switching
                            ? const AppSpinner(size: 20)
                            : Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (!isActive)
                                    Icon(
                                      Icons.chevron_right,
                                      color: scheme.onSurfaceVariant,
                                    ),
                                  const SizedBox(width: 4),
                                  AppIconButton(
                                    semanticLabel: AppStrings.t(
                                      'settings.environmentDelete',
                                      lang: lang,
                                    ),
                                    danger: true,
                                    size: 38,
                                    iconSize: 18,
                                    onPressed: _switchingId == null
                                        ? () => _deleteEnvironment(item)
                                        : null,
                                    icon: Icons.delete_outline,
                                  ),
                                ],
                              ),
                      );
                    },
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              AppButton(
                onPressed: _switchingId == null ? _addEnvironment : null,
                icon: Icons.add,
                expand: true,
                label: AppStrings.t('settings.environmentAdd', lang: lang),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _EnvironmentDraft {
  const _EnvironmentDraft({
    required this.name,
    required this.serverUrl,
    required this.jwtSecret,
    required this.username,
    required this.password,
  });

  final String name;
  final String serverUrl;
  final String jwtSecret;
  final String username;
  final String password;
}

class _AddEnvironmentDialog extends StatefulWidget {
  const _AddEnvironmentDialog();

  @override
  State<_AddEnvironmentDialog> createState() => _AddEnvironmentDialogState();
}

class _AddEnvironmentDialogState extends State<_AddEnvironmentDialog> {
  final _nameController = TextEditingController();
  final _serverController = TextEditingController();
  final _secretController = TextEditingController();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscureSecret = true;
  bool _obscurePassword = true;
  String? _validationError;

  @override
  void dispose() {
    _nameController.dispose();
    _serverController.dispose();
    _secretController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  void _submit() {
    final lang =
        Localizations.localeOf(context).languageCode == 'en' ? 'en' : 'zh';
    final fields = [
      _nameController,
      _serverController,
      _secretController,
      _usernameController,
      _passwordController,
    ];
    if (fields.any((controller) => controller.text.trim().isEmpty)) {
      setState(() {
        _validationError =
            AppStrings.t('settings.environmentRequired', lang: lang);
      });
      return;
    }
    setState(() => _validationError = null);
    Navigator.of(context).pop(
      _EnvironmentDraft(
        name: _nameController.text.trim(),
        serverUrl: _serverController.text.trim(),
        jwtSecret: _secretController.text.trim(),
        username: _usernameController.text.trim(),
        password: _passwordController.text,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final lang =
        Localizations.localeOf(context).languageCode == 'en' ? 'en' : 'zh';
    return AppDialog(
      title: AppStrings.t('settings.environmentAdd', lang: lang),
      icon: Icons.hub_outlined,
      content: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 520),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppTextField(
                controller: _nameController,
                autofocus: true,
                textInputAction: TextInputAction.next,
                label: AppStrings.t('settings.environmentName', lang: lang),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _serverController,
                keyboardType: TextInputType.url,
                textInputAction: TextInputAction.next,
                label: AppStrings.t('login.server', lang: lang),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _secretController,
                obscureText: _obscureSecret,
                textInputAction: TextInputAction.next,
                label: AppStrings.t('login.jwtSecret', lang: lang),
                trailing: AppIconButton(
                  onPressed: () => setState(
                    () => _obscureSecret = !_obscureSecret,
                  ),
                  icon: _obscureSecret
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  filled: false,
                  size: 36,
                  iconSize: 18,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _usernameController,
                textInputAction: TextInputAction.next,
                label: AppStrings.t('login.username', lang: lang),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
                label: AppStrings.t('login.password', lang: lang),
                trailing: AppIconButton(
                  semanticLabel: AppStrings.t(
                    _obscurePassword
                        ? 'login.showPassword'
                        : 'login.hidePassword',
                    lang: lang,
                  ),
                  onPressed: () => setState(
                    () => _obscurePassword = !_obscurePassword,
                  ),
                  icon: _obscurePassword
                      ? Icons.visibility_outlined
                      : Icons.visibility_off_outlined,
                  filled: false,
                  size: 36,
                  iconSize: 18,
                ),
              ),
              if (_validationError != null) ...[
                const SizedBox(height: AppSpacing.md),
                AppNotice(
                  message: _validationError!,
                  icon: Icons.error_outline,
                  isError: true,
                ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        AppButton(
          tone: AppButtonTone.secondary,
          onPressed: () => Navigator.of(context).pop(),
          label: AppStrings.t('common.cancel', lang: lang),
        ),
        AppButton(
          onPressed: _submit,
          label: AppStrings.t('common.confirm', lang: lang),
        ),
      ],
    );
  }
}
