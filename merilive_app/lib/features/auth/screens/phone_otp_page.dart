import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/router/app_router.dart';
import '../../../core/supabase/supabase_client.dart';
import '../data/phone_flow_repository.dart';
import '../widgets/auth_background.dart';
import '../widgets/cream_card.dart';

/// Step E.2 — WhatsApp OTP entry.
///
/// On verify: if a profile already exists for this phone, a session is set
/// (AuthBloc routes home). Otherwise we push the password screen with the
/// verified_token to create a new account.
@RoutePage()
class PhoneOtpPage extends StatefulWidget {
  const PhoneOtpPage({
    super.key,
    required this.displayPhone,
    required this.phoneDigits,
  });
  final String displayPhone;
  final String phoneDigits;

  @override
  State<PhoneOtpPage> createState() => _PhoneOtpPageState();
}

class _PhoneOtpPageState extends State<PhoneOtpPage> {
  final _ctrl = TextEditingController();
  final _focus = FocusNode();
  bool _verifying = false;
  bool _resending = false;
  int _cooldown = 60; // GREEN-API rate-limits at 60s
  Timer? _timer;

  late final _repo = PhoneFlowRepository(SupabaseBootstrap.client);

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
    setState(() => _cooldown = 60);
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
      await _repo.sendOtp(widget.displayPhone);
      if (!mounted) return;
      _startCooldown();
      authSnack(context, 'A new code has been sent via WhatsApp.');
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
      final token = await _repo.verifyOtp(widget.displayPhone, otp);
      final result = await _repo.exchangeForSession(
        phoneDigits: widget.phoneDigits,
        verifiedToken: token,
      );
      if (!mounted) return;
      if (result == PhoneSignInResult.needsSignup) {
        await context.router.replace(
          PhonePasswordRoute(
            displayPhone: widget.displayPhone,
            phoneDigits: widget.phoneDigits,
            verifiedToken: token,
          ),
        );
      } else {
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
                      icon: Icons.mark_chat_read_rounded,
                      title: 'Verify your WhatsApp',
                      subtitle:
                          'Enter the 6-digit code sent to\n${widget.displayPhone}',
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
                          context.router.replace(const PhoneInputRoute()),
                      child: const Text(
                        'Change number',
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
          style: TextStyle(color: Color(0xFF64748B), fontSize: 13),
        ),
        TextButton(
          onPressed: canResend ? _resend : null,
          style: TextButton.styleFrom(
            padding: EdgeInsets.zero,
            minimumSize: const Size(0, 0),
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: Text(
            canResend ? 'Resend code' : 'Resend in ${_cooldown}s',
            style: TextStyle(
              color: canResend ? const Color(0xFFFF3D71) : const Color(0xFF94A3B8),
              fontWeight: FontWeight.w700,
              fontSize: 13,
            ),
          ),
        ),
      ],
    );
  }
}
