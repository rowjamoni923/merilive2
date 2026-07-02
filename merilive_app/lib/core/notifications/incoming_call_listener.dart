import 'dart:async';
import 'dart:io' show Platform;

import 'package:auto_route/auto_route.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../router/app_router.dart';

/// M13 — IncomingCallListener
///
/// Mirrors web `usePrivateCall` incoming-call surface 1:1:
///
///  • FCM foreground listener → `showVerifiedIncomingCall(callId)`
///  • Supabase Realtime on `private_calls` where host_id=uid → same
///    verification path (DB truth fallback for missed FCM)
///  • Native broadcast bridge: `IncomingCallActivity` (cold-start / killed
///    app) fires MethodChannel `app.merilive/incoming_call` events
///    `accept` / `decline` with the callId — we pick it up here and drive
///    the accept/decline flow inside the same Flutter isolate.
///  • Ring-timeout auto-dismiss (reads `settings.ring_timeout_seconds`,
///    default 30s — identical to web).
///  • Dedupe: `_endedCallIds` set + `_activeCallId` guard prevent duplicate
///    ringer surfaces (parity with web `endedCallIdsRef`).
///  • Token registration into `device_tokens` on attach + on rotation.
class IncomingCallListener {
  IncomingCallListener._();
  static final IncomingCallListener instance = IncomingCallListener._();

  static const MethodChannel _nativeBridge =
      MethodChannel('app.merilive/incoming_call');
  static const int _defaultRingTimeoutSec = 30;
  static const int _staleBufferMs = 5000;

  StackRouter? _router;
  String? _userId;
  StreamSubscription<RemoteMessage>? _fcmForegroundSub;
  StreamSubscription<String>? _fcmTokenRotationSub;
  RealtimeChannel? _privateCallChannel;
  Timer? _ringTimeout;
  final Set<String> _endedCallIds = <String>{};
  String? _activeCallId;

  bool get hasActiveRing => _activeCallId != null;

