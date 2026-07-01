import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/device/persistent_device_id.dart';

/// Result of `recover_session_by_device` RPC — matches server payload.
class DeviceRecovery {
  const DeviceRecovery({
    required this.userId,
    required this.displayName,
    required this.avatarUrl,
    required this.gender,
    required this.isHost,
    required this.exchangeToken,
  });

  final String userId;
  final String displayName;
  final String? avatarUrl;
  final String? gender;
  final bool isHost;
  final String exchangeToken;
}

/// Result of the guest-start flow.
enum StartOutcome {
  /// Existing device account restored — go straight home.
  recovered,

  /// Brand-new guest account created — show Gender + Name dialog.
  createdNewGuest,
}

class StartFlowResult {
  const StartFlowResult(this.outcome, this.userId, {this.recovery});
  final StartOutcome outcome;
  final String userId;
  final DeviceRecovery? recovery;
}

/// Encapsulates the Start-button flow. Parity with `Auth.tsx` §614-1150.
class StartFlowRepository {
  StartFlowRepository(this._supabase);
  final SupabaseClient _supabase;

  /// One-call entry point used by the "Get Started" button.
  ///
  /// 1. Resolve persistent device_id.
  /// 2. Ask backend if an account already exists on this device.
  /// 3. If yes → exchange token → real session → recovered.
  /// 4. If no  → deterministic guest email/password → sign-up (or sign-in
  ///    if the row already exists) → createdNewGuest.
  Future<StartFlowResult> start() async {
    final deviceId = await PersistentDeviceId.get();
    debugPrint('[StartFlow] device_id=$deviceId');

    // 1. try recovery
    final recovery = await _recoverByDevice(deviceId);
    if (recovery != null) {
      final ok = await _completeRecovery(deviceId, recovery.exchangeToken);
      if (ok) {
        return StartFlowResult(
          StartOutcome.recovered,
          recovery.userId,
          recovery: recovery,
        );
      }
      debugPrint('[StartFlow] recovery token exchange failed → new guest');
    }

    // 2. new guest — deterministic credentials so recovery works next reinstall
    final guestEmail = 'guest_$deviceId@meri.local';
    final guestPassword = 'meri_${deviceId}_secure';

    try {
      final signUp = await _supabase.auth.signUp(
        email: guestEmail,
        password: guestPassword,
        data: {
          'is_guest': true,
          'device_id': deviceId,
        },
      );
      final user = signUp.user;
      if (user != null) {
        return StartFlowResult(StartOutcome.createdNewGuest, user.id);
      }
    } on AuthException catch (e) {
      // "User already registered" → sign in instead.
      debugPrint('[StartFlow] signUp failed (${e.message}); trying signIn');
    }

    final signIn = await _supabase.auth.signInWithPassword(
      email: guestEmail,
      password: guestPassword,
    );
    final user = signIn.user;
    if (user == null) {
      throw StateError('Guest sign-in returned no user');
    }
    // Existing guest that never finished onboarding → still show dialog if
    // profile has no display_name / gender. Caller decides based on profile.
    return StartFlowResult(StartOutcome.createdNewGuest, user.id);
  }

  Future<DeviceRecovery?> _recoverByDevice(String deviceId) async {
    try {
      final raw = await _supabase.rpc(
        'recover_session_by_device',
        params: {'p_device_id': deviceId},
      );
      if (raw is! List || raw.isEmpty) return null;
      final row = Map<String, dynamic>.from(raw.first as Map);
      final token = row['exchange_token'];
      if (token is! String || token.isEmpty) return null;
      return DeviceRecovery(
        userId: row['user_id'] as String,
        displayName: (row['display_name'] as String?) ?? 'User',
        avatarUrl: row['avatar_url'] as String?,
        gender: row['gender'] as String?,
        isHost: (row['is_host'] as bool?) ?? false,
        exchangeToken: token,
      );
    } catch (e) {
      debugPrint('[StartFlow] recover RPC failed: $e');
      return null;
    }
  }

  Future<bool> _completeRecovery(String deviceId, String token) async {
    try {
      final res = await _supabase.functions.invoke(
        'device-session-recover',
        body: {'device_id': deviceId, 'exchange_token': token},
      );
      final data = res.data;
      if (data is! Map) return false;
      if (data['success'] != true) return false;
      final access = data['access_token'] as String?;
      final refresh = data['refresh_token'] as String?;
      if (access == null || refresh == null) return false;
      await _supabase.auth.setSession(refresh); // supabase_flutter uses refresh
      return true;
    } catch (e) {
      debugPrint('[StartFlow] session-recover failed: $e');
      return false;
    }
  }

  /// Called after the user picks name + gender in the dialog.
  Future<void> finalizeGuestProfile({
    required String userId,
    required String displayName,
    required String gender, // 'male' | 'female'
  }) async {
    final trimmed = displayName.trim();
    if (trimmed.isEmpty) {
      throw ArgumentError('display_name required');
    }
    if (gender != 'male' && gender != 'female') {
      throw ArgumentError('gender must be male|female');
    }

    // 1. update profile basics
    final updateErr = await _supabase
        .from('profiles')
        .update({'display_name': trimmed, 'gender': gender})
        .eq('id', userId)
        .select()
        .maybeSingle();
    if (updateErr == null) {
      // maybeSingle returns null if the row didn't exist yet — trigger may
      // still be running. Not fatal on its own, but log.
      debugPrint('[StartFlow] profile update returned null row');
    }

    // 2. claim device_id via SECURITY DEFINER RPC (matches web behaviour).
    final deviceId = await PersistentDeviceId.get();
    try {
      await _supabase.rpc('claim_device_id', params: {'p_device_id': deviceId});
    } catch (e) {
      // Non-fatal (matches GenderSelectionModal.tsx §57)
      debugPrint('[StartFlow] claim_device_id failed: $e');
    }
  }
}
