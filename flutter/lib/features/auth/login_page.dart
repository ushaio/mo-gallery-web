import 'package:collection/collection.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../app/theme.dart';
import '../../app/ui.dart';
import '../../core/api/api_exception.dart';
import '../../core/auth/session.dart';
import '../../core/error/error_messages.dart';
import '../../l10n/strings.dart';

/// Keys for [_LoginPageState._fieldErrors].
const _serverField = 'server';
const _secretField = 'secret';
const _usernameField = 'username';
const _passwordField = 'password';

/// Breakpoint above which the brand panel and the form sit side by side.
const _wideBreakpoint = 760.0;

class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _serverCtrl = TextEditingController();
  final _secretCtrl = TextEditingController();
  final _userCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _busy = false;
  String? _error;
  ApiException? _authFailure;
  bool _obscurePassword = true;
  bool _obscureSecret = true;
  final Map<String, String> _fieldErrors = {};

  /// Server URL + JWT secret are pre-filled from a saved environment, so they
  /// stay folded away until the user asks to edit them or one fails validation.
  bool _connectionExpanded = true;

  List<Session> _environments = const [];
  String? _selectedEnvironmentId;
  bool _loadingEnvironments = true;
  bool _switchingEnvironment = false;

  bool get _locked => _busy || _switchingEnvironment;

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
      _connectionExpanded = selected == null;
      _fieldErrors.clear();
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

  Session? get _selectedEnvironment => _environments.firstWhereOrNull(
        (item) => item.environmentId == _selectedEnvironmentId,
      );

  void _clearFieldError(String field) {
    if (!_fieldErrors.containsKey(field)) return;
    setState(() => _fieldErrors.remove(field));
  }

  Future<void> _selectEnvironment(String environmentId) async {
    if (_locked) return;
    final environment = _environments.firstWhereOrNull(
      (item) => item.environmentId == environmentId,
    );
    if (environment == null) return;

    setState(() {
      _selectedEnvironmentId = environmentId;
      _switchingEnvironment = true;
      _connectionExpanded = false;
      _error = null;
      _authFailure = null;
      _fieldErrors.clear();
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

  Future<void> _chooseEnvironment() async {
    if (_loadingEnvironments || _locked || _environments.isEmpty) return;
    final lang = ref.read(languageProvider);
    final choice = await showAppSheet<({String id, bool remove})>(
      context: context,
      maxWidth: 520,
      builder: (sheetContext) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: AppSpacing.md),
              child: Text(
                AppStrings.t('login.environment', lang: lang),
                style: Theme.of(sheetContext).textTheme.titleLarge,
              ),
            ),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: _environments.length,
                separatorBuilder: (_, __) => const SizedBox(height: 6),
                itemBuilder: (context, index) {
                  final environment = _environments[index];
                  final selected =
                      environment.environmentId == _selectedEnvironmentId;
                  return AppChoiceRow(
                    label: environment.displayName,
                    subtitle: environment.serverUrl,
                    icon: Icons.hub_outlined,
                    selected: selected,
                    onTap: () => Navigator.pop(
                      sheetContext,
                      (id: environment.environmentId, remove: false),
                    ),
                    trailing: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _SelectionMark(selected: selected),
                        const SizedBox(width: AppSpacing.xs),
                        AppIconButton(
                          icon: Icons.delete_outline,
                          danger: true,
                          filled: false,
                          size: 36,
                          iconSize: 18,
                          semanticLabel: AppStrings.t(
                            'settings.environmentDelete',
                            lang: lang,
                          ),
                          onPressed: () => Navigator.pop(
                            sheetContext,
                            (id: environment.environmentId, remove: true),
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    if (choice.remove) {
      await _deleteEnvironment(choice.id);
    } else {
      await _selectEnvironment(choice.id);
    }
  }

  Future<void> _deleteEnvironment(String environmentId) async {
    if (_locked) return;
    final environment = _environments.firstWhereOrNull(
      (item) => item.environmentId == environmentId,
    );
    if (environment == null) return;
    final lang = ref.read(languageProvider);
    final confirmed = await showAppDialog<bool>(
      context: context,
      builder: (dialogContext) => AppDialog(
        title: AppStrings.t('settings.environmentDeleteTitle', lang: lang),
        content: Text(
          '${environment.displayName}\n\n'
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
    if (_locked) return;
    FocusScope.of(context).unfocus();
    final lang = ref.read(languageProvider);

    final errors = <String, String>{};
    if (_serverCtrl.text.trim().isEmpty) {
      errors[_serverField] = AppStrings.t('login.errorServer', lang: lang);
    }
    if (_secretCtrl.text.trim().isEmpty) {
      errors[_secretField] = AppStrings.t('login.errorSecret', lang: lang);
    }
    if (_userCtrl.text.trim().isEmpty) {
      errors[_usernameField] = AppStrings.t('login.errorUsername', lang: lang);
    }
    if (_passCtrl.text.trim().isEmpty) {
      errors[_passwordField] = AppStrings.t('login.errorPassword', lang: lang);
    }
    if (errors.isNotEmpty) {
      setState(() {
        _fieldErrors
          ..clear()
          ..addAll(errors);
        // Never leave a failing field hidden inside the folded section.
        if (errors.containsKey(_serverField) ||
            errors.containsKey(_secretField)) {
          _connectionExpanded = true;
        }
      });
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
      _fieldErrors.clear();
    });
    try {
      await ref.read(authControllerProvider.notifier).login(
            serverUrl: _serverCtrl.text,
            jwtSecret: _secretCtrl.text,
            username: _userCtrl.text,
            password: _passCtrl.text,
          );
    } catch (e) {
      if (!mounted) return;
      if (e is ArgumentError) {
        setState(() => _error = AppStrings.t('login.required', lang: lang));
      } else {
        setState(() => _error = mapErrorMessage(e, lang: lang));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(languageProvider);

    return AppScreen(
      topBar: const SizedBox.shrink(),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final bottomInset = MediaQuery.viewInsetsOf(context).bottom;
          if (constraints.maxWidth >= _wideBreakpoint) {
            return Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(flex: 5, child: _buildBrandPanel(lang)),
                Expanded(
                  flex: 6,
                  child: SafeArea(
                    left: false,
                    child: SingleChildScrollView(
                      padding: EdgeInsets.fromLTRB(
                        AppSpacing.xxxl,
                        AppSpacing.xxxl,
                        AppSpacing.xxxl,
                        AppSpacing.xxxl + bottomInset,
                      ),
                      child: Center(
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 440),
                          child: _buildForm(lang),
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          }
          return SafeArea(
            child: SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(
                AppChrome.pageGutter,
                AppSpacing.xl,
                AppChrome.pageGutter,
                AppSpacing.xxl + bottomInset,
              ),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 440),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      _buildCompactHeader(lang),
                      const SizedBox(height: AppSpacing.xl),
                      _buildForm(lang),
                    ],
                  ),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Compact editorial masthead for the narrow layout.
  Widget _buildCompactHeader(String lang) {
    return AppEntrance(
      child: SizedBox(
        height: 176,
        child: Center(
          child: _Wordmark(
            eyebrow: AppStrings.t('login.eyebrow', lang: lang),
            subtitle: AppStrings.t('login.subtitle', lang: lang),
            fontSize: 37,
          ),
        ),
      ),
    );
  }

  /// Light editorial panel for wide layouts; mirrors the mobile masthead.
  Widget _buildBrandPanel(String lang) {
    final scheme = Theme.of(context).colorScheme;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(
          right: BorderSide(color: scheme.outlineVariant),
        ),
      ),
      child: SafeArea(
        right: false,
        child: LayoutBuilder(
          builder: (context, constraints) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: constraints.maxHeight),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(44, 48, 44, 48),
                child: Center(
                  child: _Wordmark(
                    eyebrow: AppStrings.t('login.eyebrow', lang: lang),
                    subtitle: AppStrings.t('login.subtitle', lang: lang),
                    fontSize: 44,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildForm(String lang) {
    final hasEnvironments = _environments.isNotEmpty;
    final fieldsEnabled = !_locked;
    final theme = Theme.of(context);

    return AppEntrance(
      delay: const Duration(milliseconds: 80),
      child: Theme(
        data: theme.copyWith(
          colorScheme: theme.colorScheme.copyWith(
            surfaceContainer: theme.colorScheme.surfaceContainerLowest,
          ),
        ),
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_authFailure != null) ...[
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
                const SizedBox(height: AppSpacing.xl),
              ],

              // ── Connection ───────────────────────────────────────────────
              AppSectionLabel(
                label: AppStrings.t('login.connection', lang: lang),
                trailing: hasEnvironments
                    ? _InlineAction(
                        label: AppStrings.t(
                          _connectionExpanded
                              ? 'login.collapse'
                              : 'common.edit',
                          lang: lang,
                        ),
                        icon: _connectionExpanded
                            ? Icons.expand_less
                            : Icons.expand_more,
                        onTap: _busy
                            ? null
                            : () => setState(
                                  () => _connectionExpanded =
                                      !_connectionExpanded,
                                ),
                      )
                    : null,
              ),
              const SizedBox(height: AppSpacing.sm),
              if (hasEnvironments) _buildEnvironmentRow(lang),
              AnimatedSize(
                duration: AppMotion.medium,
                curve: AppMotion.curve,
                alignment: Alignment.topCenter,
                child: _connectionExpanded
                    ? Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (hasEnvironments)
                            const SizedBox(height: AppSpacing.sm),
                          AppTextField(
                            controller: _serverCtrl,
                            enabled: fieldsEnabled,
                            keyboardType: TextInputType.url,
                            textInputAction: TextInputAction.next,
                            label: AppStrings.t('login.server', lang: lang),
                            hint: 'https://gallery.example.com/login/name',
                            leading: const Icon(Icons.dns_outlined),
                            errorText: _fieldErrors[_serverField],
                            autofillHints: const [AutofillHints.url],
                            onChanged: (_) => _clearFieldError(_serverField),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          AppTextField(
                            controller: _secretCtrl,
                            enabled: fieldsEnabled,
                            obscureText: _obscureSecret,
                            textInputAction: TextInputAction.next,
                            label: AppStrings.t('login.jwtSecret', lang: lang),
                            leading: const Icon(Icons.key_outlined),
                            errorText: _fieldErrors[_secretField],
                            onChanged: (_) => _clearFieldError(_secretField),
                            trailing: _ObscureToggle(
                              obscured: _obscureSecret,
                              showLabel:
                                  AppStrings.t('login.showSecret', lang: lang),
                              hideLabel:
                                  AppStrings.t('login.hideSecret', lang: lang),
                              onPressed: () => setState(
                                () => _obscureSecret = !_obscureSecret,
                              ),
                            ),
                          ),
                        ],
                      )
                    : const SizedBox(width: double.infinity),
              ),
              const SizedBox(height: AppSpacing.xl),

              // ── Identity ─────────────────────────────────────────────────
              AppSectionLabel(
                label: AppStrings.t('login.identity', lang: lang),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(
                controller: _userCtrl,
                enabled: fieldsEnabled,
                textInputAction: TextInputAction.next,
                label: AppStrings.t('login.username', lang: lang),
                leading: const Icon(Icons.person_outline),
                errorText: _fieldErrors[_usernameField],
                autofillHints: const [AutofillHints.username],
                onChanged: (_) => _clearFieldError(_usernameField),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppTextField(
                controller: _passCtrl,
                enabled: fieldsEnabled,
                obscureText: _obscurePassword,
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => _submit(),
                label: AppStrings.t('login.password', lang: lang),
                leading: const Icon(Icons.lock_outline),
                errorText: _fieldErrors[_passwordField],
                autofillHints: const [AutofillHints.password],
                onChanged: (_) => _clearFieldError(_passwordField),
                trailing: _ObscureToggle(
                  obscured: _obscurePassword,
                  showLabel: AppStrings.t('login.showPassword', lang: lang),
                  hideLabel: AppStrings.t('login.hidePassword', lang: lang),
                  onPressed: () =>
                      setState(() => _obscurePassword = !_obscurePassword),
                ),
              ),

              if (_error != null) ...[
                const SizedBox(height: AppSpacing.lg),
                AppNotice(
                  message: _error!,
                  icon: Icons.error_outline,
                  isError: true,
                  onDismiss: () => setState(() => _error = null),
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                onPressed: _locked ? null : _submit,
                busy: _busy,
                expand: true,
                minHeight: 52,
                icon: Icons.arrow_forward,
                label: AppStrings.t('login.submit', lang: lang),
              ),
              const SizedBox(height: AppSpacing.md),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.shield_outlined,
                    size: 15,
                    color: theme.colorScheme.tertiary,
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      AppStrings.t('login.secureLocal', lang: lang),
                      textAlign: TextAlign.center,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildEnvironmentRow(String lang) {
    final scheme = Theme.of(context).colorScheme;
    final environment = _selectedEnvironment;

    return _LoginEnvironmentRow(
      label: environment?.displayName ??
          AppStrings.t('login.environmentEmpty', lang: lang),
      subtitle: environment?.serverUrl ??
          AppStrings.t('login.environment', lang: lang),
      selected: environment != null,
      busy: _switchingEnvironment,
      onTap: _loadingEnvironments || _locked ? null : _chooseEnvironment,
      accent: scheme.tertiary,
    );
  }
}

class _LoginEnvironmentRow extends StatelessWidget {
  const _LoginEnvironmentRow({
    required this.label,
    required this.subtitle,
    required this.selected,
    required this.busy,
    required this.onTap,
    required this.accent,
  });

  final String label;
  final String subtitle;
  final bool selected;
  final bool busy;
  final VoidCallback? onTap;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;

    return AppPressable(
      onTap: onTap,
      semanticLabel: '$label, $subtitle',
      scale: 0.99,
      dim: 0.88,
      child: Container(
        constraints: const BoxConstraints(minHeight: 70),
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerLowest,
          borderRadius: BorderRadius.circular(AppRadius.medium),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: scheme.tertiaryContainer,
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(Icons.hub_outlined, size: 20, color: accent),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            if (busy)
              const AppSpinner(size: 18)
            else ...[
              if (selected)
                Icon(Icons.check_circle_outline, size: 19, color: accent),
              const SizedBox(width: AppSpacing.xs),
              Icon(
                Icons.unfold_more,
                size: 18,
                color: scheme.onSurfaceVariant,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Serif masthead. The wordmark is a brand asset, so it stays Latin and
/// uppercase in every language. No serif is bundled with the app — this rides
/// the platform's Song/serif face (Noto Serif on Android, Times on iOS).
class _Wordmark extends StatelessWidget {
  const _Wordmark({
    required this.eyebrow,
    required this.subtitle,
    required this.fontSize,
  });

  final String eyebrow;
  final String subtitle;
  final double fontSize;

  static const _serifFallback = <String>[
    'Songti SC',
    'Noto Serif CJK SC',
    'Source Han Serif SC',
    'SimSun',
    'Times New Roman',
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final ink = scheme.onSurface;
    final muted = scheme.onSurfaceVariant;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          'MO GALLERY',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontFamily: 'serif',
            fontFamilyFallback: _serifFallback,
            fontSize: fontSize,
            height: 1.08,
            fontWeight: FontWeight.w400,
            letterSpacing: 0,
            color: ink,
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _Rule(color: muted),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
              child: Text(
                eyebrow,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: scheme.tertiary,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0,
                ),
              ),
            ),
            _Rule(color: muted),
          ],
        ),
        const SizedBox(height: AppSpacing.lg),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 300),
          child: Text(
            subtitle,
            textAlign: TextAlign.center,
            style: theme.textTheme.bodyMedium?.copyWith(
              color: muted,
              height: 1.55,
            ),
          ),
        ),
      ],
    );
  }
}

/// Short hairline flanking the eyebrow.
class _Rule extends StatelessWidget {
  const _Rule({required this.color});

  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 26,
      height: 1,
      color: color.withValues(alpha: 0.45),
    );
  }
}

/// Text + chevron affordance used in a section label's trailing slot.
class _InlineAction extends StatelessWidget {
  const _InlineAction({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = theme.colorScheme.tertiary;

    return AppPressable(
      onTap: onTap,
      semanticLabel: label,
      scale: 0.96,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: color,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
              ),
            ),
            const SizedBox(width: 3),
            Icon(icon, size: 15, color: color),
          ],
        ),
      ),
    );
  }
}

/// Show / hide eye for secret fields.
class _ObscureToggle extends StatelessWidget {
  const _ObscureToggle({
    required this.obscured,
    required this.showLabel,
    required this.hideLabel,
    required this.onPressed,
  });

  final bool obscured;
  final String showLabel;
  final String hideLabel;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return AppIconButton(
      semanticLabel: obscured ? showLabel : hideLabel,
      onPressed: onPressed,
      icon:
          obscured ? Icons.visibility_outlined : Icons.visibility_off_outlined,
      filled: false,
      size: 36,
      iconSize: 18,
    );
  }
}

/// Check circle mirroring [AppChoiceRow]'s default trailing indicator, so rows
/// that carry their own trailing actions keep the same selection language.
class _SelectionMark extends StatelessWidget {
  const _SelectionMark({required this.selected});

  final bool selected;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return AnimatedContainer(
      duration: AppMotion.medium,
      width: 20,
      height: 20,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: selected ? scheme.primary : Colors.transparent,
        border: Border.all(
          color: selected ? scheme.primary : scheme.outline,
          width: 1.5,
        ),
      ),
      child: selected
          ? Icon(Icons.check, size: 13, color: scheme.onPrimary)
          : null,
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

    return AppCard(
      tone: AppCardTone.accent,
      outlined: true,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            Icons.shield_outlined,
            size: 20,
            color: scheme.onTertiaryContainer,
          ),
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
                  style: theme.textTheme.bodySmall?.copyWith(
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

    return AppScreen(
      body: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppBrandMark(size: 72),
              const SizedBox(height: AppSpacing.xl),
              Text(
                AppStrings.t('app.title', lang: lang),
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                    ),
              ),
              const SizedBox(height: AppSpacing.xl),
              AppSpinner(size: 28, color: scheme.primary),
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
