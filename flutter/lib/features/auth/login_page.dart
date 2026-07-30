import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/session.dart';
import '../../core/error/error_messages.dart';
import '../../l10n/strings.dart';

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _serverCtrl = TextEditingController();
  final _secretCtrl = TextEditingController();
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _busy = false;
  String? _error;
  ApiException? _authFailure;
  bool _obscurePassword = true;
  bool _obscureSecret = true;
  List<Session> _environments = const [];
  String? _selectedEnvironmentId;
  bool _loadingEnvironments = true;
  bool _switchingEnvironment = false;

  @override
  void initState() {
    super.initState();
    _loadEnvironments();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final failure = ref.read(authFailureProvider);
      if (failure == null || !mounted) return;

      setState(() => _authFailure = failure);
      ref.read(authFailureProvider.notifier).state = null;
    });
  }

  Future<void> _loadEnvironments() async {
    final store = ref.read(sessionStoreProvider);
    final environments = await store.list();
    final activeId = await store.readActiveId();
    if (!mounted) return;

    Session? selected;
    for (final environment in environments) {
      if (environment.environmentId == activeId) {
        selected = environment;
        break;
      }
    }
    if (selected == null && environments.isNotEmpty) {
      selected = environments.first;
    }
    _applyEnvironment(selected);
    setState(() {
      _environments = environments;
      _selectedEnvironmentId = selected?.environmentId;
      _loadingEnvironments = false;
    });
  }

  void _applyEnvironment(Session? environment) {
    if (environment == null) {
      _serverCtrl.clear();
      _secretCtrl.clear();
      _userCtrl.clear();
      _passCtrl.clear();
      return;
    }
    _serverCtrl.text = environment.loginUrl ?? environment.serverUrl;
    _secretCtrl.text = environment.jwtSecret;
    _userCtrl.text = environment.username;
    _passCtrl.clear();
  }

  Future<void> _selectEnvironment(String? environmentId) async {
    if (environmentId == null || _busy || _switchingEnvironment) return;
    final environment = _environments.cast<Session?>().firstWhere(
          (item) => item?.environmentId == environmentId,
          orElse: () => null,
        );
    if (environment == null) return;

    setState(() {
      _selectedEnvironmentId = environmentId;
      _switchingEnvironment = true;
      _error = null;
      _authFailure = null;
    });
    _applyEnvironment(environment);
    try {
      await ref
          .read(authControllerProvider.notifier)
          .switchEnvironment(environmentId);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = mapErrorMessage(error, lang: ref.read(languageProvider));
      });
    } finally {
      if (mounted) {
        setState(() => _switchingEnvironment = false);
      }
    }
  }

  Future<void> _deleteSelectedEnvironment() async {
    final environmentId = _selectedEnvironmentId;
    if (environmentId == null || _busy || _switchingEnvironment) return;
    final environment = _environments.cast<Session?>().firstWhere(
          (item) => item?.environmentId == environmentId,
          orElse: () => null,
        );
    if (environment == null) return;
    final lang = ref.read(languageProvider);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: Text(
          AppStrings.t('settings.environmentDeleteTitle', lang: lang),
        ),
        content: Text(
          '${environment.displayName}\n\n'
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
      _switchingEnvironment = true;
      _error = null;
    });
    try {
      await ref
          .read(authControllerProvider.notifier)
          .deleteEnvironment(environmentId);
      if (mounted) {
        await _loadEnvironments();
      }
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = mapErrorMessage(error, lang: ref.read(languageProvider));
      });
    } finally {
      if (mounted) {
        setState(() => _switchingEnvironment = false);
      }
    }
  }

  @override
  void dispose() {
    _serverCtrl.dispose();
    _secretCtrl.dispose();
    _userCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || _switchingEnvironment) return;
    FocusScope.of(context).unfocus();
    if (!(_formKey.currentState?.validate() ?? false)) {
      setState(() => _error = null);
      return;
    }

    final lang = ref.read(languageProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).login(
            serverUrl: _serverCtrl.text,
            jwtSecret: _secretCtrl.text,
            username: _userCtrl.text,
            password: _passCtrl.text,
          );
    } catch (e) {
      if (e is ArgumentError) {
        setState(() => _error = AppStrings.t('login.required', lang: lang));
      } else {
        setState(() => _error = mapErrorMessage(e, lang: lang));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String? _validateRequired(String? value) {
    if (value == null || value.trim().isEmpty) {
      return AppStrings.t('login.required', lang: ref.read(languageProvider));
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final isDark = scheme.brightness == Brightness.dark;

    final form = AutofillGroup(
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              AppStrings.t('login.title', lang: lang).toUpperCase(),
              style: theme.textTheme.labelSmall?.copyWith(
                color: scheme.primary,
                letterSpacing: 2.2,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              AppStrings.t('login.subtitle', lang: lang),
              style: theme.textTheme.bodyMedium?.copyWith(
                color: scheme.onSurfaceVariant,
                height: 1.4,
              ),
            ),
            if (_authFailure != null) ...[
              const SizedBox(height: AppSpacing.md),
              _AuthNotice(
                title: AppStrings.t(
                  _authFailure!.code == 'ADMIN_LOGIN_GATE_CHANGED'
                      ? 'login.adminGateChangedTitle'
                      : 'login.sessionExpiredTitle',
                  lang: lang,
                ),
                body: AppStrings.t(
                  _authFailure!.code == 'ADMIN_LOGIN_GATE_CHANGED'
                      ? 'login.adminGateChanged'
                      : 'login.sessionExpired',
                  lang: lang,
                ),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    key: ValueKey(_selectedEnvironmentId),
                    initialValue: _selectedEnvironmentId,
                    isExpanded: true,
                    decoration: InputDecoration(
                      labelText: AppStrings.t(
                        'login.environment',
                        lang: lang,
                      ),
                      prefixIcon: const Icon(Icons.hub_outlined),
                    ),
                    hint: Text(
                      AppStrings.t('login.environmentEmpty', lang: lang),
                    ),
                    items: _environments
                        .map(
                          (environment) => DropdownMenuItem(
                            value: environment.environmentId,
                            child: Text(
                              environment.displayName,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        )
                        .toList(),
                    onChanged: _loadingEnvironments ||
                            _switchingEnvironment ||
                            _environments.isEmpty
                        ? null
                        : _selectEnvironment,
                  ),
                ),
                const SizedBox(width: 8),
                IconButton.filledTonal(
                  tooltip: AppStrings.t(
                    'settings.environmentDelete',
                    lang: lang,
                  ),
                  onPressed:
                      _selectedEnvironmentId == null || _switchingEnvironment
                          ? null
                          : _deleteSelectedEnvironment,
                  icon: _switchingEnvironment
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.delete_outline),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _serverCtrl,
              keyboardType: TextInputType.url,
              textInputAction: TextInputAction.next,
              autocorrect: false,
              validator: _validateRequired,
              decoration: InputDecoration(
                labelText: AppStrings.t('login.server', lang: lang),
                hintText: 'https://gallery.example.com/login/security-name',
                prefixIcon: const Icon(Icons.dns_outlined),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _secretCtrl,
              obscureText: _obscureSecret,
              textInputAction: TextInputAction.next,
              autocorrect: false,
              enableSuggestions: false,
              validator: _validateRequired,
              decoration: InputDecoration(
                labelText: AppStrings.t('login.jwtSecret', lang: lang),
                prefixIcon: const Icon(Icons.key_outlined),
                suffixIcon: IconButton(
                  tooltip: AppStrings.t(
                    _obscureSecret ? 'login.showSecret' : 'login.hideSecret',
                    lang: lang,
                  ),
                  onPressed: () =>
                      setState(() => _obscureSecret = !_obscureSecret),
                  icon: Icon(
                    _obscureSecret
                        ? Icons.visibility_outlined
                        : Icons.visibility_off_outlined,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _userCtrl,
              textInputAction: TextInputAction.next,
              autofillHints: const [AutofillHints.username],
              validator: _validateRequired,
              decoration: InputDecoration(
                labelText: AppStrings.t('login.username', lang: lang),
                prefixIcon: const Icon(Icons.person_outline),
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _passCtrl,
              obscureText: _obscurePassword,
              textInputAction: TextInputAction.done,
              autofillHints: const [AutofillHints.password],
              enableSuggestions: false,
              autocorrect: false,
              validator: _validateRequired,
              onFieldSubmitted: (_) => _submit(),
              decoration: InputDecoration(
                labelText: AppStrings.t('login.password', lang: lang),
                prefixIcon: const Icon(Icons.lock_outline),
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
            if (_error != null) ...[
              const SizedBox(height: 12),
              InlineNotice(
                message: _error!,
                icon: Icons.error_outline,
                isError: true,
              ),
            ],
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _busy || _switchingEnvironment ? null : _submit,
              icon: _busy
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: scheme.onPrimary,
                      ),
                    )
                  : const Icon(Icons.login_rounded),
              label: Text(AppStrings.t('login.submit', lang: lang)),
            ),
          ],
        ),
      ),
    );

    final brand = Container(
      width: double.infinity,
      color: isDark ? scheme.surfaceContainerLow : scheme.inverseSurface,
      padding: const EdgeInsets.fromLTRB(24, 36, 24, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const BrandMark(size: 48),
          const SizedBox(height: 20),
          Text(
            AppStrings.t('app.title', lang: lang),
            style: theme.textTheme.headlineLarge?.copyWith(
              color: isDark ? scheme.onSurface : scheme.onInverseSurface,
              fontWeight: FontWeight.w900,
              letterSpacing: -1.2,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            AppStrings.t('login.subtitle', lang: lang),
            style: theme.textTheme.bodyMedium?.copyWith(
              color: (isDark ? scheme.onSurface : scheme.onInverseSurface)
                  .withValues(alpha: 0.72),
              height: 1.45,
            ),
          ),
        ],
      ),
    );

    final wide = MediaQuery.sizeOf(context).width >= 720;

    return Scaffold(
      body: wide
          ? Row(
              children: [
                Expanded(flex: 5, child: brand),
                Expanded(
                  flex: 6,
                  child: SafeArea(
                    child: Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(32, 28, 32, 32),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 420),
                          child: form,
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            )
          : SafeArea(
              child: Column(
                children: [
                  brand,
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(18, 18, 18, 28),
                      child: form,
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _AuthNotice extends StatelessWidget {
  const _AuthNotice({required this.title, required this.body});

  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: scheme.tertiaryContainer.withValues(alpha: 0.75),
        borderRadius: BorderRadius.circular(AppRadius.medium),
        border: Border.all(
          color: scheme.tertiary.withValues(alpha: 0.28),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.shield_outlined, color: scheme.onTertiaryContainer),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: scheme.onTertiaryContainer,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  body,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: scheme.onTertiaryContainer,
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class SessionGatePage extends ConsumerWidget {
  const SessionGatePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lang = ref.watch(languageProvider);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const BrandMark(size: 72),
              const SizedBox(height: AppSpacing.xl),
              Text(
                AppStrings.t('app.title', lang: lang),
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: AppSpacing.xl),
              SizedBox(
                width: 28,
                height: 28,
                child: CircularProgressIndicator(
                  strokeWidth: 2.5,
                  color: scheme.primary,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Text(
                AppStrings.t('session.checking', lang: lang),
                style: TextStyle(color: scheme.onSurfaceVariant),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
