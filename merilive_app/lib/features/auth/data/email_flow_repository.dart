import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/device/persistent_device_id.dart';

/// Wraps the three email-auth edge functions used by the web `Auth.tsx`:
///   • send-email-otp       — send 6-digit code to inbox
///   • verify-email-otp     — validate code, return `verified_token`
///   • otp-direct-signin    — exchange verified_token for a Supabase session,
///                            or (mode: "create") create a new account
///
/// The backend contract is unchanged; this class only ports the client caller.
class EmailFlowRepository {
  EmailFlowRepository(this._sb);
  final SupabaseClient _sb;

  static final RegExp _emailRe = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
  static bool isValidEmail(String email) => _emailRe.hasMatch(email.trim());

  /// Fire OTP delivery. Throws with a human-readable message on failure.
  Future<void> sendOtp(String email, {String purpose = 'login'}) async {
    final res = await _sb.functions.invoke(
      'send-email-otp',
      body: {'email': email.trim().toLowerCase(), 'purpose': purpose},
    );
    final data = res.data;
    if (data is Map && data['success'] == false) {
      throw EmailFlowException(
        (data['error'] as String?) ?? 'Failed to send verification code',
        code: data['code'] as String?,
      );
    }
  }

  /// Verifies the 6-digit code. Returns `verified_token` used for sign-in.
  Future<String> verifyOtp(String email, String otp,
      {String purpose = 'login'}) async {
    final res = await _sb.functions.invoke(
      'verify-email-otp',
      body: {
        'email': email.trim().toLowerCase(),
        'otp': otp,
        'purpose': purpose,
      },
    );
    final data = res.data;
    if (data is! Map || data['success'] != true) {
      throw EmailFlowException(
        (data is Map ? data['error'] as String? : null) ??
            'Invalid verification code',
      );
    }
    final token = data['verified_token'] as String?;
    if (token == null || token.isEmpty) {
      throw const EmailFlowException('Invalid verification code');
    }
    return token;
  }

  /// Exchanges a verified_token for a Supabase session.
  ///
  /// Returns:
  ///   • `EmailSignInResult.signedIn`   — session set, existing account
  ///   • `EmailSignInResult.needsSignup` — email verified but no account yet;
  ///     caller must navigate to Password screen and call [createAccount].
  Future<EmailSignInResult> exchangeForSession({
    required String email,
    required String verifiedToken,
  }) async {
    final res = await _sb.functions.invoke(
      'otp-direct-signin',
      body: {'email': email.trim().toLowerCase(), 'verified_token': verifiedToken},
    );
    final data = res.data;
    if (data is Map &&
        (data['exists'] == false || data['error'] == 'User not found')) {
      return EmailSignInResult.needsSignup;
    }
    if (data is! Map ||
        data['success'] != true ||
        data['access_token'] == null ||
        data['refresh_token'] == null) {
      throw EmailFlowException(
        (data is Map ? data['error'] as String? : null) ??
            'Failed to complete sign-in',
      );
    }
    await _sb.auth.setSession(data['refresh_token'] as String);
    return EmailSignInResult.signedIn;
  }

  /// Creates a new account using a verified_token + password + display name.
  /// Server-side handles profile+device claim.
  Future<void> createAccount({
    required String email,
    required String verifiedToken,
    required String displayName,
    required String password,
    required String gender, // 'male' | 'female'
  }) async {
    final deviceId = await PersistentDeviceId.get();
    final res = await _sb.functions.invoke(
      'otp-direct-signin',
      body: {
        'email': email.trim().toLowerCase(),
        'verified_token': verifiedToken,
        'mode': 'create',
        'password': password,
        'display_name': displayName,
        'device_id': deviceId,
        'gender': gender,
      },
    );
    final data = res.data;
    if (data is! Map ||
        data['success'] != true ||
        data['access_token'] == null ||
        data['refresh_token'] == null) {
      throw EmailFlowException(
        (data is Map ? data['error'] as String? : null) ??
            'Failed to create account',
      );
    }
    await _sb.auth.setSession(data['refresh_token'] as String);
  }

  /// Classic password login for returning users.
  Future<void> passwordLogin({
    required String email,
    required String password,
  }) async {
    await _sb.auth.signInWithPassword(
      email: email.trim().toLowerCase(),
      password: password,
    );
  }

  /// Password reset email.
  Future<void> sendPasswordReset(String email) async {
    await _sb.auth.resetPasswordForEmail(email.trim().toLowerCase());
  }
}

enum EmailSignInResult { signedIn, needsSignup }

class EmailFlowException implements Exception {
  const EmailFlowException(this.message, {this.code});
  final String message;
  final String? code;

  @override
  String toString() => message;
}
