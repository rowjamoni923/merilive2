import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/router/app_router.dart';
import '../../../core/supabase/supabase_client.dart';
import '../../../core/theme/design_tokens.dart';
import '../data/email_flow_repository.dart';
import '../widgets/auth_background.dart';
import '../widgets/cream_card.dart';

/// Classic email + password login for returning users.
/// Users who forgot their password can trigger a reset email or fall back to
/// the OTP flow.
@RoutePage()
class LoginPage extends StatefulWidget {
  const LoginPage({super.key, this.initialEmail});
  final String? initialEmail;

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  late final _email = TextEditingController(text: widget.initialEmail ?? '');
  final _pw = TextEditingController();
  bool _obscure = true;
  bool _busy = false;

  late final _repo = EmailFlowRepository(SupabaseBootstrap.client);

  @override
  void dispose() {
    _email.dispose();
    _pw.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    final email = _email.text.trim().toLowerCase();
    if (!EmailFlowRepository.isValidEmail(email)) {
      authSnack(context, 'Please enter a valid email address', error: true);
      return;
    }
    if (_pw.text.isEmpty) {
      authSnack(context, 'Please enter your password', error: true);
      return;
    }
    setState(() => _busy = true);
    HapticFeedback.mediumImpact();
    try {
      await _repo.passwordLogin(email: email, password: _pw.text);
      if (!mounted) return;
      await context.router.replaceAll([const SplashRoute()]);
    } catch (e) {
      if (!mounted) return;
      final msg =
          e is AuthException ? e.message : 'Login failed. Please try again.';
      authSnack(context, msg, error: true);
      setState(() => _busy = false);
    }
  }

  Future<void> _forgot() async {
    final email = _email.text.trim().toLowerCase();
    if (!EmailFlowRepository.isValidEmail(email)) {
      authSnack(context, 'Enter your email above first', error: true);
      return;
    }
    try {
      await _repo.sendPasswordReset(email);
      if (!mounted) return;
      authSnack(context, 'Reset link sent to $email');
    } catch (e) {
      if (!mounted) return;
      authSnack(context, e.toString(), error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
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
                      icon: Icons.login_rounded,
                      title: 'Welcome back',
                      subtitle: 'Log in with your email and password.',
                    ),
                    const SizedBox(height: 18),
                    const FieldLabel('Email'),
                    TextField(
                      controller: _email,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      style: const TextStyle(
                          fontSize: 14, color: Color(0xFF0F172A)),
                      decoration: authInputDeco(
                        hint: 'you@example.com',
                        prefix: Icons.alternate_email_rounded,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const FieldLabel('Password'),
                    TextField(
                      controller: _pw,
                      obscureText: _obscure,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _login(),
                      style: const TextStyle(
                          fontSize: 14, color: Color(0xFF0F172A)),
                      decoration: authInputDeco(
                        hint: 'Your password',
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
                    Align(
                      alignment: Alignment.centerRight,
                      child: TextButton(
                        onPressed: _forgot,
                        child: const Text(
                          'Forgot password?',
                          style: TextStyle(
                            color: Color(0xFFBE185D),
                            fontWeight: FontWeight.w700,
                            fontSize: 12,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    PillGradientButton(
                      label: 'Log in',
                      loading: _busy,
                      onPressed: _busy ? null : _login,
                      gradient: DT.btnLogin,
                      glow: const Color(0xFFDB2777),
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () =>
                          context.router.replace(const EmailInputRoute()),
                      child: const Text(
                        'Log in with a one-time code instead',
                        style: TextStyle(
                          color: Color(0xFF475569),
                          fontWeight: FontWeight.w600,
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
