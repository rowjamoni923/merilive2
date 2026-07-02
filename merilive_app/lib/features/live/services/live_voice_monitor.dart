import 'dart:async';
import 'dart:convert';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';

/// Phase E-19 — Live voice moderation (Dart port of
/// `src/hooks/useLiveVoiceMonitor.ts`).
///
/// Every [intervalMs] captures a [chunkMs] audio sample from the local
/// mic via [LiveKitBridge.snapshotVoiceChunk], base64-encodes it and
/// POSTs to the `live-voice-moderate` edge function which runs the
/// ElevenLabs Scribe transcription + unicode-hardened contact regex.
/// Server applies penalties via the shared `process_contact_violation`
/// RPC so voice + text stay synchronized with the web build.
///
/// Native side is expected to reuse the already-published LiveKit audio
/// track so we never open a second mic. Until the native
/// `snapshotVoiceChunk` handler lands the monitor is dormant (returns
/// `unimplemented` — logged once, then silent).
class LiveVoiceMonitor {
  LiveVoiceMonitor({
    required this.streamId,
    required this.userId,
    this.chunkMs = 20000,
    this.intervalMs = 30000,
    this.onViolation,
  });

  final String streamId;
  final String userId;
  final int chunkMs;
  final int intervalMs;
  final void Function(_VoiceViolation info)? onViolation;

  final _client = Supabase.instance.client;
  Timer? _cycle;
  bool _inFlight = false;
  bool _running = false;
  bool _loggedUnimplemented = false;

  bool micEnabled = true;

  void start() {
    if (_running) return;
    _running = true;
    // First sample after 5s so the room finishes connecting.
    Timer(const Duration(seconds: 5), _tick);
    _cycle = Timer.periodic(Duration(milliseconds: intervalMs), (_) => _tick());
  }

  Future<void> _tick() async {
    if (!_running || _inFlight || !micEnabled) return;
    _inFlight = true;
    try {
      final res = await LiveKitBridge.instance
          .snapshotVoiceChunk(ms: chunkMs);
      final ok = res['ok'] == true || res['success'] == true;
      if (!ok) {
        if (res['reason'] == 'unimplemented' && !_loggedUnimplemented) {
          _loggedUnimplemented = true;
          // Native handler missing — remain dormant.
        }
        return;
      }
      final b64 = res['base64'] as String?;
      if (b64 == null || b64.length < 2000) return;

      final invoke = await _client.functions.invoke(
        'live-voice-moderate',
        body: {
          'context': 'live',
          'source_id': streamId,
          'user_id': userId,
          'audio_base64': b64,
          'mime': res['mime'] ?? 'audio/webm',
        },
      );
      final data = invoke.data;
      if (data is Map &&
          data['detected'] == true &&
          data['matches'] is List &&
          (data['matches'] as List).isNotEmpty) {
        onViolation?.call(_VoiceViolation(
          matches: (data['matches'] as List).map((e) => '$e').toList(),
          beansDeducted: (data['beans_deducted'] as num?)?.toInt() ?? 0,
          violationNumber: (data['violation_number'] as num?)?.toInt() ?? 0,
          confidence: (data['confidence'] as String?) ?? 'low',
        ));
      }
    } catch (_) {
      // Silent — safety monitor never breaks the stream.
    } finally {
      _inFlight = false;
    }
  }

  Future<void> dispose() async {
    _running = false;
    _cycle?.cancel();
    _cycle = null;
  }
}

class _VoiceViolation {
  const _VoiceViolation({
    required this.matches,
    required this.beansDeducted,
    required this.violationNumber,
    required this.confidence,
  });
  final List<String> matches;
  final int beansDeducted;
  final int violationNumber;
  final String confidence;
}
