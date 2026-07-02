import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';

/// C8 — Flutter ↔ native bridge for a 1-on-1 Private Call.
///
/// Mirrors `src/hooks/usePrivateCall.ts` startCall path (server-authoritative
/// via `start_private_call` RPC — same busy/blocked/rate/insufficient-coins
/// gates apply). After the RPC returns a `call_id`, we mint a LiveKit token
/// via the shared `livekit-token` edge function (roomType: `call`,
/// roomName: `call_<call_id>`) and hand the room to the native LiveKit
/// plugin so Camera2 stays warm across the Match → Call transition.
class PrivateCallBridge {
  PrivateCallBridge(this._supabase);
  final SupabaseClient _supabase;

  bool _connected = false;
  String? _callId;
  String? _holdId;

  String? get callId => _callId;
  String? get holdId => _holdId;
  bool get isConnected => _connected;

  /// M5 — Reserve dual-currency (max(coins,diamonds)) balance BEFORE the
  /// server-authoritative `start_private_call` RPC so a low-balance caller
  /// is rejected up-front instead of being cut mid-first-minute. Mirrors
  /// `reserve_call_balance` used by the web `usePrivateCall` hook.
  Future<Map<String, dynamic>?> reserveBalance({
    required String hostId,
    required int estimatedCoins,
  }) async {
    final uid = _supabase.auth.currentUser?.id;
    if (uid == null) throw StateError('not_authenticated');
    final rpc = await _supabase.rpc('reserve_call_balance', params: {
      'p_caller_id': uid,
      'p_host_id': hostId,
      'p_estimated_coins': estimatedCoins,
    });
    final payload = (rpc is Map) ? Map<String, dynamic>.from(rpc) : null;
    if (payload != null && payload['success'] == true) {
      _holdId = payload['hold_id'] as String?;
    }
    return payload;
  }

  /// Result of `start_private_call` RPC or null when the server rejects the
  /// call (host busy, insufficient balance, disabled, etc.).
  Future<Map<String, dynamic>?> startAsCaller({
    required String hostId,
    required String participantName,
    int? estimatedCoins,
  }) async {
    final uid = _supabase.auth.currentUser?.id;
    if (uid == null) throw StateError('not_authenticated');

    // M5 — up-front reservation (skipped when caller didn't provide an
    // estimate, e.g. random-match where the queue already gated balance).
    if (estimatedCoins != null && estimatedCoins > 0) {
      final res = await reserveBalance(
        hostId: hostId,
        estimatedCoins: estimatedCoins,
      );
      if (res != null && res['success'] == false) return res;
    }

    final rpc = await _supabase.rpc(
      'start_private_call',
      params: {
        'p_caller_id': uid,
        'p_receiver_id': hostId,
        'p_call_type': 'video',
      },
    );
    final payload = (rpc is Map) ? Map<String, dynamic>.from(rpc) : null;
    if (payload == null || payload['success'] == false) {
      return payload; // caller surfaces the error code
    }
    final callId = payload['call_id'] as String?;
    if (callId == null) return payload;

    final token = await _supabase.functions.invoke(
      'livekit-token',
      body: {
        'roomName': 'call_$callId',
        'roomType': 'call',
        'participantName': participantName,
      },
    );
    final tokenData = token.data;
    if (tokenData is! Map ||
        tokenData['token'] == null ||
        tokenData['url'] == null) {
      throw StateError('livekit_token_invalid_response');
    }

    await LiveKitBridge.instance.initialize();
    final connect = await LiveKitBridge.instance.connect(
      wsUrl: tokenData['url'] as String,
      token: tokenData['token'] as String,
      publishVideo: true,
      publishAudio: true,
    );
    if (connect['success'] == false &&
        connect['reason'] != 'unimplemented') {
      throw StateError('private_call_connect_failed:${connect['reason']}');
    }
    await LiveKitBridge.instance.attachLocal();

    _connected = true;
    _callId = callId;
    return payload;
  }

  /// C9 — mic mute wired to native LiveKit local audio publication.
  Future<void> setMuted(bool muted) async {
    try {
      await LiveKitBridge.instance.setMicEnabled(!muted);
    } catch (_) {}
  }

  /// C9 — flip camera (front ↔ back) via native bridge.
  Future<void> flipCamera() async {
    try {
      await LiveKitBridge.instance.switchCamera();
    } catch (_) {}
  }

  /// C9 — toggle beauty pipeline (GPUPixel) via native bridge.
  Future<void> setBeauty(bool enabled) async {
    try {
      await LiveKitBridge.instance.setBeautyEnabled(enabled);
    } catch (_) {}
  }

  Future<void> hangUp({
    required String reason,
    int? durationSeconds,
  }) async {
    final cid = _callId;
    try {
      await LiveKitBridge.instance.detachLocal();
    } catch (_) {}
    try {
      await LiveKitBridge.instance.disconnect();
    } catch (_) {}
    if (cid != null) {
      try {
        await _supabase.rpc('end_private_call', params: {
          '_call_id': cid,
          '_reason': reason,
        });
      } catch (_) {}
    }
    _connected = false;
    _callId = null;
  }
}
