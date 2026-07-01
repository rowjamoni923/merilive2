import 'package:google_sign_in/google_sign_in.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/device/persistent_device_id.dart';
import '../../../core/env/env.dart';

/// Native Google Sign-In → Supabase `signInWithIdToken` (parity with
/// `useNativeGoogleAuth.ts` on web/Android). Also runs the same
/// "one device = one account" guard `GoogleSignInButton.tsx` does.
class GoogleFlowRepository {
  GoogleFlowRepository(this._sb)
      : _google = GoogleSignIn(
          scopes: const ['email', 'profile', 'openid'],
          // Required on Android to receive an ID token accepted by Supabase.
          serverClientId: Env.googleServerClientId.isEmpty
              ? null
              : Env.googleServerClientId,
        );

  final SupabaseClient _sb;
  final GoogleSignIn _google;

  Future<GoogleSignInOutcome> signIn() async {
    // Refuse cleanly if the app isn't configured yet.
    if (Env.googleServerClientId.isEmpty) {
      throw const GoogleFlowException(
        'Google Sign-In is not configured for this build.',
      );
    }

    // 1. Duplicate-device guard (parity with GoogleSignInButton.tsx).
    final deviceId = await PersistentDeviceId.get();
    if (deviceId != null && deviceId.isNotEmpty) {
      final existing = await _sb
          .from('profiles')
          .select('id, display_name, device_id')
          .eq('device_id', deviceId)
          .eq('is_deleted', false)
          .maybeSingle();
      if (existing != null) {
        throw GoogleFlowException(
          'This device already has an account (${existing['display_name']}). '
          'One device = one account.',
        );
      }
    }

    // 2. Native picker.
    await _google.signOut(); // always show account picker
    final GoogleSignInAccount? account = await _google.signIn();
    if (account == null) {
      throw const GoogleFlowException('Google Sign-In was cancelled');
    }
    final auth = await account.authentication;
    final idToken = auth.idToken;
    if (idToken == null || idToken.isEmpty) {
      throw const GoogleFlowException(
        'Could not obtain a Google ID token. '
        'Check GOOGLE_SERVER_CLIENT_ID + SHA-1 fingerprint in Google Cloud.',
      );
    }

    // 3. Exchange with Supabase.
    final res = await _sb.auth.signInWithIdToken(
      provider: OAuthProvider.google,
      idToken: idToken,
      accessToken: auth.accessToken,
    );
    final session = res.session;
    final user = res.user;
    if (session == null || user == null) {
      throw const GoogleFlowException('Failed to establish Supabase session');
    }

    // 4. Check whether the profile needs gender/name completion.
    final profile = await _sb
        .from('profiles')
        .select('gender, display_name')
        .eq('id', user.id)
        .maybeSingle();

    final needsProfile = profile == null ||
        (profile['gender'] as String?)?.isEmpty != false;

    return GoogleSignInOutcome(
      userId: user.id,
      needsProfileCompletion: needsProfile,
      displayName:
          (user.userMetadata?['full_name'] as String?) ??
              (user.email?.split('@').first) ??
              'User',
      email: user.email ?? '',
    );
  }

  Future<void> signOut() async {
    try {
      await _google.signOut();
    } catch (_) {}
  }
}

class GoogleSignInOutcome {
  const GoogleSignInOutcome({
    required this.userId,
    required this.needsProfileCompletion,
    required this.displayName,
    required this.email,
  });
  final String userId;
  final bool needsProfileCompletion;
  final String displayName;
  final String email;
}

class GoogleFlowException implements Exception {
  const GoogleFlowException(this.message);
  final String message;
  @override
  String toString() => message;
}
