import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/router/app_router.dart';
import '../../../core/supabase/supabase_client.dart';
import '../../../core/theme/design_tokens.dart';
import '../widgets/auth_background.dart';
import '../widgets/cream_card.dart';

/// Reset password landing — hubohu parity with `ResetPassword.tsx`.
///
/// Supabase Flutter SDK converts the `type=recovery` deep link into a
/// short-lived session automatically, then fires
/// `AuthChangeEvent.passwordRecovery`. This page just needs a valid session
/// (either freshly created by that event OR a pre-existing one) to accept the
/// new password.
@RoutePage()
class ResetPasswordPage extends StatefulWidget {
  const ResetPasswordPage({super.key});

  @override
  State<ResetPasswordPage> createState() => _ResetPasswordPageState();
}

class _ResetPasswordPageState extends State<ResetPasswordPage> {
  final _pw = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscure = true;
  bool _obscure2 = true;
  bool _busy = false;
  bool _sessionReady = false;
  bool _success = false;

  @override
  void initState() {
    super.initState();
    _checkSession();
  }

  Future<void> _checkSession() async {
    // Give the SDK a beat to process the incoming recovery link.
    for (var i = 0; i < 10; i++) {
      if (sb.auth.currentSession != null) {
        if (!mounted) return;
        setState(() => _sessionReady = true);
        return;
      }
      await Future.delayed(const Duration(milliseconds: 300));
    }
    if (!mounted) return;
    authSnack(context, 'Please use the password reset link from your email',
        error: true);
    await Future.delayed(const Duration(milliseconds: 1200));
    if (!mounted) return;
    await context.router.replaceAll([const AuthLandingRoute()]);
  }

  @override
  void dispose() {
    _pw.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_pw.text.isEmpty || _confirm.text.isEmpty) {
      authSnack(context, 'Please fill in all fields', error: true);
      return;
    }
    if (_pw.text.length < 6) {
      authSnack(context, 'Password must be at least 6 characters', error: true);
      return;
    }
    if (_pw.text != _confirm.text) {
      authSnack(context, 'Passwords do not match', error: true);
      return;
    }
    setState(() => _busy = true);
    HapticFeedback.mediumImpact();
    try {
      await sb.auth.updateUser(UserAttributes(password: _pw.text));
      if (!mounted) return;
      setState(() {
        _busy = false;
        _success = true;
      });
      await Future.delayed(const Duration(milliseconds: 1500));
      if (!mounted) return;
      await context.router.replaceAll([const SplashRoute()]);
    } on AuthException catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      authSnack(context, e.message, error: true);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      authSnack(context, 'Failed to update password', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_success) {
      return Scaffold(
        body: AuthBackground(
          child: Center(
            child: CreamCard(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Icon(Icons.check_circle_rounded,
                      color: Color(0xFF10B981), size: 56),
                  SizedBox(height: 12),
                  Text(
                    'Password Updated!',
                    style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w900,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  SizedBox(height: 6),
                  Text(
                    'Redirecting you to home…',
                    style: TextStyle(color: Color(0xFF475569)),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return Scaffold(
      body: AuthBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding:
                  const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
              child: CreamCard(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const AuthCardHeader(
                      icon: Icons.lock_reset_rounded,
                      title: 'Reset Password',
                      subtitle: 'Enter your new password below',
                    ),
                    const SizedBox(height: 18),
                    const FieldLabel('New password'),
                    TextField(
                      controller: _pw,
                      obscureText: _obscure,
                      style: const TextStyle(
                          fontSize: 14, color: Color(0xFF0F172A)),
                      decoration: authInputDeco(
                        hint: 'At least 6 characters',
                        prefix: Icons.lock_rounded,
                        suffix: IconButton(
                          icon: Icon(
                            _obscure
                                ? Icons.visibility_off_rounded
                                : Icons.visibility_rounded,
                            color: const Color(0xFF64748B),
                            size: 20,
                          ),
                          onPressed: () =>
                              setState(() => _obscure = !_obscure),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    const FieldLabel('Confirm password'),
                    TextField(
                      controller: _confirm,
                      obscureText: _obscure2,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                      style: const TextStyle(
                          fontSize: 14, color: Color(0xFF0F172A)),
                      decoration: authInputDeco(
                        hint: 'Repeat new password',
                        prefix: Icons.lock_outline_rounded,
                        suffix: IconButton(
                          icon: Icon(
                            _obscure2
                                ? Icons.visibility_off_rounded
                                : Icons.visibility_rounded,
                            color: const Color(0xFF64748B),
                            size: 20,
                          ),
                          onPressed: () =>
                              setState(() => _obscure2 = !_obscure2),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    PillGradientButton(
                      label: 'Update Password',
                      loading: _busy || !_sessionReady,
                      onPressed:
                          (_busy || !_sessionReady) ? null : _submit,
                      gradient: DT.btnLogin,
                      glow: const Color(0xFFDB2777),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => context.router
                          .replaceAll([const AuthLandingRoute()]),
                      child: const Text(
                        'Back to sign in',
                        style: TextStyle(
                          color: Color(0xFFBE185D),
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
