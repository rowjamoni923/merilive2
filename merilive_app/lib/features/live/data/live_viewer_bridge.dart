import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';

/// A1 — Native LiveKit bridge for a **live-stream viewer**.
///
/// Web-truth parity (`src/pages/LiveStream.tsx`):
///   1. Call `join_live_stream_viewer` RPC (server increments viewer_count
///      + creates `stream_viewers` row).
///   2. Mint a subscribe-only token from the shared `livekit-token`
///      edge function (`roomType:'live'` — no publish grants because the
///      caller is not the RPC-verified host).
///   3. `LiveKitBridge.connect(publishVideo:false, publishAudio:false)` —
///      the Kotlin plugin auto-attaches the first remote video track to
///      the SurfaceViewRenderer that sits behind Flutter's transparent
///      surface (identical to the web `LiveKitVideoRenderer` mount).
///   4. Fire `viewer_heartbeat` every 30s so the server cron doesn't
///      reap this viewer as stale (>90s idle).
///   5. On stop: `leave_live_stream_viewer` RPC + disconnect.
class LiveViewerBridge {
  LiveViewerBridge._();
  static final LiveViewerBridge instance = LiveViewerBridge._();

  bool _joined = false;
  String? _streamId;
  Timer? _heartbeatTimer;

  bool get isActive => _joined;
  String? get streamId => _streamId;

  Future<void> joinAsViewer({
    required String streamId,
    required String participantName,
  }) async {
    if (_joined && _streamId == streamId) return;
    await leave();

    final client = Supabase.instance.client;

    // 1) Server-authoritative enter (viewer_count++, stream_viewers row).
    //    Live streams are always public (industry-standard: Chamet / Bigo /
    //    Poppo / Olamet never gate live rooms behind passwords).
    try {
      await client.rpc('join_live_stream_viewer', params: {
        'p_stream_id': streamId,
      });
    } catch (_) {
      // Non-fatal — viewing can still proceed if RPC hiccups; the row
      // will be reconciled by the next heartbeat / cron sweep.
    }

    // 2) Mint subscribe-only token.
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

    // 3) Native connect — subscribe only.
    await LiveKitBridge.instance.initialize();
    final connect = await LiveKitBridge.instance.connect(
      wsUrl: data['url'] as String,
      token: data['token'] as String,
      publishVideo: false,
      publishAudio: false,
    );
    if (connect['success'] == false && connect['reason'] != 'unimplemented') {
      throw StateError('live_viewer_connect_failed:${connect['reason']}');
    }

    // 4) 30s heartbeat (matches src/pages/LiveStream.tsx viewer_heartbeat).
    _heartbeatTimer?.cancel();
    _heartbeatTimer = Timer.periodic(const Duration(seconds: 30), (_) async {
      try {
        await client.rpc('viewer_heartbeat', params: {
          'p_stream_id': streamId,
        });
      } catch (_) {}
    });

    _joined = true;
    _streamId = streamId;
  }

  Future<void> leave() async {
    _heartbeatTimer?.cancel();
    _heartbeatTimer = null;
    final streamId = _streamId;
    _joined = false;
    _streamId = null;

    try {
      await LiveKitBridge.instance.disconnect();
    } catch (_) {}

    if (streamId != null) {
      try {
        await Supabase.instance.client.rpc(
          'leave_live_stream_viewer',
          params: {'p_stream_id': streamId},
        );
      } catch (_) {}
    }
  }
}
