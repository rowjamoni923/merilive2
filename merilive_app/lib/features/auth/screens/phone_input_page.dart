import 'dart:ui' show PlatformDispatcher;

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl_phone_field/intl_phone_field.dart';
import 'package:intl_phone_field/phone_number.dart';

import '../../../core/router/app_router.dart';
import '../../../core/supabase/supabase_client.dart';
import '../data/phone_flow_repository.dart';
import '../widgets/auth_background.dart';
import '../widgets/cream_card.dart';

/// Step E.1 — user enters phone number → WhatsApp OTP dispatched.
///
/// Parity with `handleSendPhoneOtp` in web `src/pages/Auth.tsx`: we advance
/// to OTP screen immediately (instant UI) and fire the edge function in the
/// background.
@RoutePage()
class PhoneInputPage extends StatefulWidget {
  const PhoneInputPage({super.key});

  @override
  State<PhoneInputPage> createState() => _PhoneInputPageState();
}

class _PhoneInputPageState extends State<PhoneInputPage> {
  PhoneNumber? _phone;
  bool _valid = false;
  bool _busy = false;

  late final _repo = PhoneFlowRepository(SupabaseBootstrap.client);

  Future<void> _submit() async {
    if (!_valid || _phone == null) {
      authSnack(context, 'Please enter a valid phone number', error: true);
      return;
    }
    setState(() => _busy = true);
    HapticFeedback.selectionClick();

    final display = _phone!.completeNumber; // +8801XXXXXXXXX
    final digits = PhoneFlowRepository.normalize(display);

    // Navigate first (instant UI); OTP screen owns resend + verify.
    await context.router.replace(
      PhoneOtpRoute(displayPhone: display, phoneDigits: digits),
    );

    _repo.sendOtp(display).catchError((e) {
      if (!mounted) return;
      final msg = e is PhoneFlowException
          ? e.message
          : 'Failed to send WhatsApp code';
      authSnack(context, msg, error: true);
    });
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
                      icon: Icons.chat_rounded,
                      title: 'Continue with WhatsApp',
                      subtitle:
                          "We'll send a 6-digit code to your WhatsApp number.",
                    ),
                    const SizedBox(height: 20),
                    const FieldLabel('Phone number'),
                    IntlPhoneField(
                      initialCountryCode: 'BD',
                      autofocus: true,
                      style: const TextStyle(
                          fontSize: 14, color: Color(0xFF0F172A)),
                      dropdownTextStyle: const TextStyle(
                          fontSize: 14, color: Color(0xFF0F172A)),
                      decoration: authInputDeco(hint: '1XXXXXXXXX'),
                      onChanged: (p) {
                        _phone = p;
                        final ok = p.number.length >= 6;
                        if (ok != _valid) setState(() => _valid = ok);
                      },
                      onSubmitted: (_) => _submit(),
                      invalidNumberMessage: 'Invalid phone number',
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Make sure this number has WhatsApp installed.',
                      style: TextStyle(
                        fontSize: 12,
                        color: Color(0xFF64748B),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: 20),
                    PillGradientButton(
                      label: 'Send WhatsApp Code',
                      loading: _busy,
                      onPressed: (_busy || !_valid) ? null : _submit,
                    ),
                    const SizedBox(height: 12),
                    TextButton(
                      onPressed: () => context.router.maybePop(),
                      child: const Text(
                        'Back',
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
