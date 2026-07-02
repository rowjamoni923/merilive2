import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/native/livekit_bridge.dart';

/// C6 — Native LiveKit bridge for the host of a **video / game** party room.
///
/// The prejoin camera preview started by `CreatePartyPlaceholderPage` via
/// `LiveKitBridge.startLocalPreview` stays alive across the CreateParty →
/// PartyRoom navigation. When the host lands in the room this bridge:
///
///   1. mints a publish-capable LiveKit token from the shared
///      `livekit-token` edge function (same path web + Flutter use);
///   2. calls native `LiveKitBridge.connect(publishVideo:true,
///      publishAudio:true)` — the Kotlin plugin promotes the standalone
///      preview `Room` into the real party room so the Camera2 sensor is
///      NEVER torn down (zero-gap handoff);
///   3. mounts the local `SurfaceViewRenderer` behind the Flutter surface
///      via `attachLocal`.
///
/// Audio-only parties keep using the Dart `livekit_client` speaker path
/// (`PartyLiveKitService.upgradeToSpeaker`) — no camera involved.
class PartyHostVideoBridge {
  PartyHostVideoBridge(this._supabase);

  final SupabaseClient _supabase;

  bool _started = false;
  String? _roomId;

  bool get isActive => _started;

  Future<void> startAsHost({
    required String roomId,
    required String participantName,
  }) async {
    if (_started && _roomId == roomId) return;
    await stop();

    final res = await _supabase.functions.invoke(
      'livekit-token',
      body: {
        'roomName': 'party_$roomId',
        'roomType': 'party',
        'participantName': participantName,
        'partyCanPublish': true,
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
      throw StateError(
        'party_host_connect_failed:${connect['reason']}',
      );
    }
    // Mount SurfaceViewRenderer behind Flutter's transparent surface.
    await LiveKitBridge.instance.attachLocal();

    _started = true;
    _roomId = roomId;
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
    _roomId = null;
  }
}
