import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:livekit_client/livekit_client.dart' as lk;
import 'package:supabase_flutter/supabase_flutter.dart';

/// Phase F-24 — PK Cross-room Audio Bridge (Flutter port of
/// `src/hooks/usePKOpponentRoom.ts`).
///
/// During an active PK battle every client (host + viewers) creates a
/// **secondary subscribe-only** LiveKit connection to the opponent's
/// stream room so both crowds can hear both hosts without any
/// server-side track forwarding or shared-room migration.
///
///   Host A  → primary Room A (publish + subscribe)  +  Room B (subscribe)
///   Host B  → primary Room B (publish + subscribe)  +  Room A (subscribe)
///   Viewers → their host's primary  +  Opponent room (subscribe-only)
///
/// The bridge lives for the punishment-inclusive PK window only (≤180s).
/// LiveKit auto-plays subscribed audio tracks, so no extra rendering is
/// needed for hearability. The [videoTrack] listenable is exposed so a
/// future PK split-screen widget can render it directly.
class PkOpponentRoomBridge {
  PkOpponentRoomBridge._();
  static final PkOpponentRoomBridge instance = PkOpponentRoomBridge._();

  final ValueNotifier<String> status = ValueNotifier('idle');
  final ValueNotifier<lk.RemoteVideoTrack?> videoTrack = ValueNotifier(null);
  final ValueNotifier<lk.RemoteAudioTrack?> audioTrack = ValueNotifier(null);

  lk.Room? _room;
  String? _connectedStreamId;
  final _client = Supabase.instance.client;

  bool get isConnected =>
      _room?.connectionState == lk.ConnectionState.connected;

  /// Idempotent — reconnects only when [opponentStreamId] changes.
  /// Pass `null` to tear down.
  Future<void> connect({
    required String? opponentStreamId,
    required String participantName,
  }) async {
    if (opponentStreamId == null) {
      await disconnect();
      return;
    }
    if (_connectedStreamId == opponentStreamId && isConnected) return;
    await disconnect();

    status.value = 'connecting';
    try {
      final res = await _client.functions.invoke(
        'livekit-token',
        body: {
          'roomName': 'live_$opponentStreamId',
          'roomType': 'live',
          'participantName': participantName,
        },
      );
      final data = res.data;
      if (data is! Map || data['token'] == null || data['url'] == null) {
        throw StateError('livekit_token_invalid_response');
      }

      final room = lk.Room(
        roomOptions: const lk.RoomOptions(
          adaptiveStream: true,
          dynacast: true,
        ),
      );
      _room = room;
      _connectedStreamId = opponentStreamId;

      room.addListener(_rescanTracks);
      room.createListener()
        ..on<lk.TrackSubscribedEvent>((_) => _rescanTracks())
        ..on<lk.TrackUnsubscribedEvent>((_) => _rescanTracks())
        ..on<lk.ParticipantDisconnectedEvent>((_) => _rescanTracks())
        ..on<lk.RoomDisconnectedEvent>((_) {
          _clearTracks();
          status.value = 'disconnected';
        });

      await room.connect(
        data['url'] as String,
        data['token'] as String,
        connectOptions: const lk.ConnectOptions(autoSubscribe: true),
      );

      _rescanTracks();
    } catch (e) {
      status.value = 'error';
      _connectedStreamId = null;
      final r = _room;
      _room = null;
      if (r != null) {
        try { await r.disconnect(); } catch (_) {}
      }
    }
  }

  void _rescanTracks() {
    final room = _room;
    if (room == null) return;

    lk.RemoteVideoTrack? v;
    lk.RemoteAudioTrack? a;
    for (final p in room.remoteParticipants.values) {
      for (final pub in p.videoTrackPublications) {
        final t = pub.track;
        if (t is lk.RemoteVideoTrack) { v = t; break; }
      }
      for (final pub in p.audioTrackPublications) {
        final t = pub.track;
        if (t is lk.RemoteAudioTrack) { a = t; break; }
      }
      if (v != null || a != null) break;
    }
    videoTrack.value = v;
    audioTrack.value = a;
    status.value = (v != null || a != null) ? 'connected' : 'connecting';
  }

  void _clearTracks() {
    videoTrack.value = null;
    audioTrack.value = null;
  }

  Future<void> disconnect() async {
    final r = _room;
    _room = null;
    _connectedStreamId = null;
    _clearTracks();
    if (r != null) {
      try {
        r.removeListener(_rescanTracks);
        await r.disconnect();
      } catch (_) {}
    }
    if (status.value != 'idle') status.value = 'disconnected';
  }
}
