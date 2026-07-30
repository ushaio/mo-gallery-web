import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/auth/session.dart';
import '../../core/error/error_messages.dart';
import '../../l10n/strings.dart';

class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  Future<void> _showEnvironmentSwitcher(
    BuildContext context,
    WidgetRef ref,
  ) async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => const _EnvironmentSwitcherSheet(),
    );
  }

  Future<void> _logout(BuildContext context, WidgetRef ref, String lang) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          AppStrings.t('settings.logoutConfirmTitle', lang: lang),
        ),
        content: Text(
          AppStrings.t('settings.logoutConfirmBody', lang: lang),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(AppStrings.t('common.cancel', lang: lang)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(AppStrings.t('settings.logout', lang: lang)),
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

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.only(bottom: AppChrome.bottomInset),
          children: [
            // Identity plate
            Container(
              width: double.infinity,
              color: scheme.surfaceContainerLow,
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    AppStrings.t('nav.settings', lang: lang).toUpperCase(),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: scheme.primary,
                      letterSpacing: 2.4,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    session?.username ?? '—',
                    style: theme.textTheme.headlineMedium?.copyWith(
                      fontWeight: FontWeight.w900,
                      letterSpacing: -0.8,
                      height: 1.05,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    session?.displayName ??
                        AppStrings.t('settings.environment', lang: lang),
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.tonalIcon(
                          onPressed: () =>
                              _showEnvironmentSwitcher(context, ref),
                          icon: const Icon(Icons.hub_outlined, size: 18),
                          label: Text(
                            AppStrings.t('settings.environment', lang: lang),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      OutlinedButton.icon(
                        onPressed: session == null
                            ? null
                            : () => _logout(context, ref, lang),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: scheme.error,
                          side: BorderSide(
                            color: scheme.error.withValues(alpha: 0.45),
                          ),
                          minimumSize: const Size(0, 48),
                        ),
                        icon: const Icon(Icons.logout, size: 18),
                        label: Text(
                          AppStrings.t('settings.logout', lang: lang),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            // Spec sheet rows
            _SpecRow(
              label: AppStrings.t('settings.server', lang: lang),
              value: session?.serverUrl ?? '—',
            ),
            Divider(
              height: 1,
              color: scheme.outlineVariant.withValues(alpha: 0.5),
            ),
            _SpecRow(
              label: AppStrings.t('settings.account', lang: lang),
              value: session?.username ?? '—',
            ),
            Divider(
              height: 1,
              color: scheme.outlineVariant.withValues(alpha: 0.5),
            ),
            _SpecRow(
              label: AppStrings.t('settings.environment', lang: lang),
              value: session?.displayName ?? '—',
              trailing: const Icon(Icons.chevron_right, size: 18),
              onTap: () => _showEnvironmentSwitcher(context, ref),
            ),
            const SizedBox(height: 20),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                AppStrings.t('settings.preferenceSection', lang: lang)
                    .toUpperCase(),
                style: theme.textTheme.labelSmall?.copyWith(
                  letterSpacing: 1.4,
                  fontWeight: FontWeight.w800,
                  color: scheme.onSurfaceVariant,
                ),
              ),
            ),
            const SizedBox(height: 8),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: SegmentedButton<String>(
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
                showSelectedIcon: false,
                onSelectionChanged: (values) {
                  ref.read(languageProvider.notifier).state = values.first;
                },
              ),
            ),
            const SizedBox(height: 16),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Text(
                AppStrings.t('settings.logoutDescription', lang: lang),
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

class _SpecRow extends StatelessWidget {
  const _SpecRow({
    required this.label,
    required this.value,
    this.trailing,
    this.onTap,
  });

  final String label;
  final String value;
  final Widget? trailing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 88,
              child: Text(
                label.toUpperCase(),
                style: theme.textTheme.labelSmall?.copyWith(
                  color: scheme.onSurfaceVariant,
                  letterSpacing: 0.8,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            Expanded(
              child: Text(
                value,
                style: theme.textTheme.bodyMedium?.copyWith(
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            if (trailing != null)
              IconTheme(
                data: IconThemeData(color: scheme.onSurfaceVariant),
                child: trailing!,
              ),
          ],
        ),
      ),
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
    final profile = await showDialog<_EnvironmentDraft>(
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
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          AppStrings.t('settings.environmentDeleteTitle', lang: lang),
        ),
        content: Text(
          '${target.displayName}\n\n'
          '${AppStrings.t('settings.environmentDeleteBody', lang: lang)}',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext, false),
            child: Text(AppStrings.t('common.cancel', lang: lang)),
          ),
          FilledButton(
            style: FilledButton.styleFrom(
              backgroundColor: Theme.of(context).colorScheme.error,
              foregroundColor: Theme.of(context).colorScheme.onError,
            ),
            onPressed: () => Navigator.pop(dialogContext, true),
            child: Text(AppStrings.t('common.delete', lang: lang)),
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
              Text(
                AppStrings.t('settings.environmentTitle', lang: lang),
                style: theme.textTheme.titleLarge,
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                AppStrings.t('settings.environmentDescription', lang: lang),
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: scheme.onSurfaceVariant,
                ),
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.md),
                Text(
                  _error!,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: scheme.error,
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              Flexible(
                child: environments.when(
                  loading: () => const Center(
                    child: Padding(
                      padding: EdgeInsets.all(AppSpacing.xl),
                      child: CircularProgressIndicator(),
                    ),
                  ),
                  error: (error, stackTrace) => Center(
                    child: Text(AppStrings.t('error.generic', lang: lang)),
                  ),
                  data: (items) => ListView.separated(
                    shrinkWrap: true,
                    itemCount: items.length,
                    separatorBuilder: (context, index) => Divider(
                      color: scheme.outlineVariant,
                      height: 1,
                    ),
                    itemBuilder: (context, index) {
                      final item = items[index];
                      final isActive = item.environmentId == activeId;
                      final switching = _switchingId == item.environmentId;
                      return ListTile(
                        minTileHeight: 64,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: AppSpacing.sm,
                          vertical: AppSpacing.xs,
                        ),
                        leading: CircleAvatar(
                          backgroundColor: isActive
                              ? scheme.primaryContainer
                              : scheme.surfaceContainerHighest,
                          child: Icon(
                            Icons.dns_outlined,
                            color: isActive
                                ? scheme.onPrimaryContainer
                                : scheme.onSurfaceVariant,
                          ),
                        ),
                        title: Text(item.displayName),
                        subtitle: Text(
                          item.isAuthenticated
                              ? item.serverUrl
                              : AppStrings.t(
                                  'settings.environmentNeedsLogin',
                                  lang: lang,
                                ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: switching
                            ? const SizedBox(
                                width: 24,
                                height: 24,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  if (isActive)
                                    Icon(
                                      Icons.check_circle,
                                      color: scheme.primary,
                                    )
                                  else
                                    const Icon(Icons.chevron_right),
                                  IconButton(
                                    tooltip: AppStrings.t(
                                      'settings.environmentDelete',
                                      lang: lang,
                                    ),
                                    onPressed: _switchingId == null
                                        ? () => _deleteEnvironment(item)
                                        : null,
                                    icon: const Icon(Icons.delete_outline),
                                  ),
                                ],
                              ),
                        enabled: _switchingId == null,
                        onTap: isActive ? null : () => _switch(item),
                      );
                    },
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              FilledButton.icon(
                onPressed: _switchingId == null ? _addEnvironment : null,
                icon: const Icon(Icons.add),
                label: Text(
                  AppStrings.t('settings.environmentAdd', lang: lang),
                ),
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
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _serverController = TextEditingController();
  final _secretController = TextEditingController();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscureSecret = true;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _nameController.dispose();
    _serverController.dispose();
    _secretController.dispose();
    _usernameController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  String? _required(String? value) {
    if (value == null || value.trim().isEmpty) {
      final lang =
          Localizations.localeOf(context).languageCode == 'en' ? 'en' : 'zh';
      return AppStrings.t('settings.environmentRequired', lang: lang);
    }
    return null;
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;
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
    return AlertDialog(
      title: Text(AppStrings.t('settings.environmentAdd', lang: lang)),
      content: SingleChildScrollView(
        child: Form(
          key: _formKey,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextFormField(
                controller: _nameController,
                autofocus: true,
                textInputAction: TextInputAction.next,
                validator: _required,
                decoration: InputDecoration(
                  labelText: AppStrings.t(
                    'settings.environmentName',
                    lang: lang,
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              TextFormField(
                controller: _serverController,
                keyboardType: TextInputType.url,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                validator: _required,
                decoration: InputDecoration(
                  labelText: AppStrings.t('login.server', lang: lang),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              TextFormField(
                controller: _secretController,
                obscureText: _obscureSecret,
                textInputAction: TextInputAction.next,
                autocorrect: false,
                enableSuggestions: false,
                validator: _required,
                decoration: InputDecoration(
                  labelText: AppStrings.t('login.jwtSecret', lang: lang),
                  suffixIcon: IconButton(
                    onPressed: () => setState(
                      () => _obscureSecret = !_obscureSecret,
                    ),
                    icon: Icon(
                      _obscureSecret
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              TextFormField(
                controller: _usernameController,
                textInputAction: TextInputAction.next,
                validator: _required,
                decoration: InputDecoration(
                  labelText: AppStrings.t('login.username', lang: lang),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              TextFormField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                textInputAction: TextInputAction.done,
                autocorrect: false,
                enableSuggestions: false,
                validator: _required,
                onFieldSubmitted: (_) => _submit(),
                decoration: InputDecoration(
                  labelText: AppStrings.t('login.password', lang: lang),
                  suffixIcon: IconButton(
                    tooltip: AppStrings.t(
                      _obscurePassword
                          ? 'login.showPassword'
                          : 'login.hidePassword',
                      lang: lang,
                    ),
                    onPressed: () => setState(
                      () => _obscurePassword = !_obscurePassword,
                    ),
                    icon: Icon(
                      _obscurePassword
                          ? Icons.visibility_outlined
                          : Icons.visibility_off_outlined,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(AppStrings.t('common.cancel', lang: lang)),
        ),
        FilledButton(
          onPressed: _submit,
          child: Text(AppStrings.t('common.confirm', lang: lang)),
        ),
      ],
    );
  }
}
