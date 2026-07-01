import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

import '../../../core/router/app_router.dart';
import '../../../core/supabase/supabase_client.dart';
import '../../../core/theme/design_tokens.dart';

/// OAuth deep-link landing — parity with `AuthCallback.tsx`.
///
/// Supabase's Flutter SDK (PKCE) auto-exchanges the `?code=` in the deep link
/// via [SupabaseAuth.getInitialUri] handling. We just poll the session and
/// route away.
@RoutePage()
class AuthCallbackPage extends StatefulWidget {
  const AuthCallbackPage({super.key});

  @override
  State<AuthCallbackPage> createState() => _AuthCallbackPageState();
}

class _AuthCallbackPageState extends State<AuthCallbackPage> {
  String _status = 'Verifying session...';
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _run();
  }

  Future<void> _run() async {
    const delays = [
      Duration(milliseconds: 300),
      Duration(milliseconds: 400),
      Duration(milliseconds: 500),
      Duration(milliseconds: 500),
      Duration(milliseconds: 500),
      Duration(milliseconds: 500),
      Duration(milliseconds: 500),
      Duration(milliseconds: 500),
    ];
    for (final d in delays) {
      final session = sb.auth.currentSession;
      if (session != null) {
        if (!mounted) return;
        setState(() => _status = 'Signed in!');
        await Future.delayed(const Duration(milliseconds: 200));
        if (!mounted) return;
        await context.router.replaceAll([const SplashRoute()]);
        return;
      }
      await Future.delayed(d);
    }
    if (!mounted) return;
    setState(() {
      _status = 'Login failed. Please try again.';
      _error = true;
    });
    await Future.delayed(const Duration(seconds: 2));
    if (!mounted) return;
    await context.router.replaceAll([const AuthLandingRoute()]);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: DT.authBgGradient,
          ),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text(
                'meriLIVE',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 1.2,
                ),
              ),
              const SizedBox(height: 24),
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _error
                      ? const Color(0x33EF4444)
                      : const Color(0x339333EA),
                ),
                alignment: Alignment.center,
                child: Icon(
                  _error ? Icons.close_rounded : Icons.hourglass_top_rounded,
                  color: _error
                      ? const Color(0xFFEF4444)
                      : Colors.white,
                  size: 36,
                ),
              ),
              const SizedBox(height: 20),
              Text(
                _status,
                style: const TextStyle(color: Colors.white, fontSize: 15),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
