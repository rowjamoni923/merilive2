import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/router/app_router.dart';
import '../../../core/supabase/supabase_client.dart';
import '../data/email_flow_repository.dart';
import '../widgets/auth_background.dart';
import '../widgets/cream_card.dart';

/// Step D.2 — 6-digit code entry + resend countdown.
/// After verify: either sets session (existing user) or routes to password
/// screen with the verified_token (new user).
@RoutePage()
class EmailOtpPage extends StatefulWidget {
  const EmailOtpPage({super.key, required this.email});
  final String email;

  @override
  State<EmailOtpPage> createState() => _EmailOtpPageState();
}

class _EmailOtpPageState extends State<EmailOtpPage> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  bool _verifying = false;
  bool _resending = false;
  int _cooldown = 45;
  Timer? _timer;

  late final _repo = EmailFlowRepository(SupabaseBootstrap.client);

  @override
  void initState() {
    super.initState();
    _startCooldown();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _startCooldown() {
    _timer?.cancel();
    setState(() => _cooldown = 45);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return;
      setState(() => _cooldown--);
      if (_cooldown <= 0) t.cancel();
    });
  }

  Future<void> _resend() async {
    if (_cooldown > 0 || _resending) return;
    setState(() => _resending = true);
    try {
      await _repo.sendOtp(widget.email);
      if (!mounted) return;
      _startCooldown();
      authSnack(context, 'A new code has been sent.');
    } catch (e) {
      if (!mounted) return;
      authSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _resending = false);
    }
  }

  Future<void> _verify() async {
    final otp = _ctrl.text.trim();
    if (otp.length != 6) {
      authSnack(context, 'Please enter the 6-digit code', error: true);
      return;
    }
    setState(() => _verifying = true);
    HapticFeedback.mediumImpact();
    try {
      final token = await _repo.verifyOtp(widget.email, otp);
      final result = await _repo.exchangeForSession(
        email: widget.email,
        verifiedToken: token,
      );
      if (!mounted) return;
      if (result == EmailSignInResult.needsSignup) {
        await context.router.replace(
          EmailPasswordRoute(email: widget.email, verifiedToken: token),
        );
      } else {
        // AuthBloc listens to onAuthStateChange → splash routes home.
        await context.router.replaceAll([const SplashRoute()]);
      }
    } catch (e) {
      if (!mounted) return;
      _ctrl.clear();
      authSnack(context, e.toString(), error: true);
    } finally {
      if (mounted) setState(() => _verifying = false);
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
                    AuthCardHeader(
                      icon: Icons.mark_email_read_rounded,
                      title: 'Verify your email',
                      subtitle: 'Enter the 6-digit code sent to\n${widget.email}',
                    ),
                    const SizedBox(height: 20),
                    _otpField(),
                    const SizedBox(height: 20),
                    PillGradientButton(
                      label: 'Verify & Continue',
                      loading: _verifying,
                      onPressed: _verifying ? null : _verify,
                    ),
                    const SizedBox(height: 14),
                    _resendRow(),
                    TextButton(
                      onPressed: () =>
                          context.router.replace(const EmailInputRoute()),
                      child: const Text(
                        'Change email',
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

  Widget _otpField() {
    return TextField(
      controller: _ctrl,
      focusNode: _focus,
      keyboardType: TextInputType.number,
      textInputAction: TextInputAction.done,
      maxLength: 6,
      textAlign: TextAlign.center,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      onChanged: (v) {
        if (v.length == 6 && !_verifying) _verify();
      },
      style: const TextStyle(
        fontSize: 26,
        fontWeight: FontWeight.w800,
        letterSpacing: 10,
        color: Color(0xFF0F172A),
      ),
      decoration: authInputDeco(hint: '••••••'),
    );
  }

  Widget _resendRow() {
    final canResend = _cooldown <= 0 && !_resending;
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Text(
          "Didn't get it? ",
          style: TextStyle(color: Color(0xFF475569), fontSize: 12),
        ),
        InkWell(
          onTap: canResend ? _resend : null,
          child: Text(
            canResend
                ? (_resending ? 'Sending…' : 'Resend code')
                : 'Resend in ${_cooldown}s',
            style: TextStyle(
              color: canResend
                  ? const Color(0xFFBE185D)
                  : const Color(0xFF94A3B8),
              fontWeight: FontWeight.w700,
              fontSize: 12,
            ),
          ),
        ),
      ],
    );
  }
}
