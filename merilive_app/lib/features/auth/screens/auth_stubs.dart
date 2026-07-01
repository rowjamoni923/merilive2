import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

/// Route stubs — each is filled in during Steps C-F.
/// They only exist so the router graph compiles today (Step A Foundation).

Widget _stub(String label) => Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: Center(
        child: Text(
          '$label\n(Step B/C/D/E/F)',
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white70, fontSize: 14),
        ),
      ),
    );

@RoutePage()
class GenderStepPage extends StatelessWidget {
  const GenderStepPage({super.key});
  @override
  Widget build(BuildContext context) => _stub('Gender + Name');
}

@RoutePage()
class EmailInputPage extends StatelessWidget {
  const EmailInputPage({super.key});
  @override
  Widget build(BuildContext context) => _stub('Email');
}

@RoutePage()
class EmailOtpPage extends StatelessWidget {
  const EmailOtpPage({super.key});
  @override
  Widget build(BuildContext context) => _stub('Email OTP');
}

@RoutePage()
class EmailPasswordPage extends StatelessWidget {
  const EmailPasswordPage({super.key});
  @override
  Widget build(BuildContext context) => _stub('Email Password');
}

@RoutePage()
class LoginPage extends StatelessWidget {
  const LoginPage({super.key});
  @override
  Widget build(BuildContext context) => _stub('Login');
}

@RoutePage()
class PhoneInputPage extends StatelessWidget {
  const PhoneInputPage({super.key});
  @override
  Widget build(BuildContext context) => _stub('Phone');
}

@RoutePage()
class PhoneOtpPage extends StatelessWidget {
  const PhoneOtpPage({super.key});
  @override
  Widget build(BuildContext context) => _stub('Phone OTP');
}

@RoutePage()
class PhonePasswordPage extends StatelessWidget {
  const PhonePasswordPage({super.key});
  @override
  Widget build(BuildContext context) => _stub('Phone Password');
}

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
