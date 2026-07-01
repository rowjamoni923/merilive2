import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/router/app_router.dart';
import '../../../core/supabase/supabase_client.dart';
import '../data/email_flow_repository.dart';
import '../widgets/auth_background.dart';
import '../widgets/cream_card.dart';

/// Step D.1 — user enters email → OTP dispatched → routes to OTP screen.
///
/// Instant-UI parity with web `handleSendEmailOtp`: we advance immediately
/// and fire the edge function in the background. Errors surface via snack.
@RoutePage()
class EmailInputPage extends StatefulWidget {
  const EmailInputPage({super.key});

  @override
  State<EmailInputPage> createState() => _EmailInputPageState();
}

class _EmailInputPageState extends State<EmailInputPage> {
  final _ctrl = TextEditingController();
  bool _busy = false;

  late final _repo = EmailFlowRepository(SupabaseBootstrap.client);

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final email = _ctrl.text.trim().toLowerCase();
    if (!EmailFlowRepository.isValidEmail(email)) {
      authSnack(context, 'Please enter a valid email address', error: true);
      return;
    }
    setState(() => _busy = true);
    HapticFeedback.selectionClick();

    // Navigate first (instant UI); OTP screen owns resend + verify.
    await context.router.replace(EmailOtpRoute(email: email));

    // Fire-and-forget delivery.
    _repo.sendOtp(email).catchError((e) {
      if (!mounted) return;
      final code = e is EmailFlowException ? e.code : null;
      final msg = e is EmailFlowException
          ? e.message
          : 'Failed to send verification code';
      authSnack(context, msg, error: true);
      if (code == 'EMAIL_DOMAIN_NOT_VERIFIED' ||
          code == 'EMAIL_SENDER_DOMAIN_NOT_READY') {
        context.router.replace(const EmailInputRoute());
      }
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
                      icon: Icons.mail_rounded,
                      title: 'Continue with Email',
                      subtitle:
                          "We'll send a 6-digit code to verify it's you.",
                    ),
                    const SizedBox(height: 20),
                    const FieldLabel('Email address'),
                    TextField(
                      controller: _ctrl,
                      autofocus: true,
                      keyboardType: TextInputType.emailAddress,
                      autocorrect: false,
                      textInputAction: TextInputAction.done,
                      onSubmitted: (_) => _submit(),
                      style: const TextStyle(
                          fontSize: 14, color: Color(0xFF0F172A)),
                      decoration: authInputDeco(
                        hint: 'you@example.com',
                        prefix: Icons.alternate_email_rounded,
                      ),
                    ),
                    const SizedBox(height: 20),
                    PillGradientButton(
                      label: 'Send Code',
                      loading: _busy,
                      onPressed: _busy ? null : _submit,
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
