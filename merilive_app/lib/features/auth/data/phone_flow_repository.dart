import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/device/persistent_device_id.dart';

/// Wraps the WhatsApp OTP edge functions used by the web `Auth.tsx`:
///   • send-whatsapp-otp   { action: "send" | "verify" }
///   • otp-direct-signin   (channel: "phone")  — exchange verified_token
///
/// Contract mirrors `handleSendPhoneOtp` + `handleVerifyPhoneOtp` +
/// `handleCreatePhoneAccount` in `src/pages/Auth.tsx`. Backend unchanged.
class PhoneFlowRepository {
  PhoneFlowRepository(this._sb);
  final SupabaseClient _sb;

  /// Digits-only (no +, spaces, dashes). Backend expects 7–15 digits.
  static String normalize(String raw) =>
      raw.replaceAll(RegExp(r'[\s\-\(\)]'), '').replaceAll(RegExp(r'^\+'), '');

  /// Synthetic email the backend maps phone-verified users onto.
  static String syntheticEmail(String digits) => 'phone_$digits@meri.local';

  /// Fire OTP delivery. `displayPhone` is the full E.164 with country code.
  Future<void> sendOtp(String displayPhone) async {
    final res = await _sb.functions.invoke(
      'send-whatsapp-otp',
      body: {'phone_number': displayPhone, 'action': 'send'},
    );
    final data = res.data;
    if (data is! Map || data['success'] != true) {
      throw PhoneFlowException(
        (data is Map ? data['error'] as String? : null) ??
            'Failed to send WhatsApp code',
      );
    }
  }

  /// Verify the 6-digit code. Returns `verified_token` on success.
  Future<String> verifyOtp(String displayPhone, String otp) async {
    final res = await _sb.functions.invoke(
      'send-whatsapp-otp',
      body: {'phone_number': displayPhone, 'action': 'verify', 'otp': otp},
    );
    final data = res.data;
    if (data is! Map ||
        data['verified'] != true ||
        data['verified_token'] == null) {
      throw PhoneFlowException(
        (data is Map ? data['error'] as String? : null) ??
            'Invalid verification code',
      );
    }
    return data['verified_token'] as String;
  }

  /// After successful OTP: try to sign a returning user in. If no profile
  /// exists yet, returns `needsSignup` so the caller can collect password.
  Future<PhoneSignInResult> exchangeForSession({
    required String phoneDigits,
    required String verifiedToken,
  }) async {
    // 1) Check for an existing profile bound to this phone number.
    final existing = await _sb
        .from('profiles')
        .select('id, display_name')
        .eq('phone_number', phoneDigits)
        .maybeSingle();

    if (existing == null) return PhoneSignInResult.needsSignup;

    // 2) Existing account — request a session via edge function.
    final res = await _sb.functions.invoke(
      'otp-direct-signin',
      body: {
        'email': syntheticEmail(phoneDigits),
        'channel': 'phone',
        'identifier': phoneDigits,
        'verified_token': verifiedToken,
      },
    );
    final data = res.data;
    if (data is! Map ||
        data['access_token'] == null ||
        data['refresh_token'] == null) {
      throw PhoneFlowException(
        (data is Map ? data['error'] as String? : null) ??
            'Failed to complete sign-in',
      );
    }
    await _sb.auth.setSession(data['refresh_token'] as String);
    return PhoneSignInResult.signedIn;
  }

  /// Create a new phone-verified account (mode: "create").
  Future<void> createAccount({
    required String phoneDigits,
    required String verifiedToken,
    required String displayName,
    required String password,
    required String gender, // 'male' | 'female'
  }) async {
    final deviceId = await PersistentDeviceId.get();
    final res = await _sb.functions.invoke(
      'otp-direct-signin',
      body: {
        'email': syntheticEmail(phoneDigits),
        'channel': 'phone',
        'identifier': phoneDigits,
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
        data['access_token'] == null ||
        data['refresh_token'] == null) {
      throw PhoneFlowException(
        (data is Map ? data['error'] as String? : null) ??
            'Failed to create account',
      );
    }
    await _sb.auth.setSession(data['refresh_token'] as String);
  }
}

enum PhoneSignInResult { signedIn, needsSignup }

class PhoneFlowException implements Exception {
  const PhoneFlowException(this.message);
  final String message;
  @override
  String toString() => message;
}