  /// Called from `AuthBloc` right after the user signs in (or on app cold
  /// start when a valid session exists). Safe to call multiple times —
  /// detaches the previous binding first.
  Future<void> attach({
    required StackRouter router,
    required String userId,
  }) async {
    if (_userId == userId && _privateCallChannel != null) {
      _router = router;
      return;
    }
    await detach();

    _router = router;
    _userId = userId;

    // Wire native broadcast bridge FIRST — even if FCM/permission fail,
    // native IncomingCallActivity can still hand off accept/decline.
    _nativeBridge.setMethodCallHandler(_onNativeCall);
    // Ask native for any pending call intent that arrived while Flutter
    // wasn't yet ready (cold-start via IncomingCallActivity → MainActivity).
    try {
      final pending =
          await _nativeBridge.invokeMapMethod<String, dynamic>('pending');
      if (pending != null && pending['call_id'] is String) {
        // Small delay so the router settles.
        Timer(const Duration(milliseconds: 250), () {
          showVerifiedIncomingCall(pending['call_id'] as String);
        });
      }
    } catch (_) {
      // Native side may not be registered on non-Android; ignore.
    }

    // FCM
    try {
      await FirebaseMessaging.instance.requestPermission(
        alert: true,
        badge: true,
        sound: true,
      );
      await _registerToken();
      _fcmTokenRotationSub =
          FirebaseMessaging.instance.onTokenRefresh.listen(_onTokenRefresh);
      _fcmForegroundSub =
          FirebaseMessaging.onMessage.listen(_onForegroundMessage);
      // App opened from a killed state via notification tap:
      final initial = await FirebaseMessaging.instance.getInitialMessage();
      if (initial != null) _onForegroundMessage(initial);
      FirebaseMessaging.onMessageOpenedApp.listen(_onForegroundMessage);
    } catch (e) {
      if (kDebugMode) print('[M13][FCM] attach failed: $e');
    }

    // Supabase Realtime — DB truth fallback (identical to
    // `private-call-${userId}` in usePrivateCall.ts).
    final client = Supabase.instance.client;
    _privateCallChannel = client
        .channel('private-call-$userId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'private_calls',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'host_id',
            value: userId,
          ),
          callback: _onPrivateCallRealtime,
        )
        .subscribe();
  }

  Future<void> detach() async {
    await _fcmForegroundSub?.cancel();
    _fcmForegroundSub = null;
    await _fcmTokenRotationSub?.cancel();
    _fcmTokenRotationSub = null;
    if (_privateCallChannel != null) {
      try {
        await Supabase.instance.client.removeChannel(_privateCallChannel!);
      } catch (_) {}
      _privateCallChannel = null;
    }
    _ringTimeout?.cancel();
    _ringTimeout = null;
    _endedCallIds.clear();
    _activeCallId = null;
    _userId = null;
  }

  // ─────────────────────────────────────────────────────────────
  // FCM handlers
  // ─────────────────────────────────────────────────────────────

  Future<void> _registerToken() async {
    try {
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _upsertToken(token);
    } catch (e) {
      if (kDebugMode) print('[M13][FCM] getToken failed: $e');
    }
  }

  Future<void> _onTokenRefresh(String token) => _upsertToken(token);

  Future<void> _upsertToken(String token) async {
    final uid = _userId;
    if (uid == null) return;
    try {
      await Supabase.instance.client.from('device_tokens').upsert({
        'user_id': uid,
        'token': token,
        'platform': Platform.isAndroid ? 'android' : 'ios',
        'is_active': true,
        'device_info': {
          'source': 'flutter',
          'ts': DateTime.now().toIso8601String(),
        },
      }, onConflict: 'token');
    } catch (e) {
      if (kDebugMode) print('[M13][FCM] token upsert failed: $e');
    }
  }

  void _onForegroundMessage(RemoteMessage message) {
    final data = message.data;
    final type = (data['type'] ?? data['event_type'] ?? '').toString();
    if (type != 'incoming_call') return;
    final callId = (data['call_id'] ?? data['callId'] ?? '').toString().trim();
    if (callId.isEmpty) return;
    showVerifiedIncomingCall(callId);
  }

  // ─────────────────────────────────────────────────────────────
  // Supabase Realtime handler
  // ─────────────────────────────────────────────────────────────

  void _onPrivateCallRealtime(PostgresChangePayload payload) {
    final row = payload.newRecord.isNotEmpty ? payload.newRecord : payload.oldRecord;
    final callId = row['id']?.toString();
    if (callId == null) return;
    final status = (row['status'] ?? '').toString();
    final hostId = row['host_id']?.toString();

    // Ignore rows not addressed to this host.
    if (hostId != _userId) return;

    if (status == 'pending' || status == 'ringing') {
      showVerifiedIncomingCall(callId);
    } else {
      // Any terminal status while we're ringing this call → dismiss it.
      if (_activeCallId == callId) {
        _endedCallIds.add(callId);
        _dismissRinger();
      }
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Native bridge handler
  // ─────────────────────────────────────────────────────────────

  Future<dynamic> _onNativeCall(MethodCall call) async {
    final args = (call.arguments is Map)
        ? Map<String, dynamic>.from(call.arguments as Map)
        : <String, dynamic>{};
    final callId = (args['call_id'] ?? args['callId'] ?? '').toString().trim();
    switch (call.method) {
      case 'incoming':
        if (callId.isNotEmpty) showVerifiedIncomingCall(callId);
        return true;
      case 'accept':
        if (callId.isNotEmpty) {
          _dismissRinger();
          _router?.pushNamed('/call/incoming/$callId?auto=1');
        }
        return true;
      case 'decline':
        if (callId.isNotEmpty) {
          _endedCallIds.add(callId);
          _dismissRinger();
          await _serverDecline(callId);
        }
        return true;
      case 'cancelled':
        // Caller hung up mid-ring — tear ringer down, no server call.
        if (callId.isNotEmpty) {
          _endedCallIds.add(callId);
          if (_activeCallId == callId) _dismissRinger();
        }
        return true;
      default:
        return null;
    }
  }


  // ─────────────────────────────────────────────────────────────
  // Verified show — mirrors web `showVerifiedIncomingCall`
  // ─────────────────────────────────────────────────────────────

  Future<bool> showVerifiedIncomingCall(String callId) async {
    final uid = _userId;
    if (uid == null || callId.isEmpty) return false;
    if (_endedCallIds.contains(callId)) return false;
    if (_activeCallId == callId) return true;

    final client = Supabase.instance.client;
    try {
      final row = await client
          .from('private_calls')
          .select('id, caller_id, host_id, status, created_at, call_type, coins_per_minute')
          .eq('id', callId)
          .maybeSingle();
      if (row == null) return false;
      if (row['host_id'] != uid) return false;

      final status = (row['status'] ?? '').toString();
      if (status != 'pending' && status != 'ringing') {
        _endedCallIds.add(callId);
        return false;
      }

      final createdAt = DateTime.tryParse((row['created_at'] ?? '').toString());
      final ringTimeout = await _ringTimeoutSeconds();
      if (createdAt != null) {
        final ageMs = DateTime.now().difference(createdAt).inMilliseconds;
        if (ageMs > ringTimeout * 1000 + _staleBufferMs) return false;
      }

      // Fetch caller profile in parallel with routing.
      final callerId = row['caller_id']?.toString();
      Map<String, dynamic>? caller;
      if (callerId != null) {
        try {
          final data = await client
              .from('profiles_public')
              .select(
                'display_name, avatar_url, user_level, host_level, max_user_level, gender, is_host',
              )
              .eq('id', callerId)
              .maybeSingle();
          caller = data == null ? null : Map<String, dynamic>.from(data);
        } catch (_) {}
      }

      _activeCallId = callId;
      _armRingTimeout(callId, ringTimeout);

      // Push full-screen ringer. Route registered in app_router.
      _router?.pushNamed(
        '/call/incoming/$callId'
        '?caller=${Uri.encodeComponent(callerId ?? '')}'
        '&name=${Uri.encodeComponent((caller?['display_name'] ?? 'User').toString())}'
        '&avatar=${Uri.encodeComponent((caller?['avatar_url'] ?? '').toString())}'
        '&level=${(caller?['user_level'] ?? caller?['host_level'] ?? 1)}'
        '&type=${(row['call_type'] ?? 'video')}'
        '&cpm=${row['coins_per_minute'] ?? 0}',
      );
      return true;
    } catch (e) {
      if (kDebugMode) print('[M13][incoming] verify failed: $e');
      return false;
    }
  }

  Future<int> _ringTimeoutSeconds() async {
    try {
      final data = await Supabase.instance.client
          .from('settings')
          .select('setting_value')
          .eq('setting_key', 'ring_timeout_seconds')
          .maybeSingle();
      final v = int.tryParse((data?['setting_value'] ?? '').toString());
      if (v != null && v > 0) return v;
    } catch (_) {}
    return _defaultRingTimeoutSec;
  }

  void _armRingTimeout(String callId, int seconds) {
    _ringTimeout?.cancel();
    _ringTimeout = Timer(Duration(seconds: seconds), () {
      if (_activeCallId == callId) {
        _endedCallIds.add(callId);
        _dismissRinger();
        _serverDecline(callId, reason: 'missed');
      }
    });
  }

  /// Called by the ringer UI after Accept/Decline.
  void notifyRingResolved(String callId) {
    if (_activeCallId == callId) {
      _dismissRinger();
    }
    _endedCallIds.add(callId);
  }

  void _dismissRinger() {
    _ringTimeout?.cancel();
    _ringTimeout = null;
    _activeCallId = null;
    // Tell native side to tear down the full-screen activity, if any.
    _nativeBridge.invokeMethod('dismiss').catchError((_) => null);
  }

  Future<void> _serverDecline(String callId, {String reason = 'declined'}) async {
    try {
      await Supabase.instance.client.rpc(
        'decline_private_call',
        params: {'_call_id': callId, '_reason': reason},
      );
    } catch (_) {
      // Fallback to end_private_call (older RPC name) so we never leave the
      // row hanging as 'pending'.
      try {
        await Supabase.instance.client.rpc(
          'end_private_call',
          params: {'_call_id': callId, '_reason': reason},
        );
      } catch (_) {}
    }
  }
}
