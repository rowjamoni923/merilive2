import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';

/// C4 — Native LiveKit bridge for a **live-stream host**.
///
/// Web-truth parity (`src/pages/LiveStream.tsx` mints a token with
/// `roomName: 'live_{id}'`, `roomType: 'live'` and publishes video+audio).
/// The GoLive prejoin screen already opened Camera2 via
/// `LiveKitBridge.startLocalPreview`; this bridge promotes that same
/// standalone Room into the real live room so the sensor is NEVER torn
/// down between prejoin → publish (zero-gap handoff, identical to the
/// PartyHostVideoBridge pattern).
///
/// Steps:
///   1. Mint a publish-capable token from the shared `livekit-token`
///      edge function (`roomType:'live'` — publisher is the RPC-verified
///      host, so the edge function grants publish grants automatically).
///   2. `LiveKitBridge.connect(publishVideo:true, publishAudio:true)` —
///      Kotlin plugin promotes the preview Room into the real room.
///   3. `attachLocal()` mounts the `SurfaceViewRenderer` behind Flutter's
///      transparent surface so the host sees their own preview.
///
/// The bridge is exposed as a singleton so ownership can safely hand off
/// from `GoLive` (creator) to the `LiveStream` host page (consumer/tear-
/// down) without re-connecting.
class LiveHostBridge {
  LiveHostBridge._();
  static final LiveHostBridge instance = LiveHostBridge._();

  bool _started = false;
  String? _streamId;

  bool get isActive => _started;
  String? get streamId => _streamId;

  Future<void> startAsHost({
    required String streamId,
    required String participantName,
  }) async {
    if (_started && _streamId == streamId) return;
    await stop();

    final client = Supabase.instance.client;
    final res = await client.functions.invoke(
      'livekit-token',
      body: {
        'roomName': 'live_$streamId',
        'roomType': 'live',
        'participantName': participantName,
      },
    );
    final data = res.data;
    if (data is! Map || data['token'] == null || data['url'] == null) {
      throw StateError('livekit_token_invalid_response');
    }

    await LiveKitBridge.instance.initialize();
    final connect = await LiveKitBridge.instance.connect(
      wsUrl: data['url'] as String,
      token: data['token'] as String,
      publishVideo: true,
      publishAudio: true,
    );
    if (connect['success'] == false && connect['reason'] != 'unimplemented') {
      throw StateError('live_host_connect_failed:${connect['reason']}');
    }
    try {
      await LiveKitBridge.instance.attachLocal();
    } catch (_) {}

    _started = true;
    _streamId = streamId;
  }

  Future<void> stop() async {
    if (!_started) return;
    try {
      await LiveKitBridge.instance.detachLocal();
    } catch (_) {}
    try {
      await LiveKitBridge.instance.disconnect();
    } catch (_) {}
    _started = false;
    _streamId = null;
  }
}
