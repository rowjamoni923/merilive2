import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/router/app_router.dart';
import '../../../core/supabase/supabase_client.dart';
import '../data/email_flow_repository.dart';
import '../widgets/auth_background.dart';
import '../widgets/cream_card.dart';

/// Step D.3 — new-account setup after email OTP is verified.
/// Collects name + password + gender, then calls `otp-direct-signin` in
/// create mode. On success, session is set and Splash reroutes home.
@RoutePage()
class EmailPasswordPage extends StatefulWidget {
  const EmailPasswordPage({
    super.key,
    required this.email,
    required this.verifiedToken,
  });
  final String email;
  final String verifiedToken;

  @override
  State<EmailPasswordPage> createState() => _EmailPasswordPageState();
}

class _EmailPasswordPageState extends State<EmailPasswordPage> {
  final _name = TextEditingController();
  final _pw = TextEditingController();
  final _pw2 = TextEditingController();
  String? _gender; // 'male' | 'female'
  bool _obscure = true;
  bool _busy = false;

  late final _repo = EmailFlowRepository(SupabaseBootstrap.client);

  @override
  void dispose() {
    _name.dispose();
    _pw.dispose();
    _pw2.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      authSnack(context, 'Please enter your name', error: true);
      return;
    }
    if (_gender == null) {
      authSnack(context, 'Please select your gender', error: true);
      return;
    }
    if (_pw.text.length < 6) {
      authSnack(context, 'Password must be at least 6 characters', error: true);
      return;
    }
    if (_pw.text != _pw2.text) {
      authSnack(context, 'Passwords do not match', error: true);
      return;
    }
    setState(() => _busy = true);
    HapticFeedback.mediumImpact();
    try {
      await _repo.createAccount(
        email: widget.email,
        verifiedToken: widget.verifiedToken,
        displayName: name,
        password: _pw.text,
        gender: _gender!,
      );
      if (!mounted) return;
      authSnack(context, '🎉 Welcome to MeriLive!');
      await context.router.replaceAll([const SplashRoute()]);
    } catch (e) {
      if (!mounted) return;
      authSnack(context, e.toString(), error: true);
      setState(() => _busy = false);
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
                      icon: Icons.person_add_alt_1_rounded,
                      title: 'Create your account',
                      subtitle: 'Finish setup — this only takes a moment.',
                    ),
                    const SizedBox(height: 18),
                    const FieldLabel('Your name'),
                    TextField(
                      controller: _name,
                      maxLength: 30,
                      style: const TextStyle(
                          fontSize: 14, color: Color(0xFF0F172A)),
                      decoration: authInputDeco(
                        hint: 'Enter your name',
                        prefix: Icons.badge_rounded,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        Expanded(child: _genderChip(male: true)),
                        const SizedBox(width: 12),
                        Expanded(child: _genderChip(male: false)),
                      ],
                    ),
                    const SizedBox(height: 14),
                    const FieldLabel('Password'),
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
                      controller: _pw2,
                      obscureText: _obscure,
                      style: const TextStyle(
                          fontSize: 14, color: Color(0xFF0F172A)),
                      decoration: authInputDeco(
                        hint: 'Re-enter password',
                        prefix: Icons.lock_outline_rounded,
                      ),
                    ),
                    const SizedBox(height: 18),
                    PillGradientButton(
                      label: 'Create account',
                      loading: _busy,
                      onPressed: _busy ? null : _submit,
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

  Widget _genderChip({required bool male}) {
    final key = male ? 'male' : 'female';
    final selected = _gender == key;
    final accent = male ? const Color(0xFF3B82F6) : const Color(0xFFEC4899);
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        setState(() => _gender = key);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
        decoration: BoxDecoration(
          color: selected ? accent.withOpacity(0.15) : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected ? accent : const Color(0xFFE2E8F0),
            width: 2,
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(
              male ? Icons.person_rounded : Icons.person_2_rounded,
              color: accent,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              male ? 'Male' : 'Female',
              style: TextStyle(
                fontWeight: FontWeight.w700,
                color: selected ? accent : const Color(0xFF475569),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
