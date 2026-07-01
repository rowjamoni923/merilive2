import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

/// Remaining route stubs — filled in during later steps.
/// Kept only so the router graph compiles.

Widget _stub(String label) => Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: Center(
        child: Text(
          '$label\n(coming in a later step)',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white70, fontSize: 14),
        ),
      ),
    );

// Phone flow → phone_*_page.dart (Step E — done).

@RoutePage()
class AuthCallbackPage extends StatelessWidget {
  const AuthCallbackPage({super.key});
  @override
  Widget build(BuildContext context) => _stub('OAuth Callback');
}

@RoutePage()
class ResetPasswordPage extends StatelessWidget {
  const ResetPasswordPage({super.key});
  @override
  Widget build(BuildContext context) => _stub('Reset Password');
}
