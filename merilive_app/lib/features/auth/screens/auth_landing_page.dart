import 'package:auto_route/auto_route.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../../../core/theme/design_tokens.dart';
import '../../branding/branding.dart';
import '../../branding/branding_cubit.dart';
import '../widgets/auth_background.dart';
import '../widgets/gradient_button.dart';
import '../widgets/terms_toggle.dart';

/// Auth landing — 3 gradient CTAs + Terms toggle + admin-managed branding.
/// Parity with `Auth.tsx` landing (lines 2136–2300).
@RoutePage()
class AuthLandingPage extends StatefulWidget {
  const AuthLandingPage({super.key});

  @override
  State<AuthLandingPage> createState() => _AuthLandingPageState();
}

class _AuthLandingPageState extends State<AuthLandingPage> {
  bool _agreed = false;
  String? _pending;

  void _guarded(String key, VoidCallback go) {
    if (!_agreed) {
      HapticFeedback.mediumImpact();
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(const SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: Color(0xFFDC2626),
          content: Text(
            'Please agree to User Agreement and Privacy Policy to continue.',
            style: TextStyle(color: Colors.white),
          ),
        ));
      return;
    }
    setState(() => _pending = key);
    go();
    // Reset pending state shortly (screens filled in Steps C-E will navigate away first).
    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) setState(() => _pending = null);
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: AuthBackground(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
              child: ConstrainedBox(
                constraints:
                    BoxConstraints(minHeight: constraints.maxHeight - 32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Spacer(),
                    const _BrandHeader(),
                    const SizedBox(height: 40),
                    _startButton(),
                    const SizedBox(height: 12),
                    _phoneButton(),
                    const SizedBox(height: 12),
                    _emailButton(),
                    const SizedBox(height: 16),
                    TermsToggle(
                      agreed: _agreed,
                      onChanged: (v) => setState(() => _agreed = v),
                    ),
                    const SizedBox(height: 24),
                  ],
                ),
              ),
            );
          },
        ),
      ),
    );
  }

  Widget _startButton() => GradientButton(
        gradient: DT.btnStart,
        label: 'Get Started',
        icon: const Icon(Icons.rocket_launch_rounded),
        loading: _pending == 'start',
        onPressed: () => _guarded('start', () {
          // Wired in Step C (device-recover flow).
        }),
      );

  Widget _phoneButton() => GradientButton(
        gradient: DT.btnPhone,
        label: 'Continue with Phone',
        icon: const Icon(Icons.phone_rounded),
        loading: _pending == 'phone',
        onPressed: () => _guarded('phone', () {
          // context.router.push(const PhoneInputRoute());  // Step E
        }),
      );

  Widget _emailButton() => GradientButton(
        gradient: DT.btnEmail,
        label: 'Continue with Email',
        icon: const Icon(Icons.mail_rounded),
        loading: _pending == 'email',
        onPressed: () => _guarded('email', () {
          // context.router.push(const EmailInputRoute());  // Step D
        }),
      );
}

class _BrandHeader extends StatelessWidget {
  const _BrandHeader();

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<BrandingCubit, Branding>(
      builder: (context, b) {
        return Column(
          children: [
            SizedBox(
              width: 88,
              height: 88,
              child: b.logoImageUrl != null && b.logoImageUrl!.isNotEmpty
                  ? CachedNetworkImage(
                      imageUrl: b.logoImageUrl!,
                      fit: BoxFit.contain,
                      errorWidget: (_, __, ___) => _fallbackLogo(),
                    )
                  : _fallbackLogo(),
            ),
            const SizedBox(height: 12),
            RichText(
              text: TextSpan(
                style: const TextStyle(
                  fontSize: 30,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.2,
                  color: Colors.white,
                ),
                children: [
                  TextSpan(text: b.logoTextPrimary),
                  TextSpan(
                    text: b.logoTextSecondary,
                    style: TextStyle(
                      foreground: Paint()
                        ..shader = const LinearGradient(colors: DT.btnStart)
                            .createShader(
                                const Rect.fromLTWH(0, 0, 200, 40)),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Text(
              b.tagline,
              style: TextStyle(
                fontSize: 12,
                letterSpacing: 1.2,
                color: Colors.white.withOpacity(0.75),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _fallbackLogo() => Image.asset(
        'assets/logo/app-logo.png',
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) => const Icon(
          Icons.stream_rounded,
          color: Colors.white,
          size: 56,
        ),
      );
}
