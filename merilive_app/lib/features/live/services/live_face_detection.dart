import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';

/// Phase E-20 — Server-authoritative face-presence enforcement for hosts.
///
/// Dart port of `src/hooks/useLiveFaceDetection.ts` — the AWS Rekognition
/// path only (client-side pixel analysis is intentionally disabled to
/// prevent banner flicker, matching the web build).
///
/// Loop:
///   * every [_normalCheckMs] (2s during a live countdown), grab a JPEG
///     via [LiveKitBridge.snapshotLocalPreview] and POST it to the
///     `face-check` edge function.
///   * 2 consecutive server fails with a critical violation → start a
///     10 s countdown; 3 consecutive passes clear it.
///   * countdown expiring calls [onAutoClose] and logs a row in
///     `live_face_violations` + `record_live_violation` RPC so the ban
///     ladder stays in lock-step with the web build.
///
/// Starts 60 s after the host joins to allow face framing.
class LiveFaceDetection {
  LiveFaceDetection({
    required this.streamId,
    required this.hostId,
    required this.onAutoClose,
    this.faceAbsenceTimeoutSec = 30,
    this.autoCloseCountdownSec = 10,
  });

  final String streamId;
  final String hostId;
  final VoidCallback onAutoClose;
  final int faceAbsenceTimeoutSec;
  final int autoCloseCountdownSec;

  static const _startDelayMs = 60000;
  static const _normalCheckMs = 4000;
  static const _countdownCheckMs = 2000;
  static const _failsToCountdown = 2;
  static const _passesToRecover = 3;
  static const _criticalViolations = <String>{
    'no_face',
    'eyes_closed',
    'multiple_faces',
    'sleeping',
  };

  final _client = Supabase.instance.client;

  Timer? _bootTimer;
  Timer? _cycle;
  Timer? _countdown;
  bool _running = false;
  bool _inFlight = false;
  bool _isCountingDown = false;
  int _failCount = 0;
  int _passCount = 0;
  int _remaining = 0;

  void start() {
    if (_running) return;
    _running = true;
    _bootTimer = Timer(const Duration(milliseconds: _startDelayMs), () {
      if (!_running) return;
      _schedule(_normalCheckMs);
    });
  }

  void _schedule(int ms) {
    _cycle?.cancel();
    _cycle = Timer.periodic(Duration(milliseconds: ms), (_) => _check());
    _check();
  }

  Future<void> _check() async {
    if (!_running || _inFlight) return;
    _inFlight = true;
    try {
      final snap = await LiveKitBridge.instance.snapshotLocalPreview();
      final ok = snap['ok'] == true || snap['success'] == true;
      final b64 = snap['base64'] as String?;
      if (!ok || b64 == null || b64.isEmpty) return;

      final res = await _client.functions.invoke(
        'face-check',
        body: {'imageBase64': b64, 'streamId': streamId},
      );
      if (res.data is! Map) return;
      final data = res.data as Map;
      final violations = (data['violations'] as List?)?.cast<String>() ?? const [];
      final hasCritical = violations.any(_criticalViolations.contains);

      if (hasCritical) {
        _failCount += 1;
        _passCount = 0;
        if (_failCount >= _failsToCountdown && !_isCountingDown) {
          _startCountdown(violations);
        }
      } else {
        _passCount += 1;
        if (_isCountingDown && _passCount >= _passesToRecover) {
          _stopCountdown();
        } else if (!_isCountingDown) {
          _failCount = 0;
        }
      }
    } catch (_) {
      // Never break the stream on a server hiccup.
    } finally {
      _inFlight = false;
    }
  }

  void _startCountdown(List<String> violations) {
    _isCountingDown = true;
    _remaining = autoCloseCountdownSec;
    _schedule(_countdownCheckMs);
    _countdown?.cancel();
    _countdown = Timer.periodic(const Duration(seconds: 1), (t) async {
      _remaining -= 1;
      if (_remaining <= 0) {
        t.cancel();
        await _logViolation(violations);
        onAutoClose();
        _running = false;
        _cycle?.cancel();
      }
    });
  }

  void _stopCountdown() {
    _isCountingDown = false;
    _countdown?.cancel();
    _countdown = null;
    _failCount = 0;
    _passCount = 0;
    _schedule(_normalCheckMs);
  }

  Future<void> _logViolation(List<String> violations) async {
    try {
      await _client.from('live_face_violations').insert({
        'stream_id': streamId,
        'host_id': hostId,
        'violation_type': violations.isEmpty ? 'no_face' : violations.first,
        'action_taken': 'auto_close',
        'status': 'confirmed',
      });
    } catch (_) {}
    try {
      await _client.rpc('record_live_violation', params: {
        'p_user_id': hostId,
        'p_stream_id': streamId,
        'p_violation_type': violations.isEmpty ? 'no_face' : violations.first,
      });
    } catch (_) {}
  }

  Future<void> dispose() async {
    _running = false;
    _bootTimer?.cancel();
    _cycle?.cancel();
    _countdown?.cancel();
  }
}

