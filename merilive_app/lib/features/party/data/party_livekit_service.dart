import 'dart:async';

import 'package:livekit_client/livekit_client.dart' as lk;
import 'package:permission_handler/permission_handler.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// PD5b — LiveKit audio bridge for Party Rooms.
///
/// Contract:
///   • Every user (viewer + speaker) joins the LiveKit room as a subscriber
///     so they hear the room audio.
///   • Only seat holders publish their mic. Viewers stay subscribe-only.
///   • Mic capture is toggled via [setMicEnabled] — cheap, no reconnect.
///   • Room name follows web convention: `party_${roomId}`.
class PartyLiveKitService {
  PartyLiveKitService(this._supabase);

  final SupabaseClient _supabase;

  lk.Room? _room;
  String? _connectedRoomId;
  bool _canPublish = false;

  bool get isConnected => _room?.connectionState == lk.ConnectionState.connected;
  lk.Room? get room => _room;

  Future<_TokenBundle> _mintToken({
    required String roomId,
    required bool canPublish,
    required String participantName,
  }) async {
    final res = await _supabase.functions.invoke(
      'livekit-token',
      body: {
        'roomName': 'party_$roomId',
        'roomType': 'party',
        'participantName': participantName,
        'partyCanPublish': canPublish,
      },
    );
    final data = res.data;
    if (data is! Map || data['token'] == null || data['url'] == null) {
      throw StateError('livekit_token_invalid_response');
    }
    return _TokenBundle(
      token: data['token'] as String,
      url: data['url'] as String,
    );
  }

  /// Connect to the party room as viewer (subscribe-only).
  Future<void> connectAsViewer({
    required String roomId,
    required String participantName,
  }) async {
    if (isConnected && _connectedRoomId == roomId && !_canPublish) return;
    await disconnect();

    final tok = await _mintToken(
      roomId: roomId,
      canPublish: false,
      participantName: participantName,
    );

    final room = lk.Room(
      roomOptions: const lk.RoomOptions(
        adaptiveStream: true,
        dynacast: true,
      ),
    );
    await room.connect(
      tok.url,
      tok.token,
      connectOptions: const lk.ConnectOptions(autoSubscribe: true),
    );
    _room = room;
    _connectedRoomId = roomId;
    _canPublish = false;
  }

  /// Upgrade to speaker: reconnect with a publish-capable token and
  /// publish the mic track. Starts muted; call [setMicEnabled(true)] after.
  Future<void> upgradeToSpeaker({
    required String roomId,
    required String participantName,
  }) async {
    if (isConnected && _connectedRoomId == roomId && _canPublish) return;

    final granted = await _ensureMicPermission();
    if (!granted) throw StateError('mic_permission_denied');

    await disconnect();

    final tok = await _mintToken(
      roomId: roomId,
      canPublish: true,
      participantName: participantName,
    );

    final room = lk.Room(
      roomOptions: const lk.RoomOptions(
        adaptiveStream: true,
        dynacast: true,
        defaultAudioPublishOptions: lk.AudioPublishOptions(
          dtx: true,
          red: true,
        ),
      ),
    );
    await room.connect(
      tok.url,
      tok.token,
      connectOptions: const lk.ConnectOptions(autoSubscribe: true),
    );
    // Publish mic, start muted for safety — cubit toggles unmute.
    await room.localParticipant?.setMicrophoneEnabled(false);
    _room = room;
    _connectedRoomId = roomId;
    _canPublish = true;
  }

  /// Downgrade a speaker back to viewer without leaving the room audio.
  Future<void> downgradeToViewer({
    required String roomId,
    required String participantName,
  }) async {
    if (!_canPublish) return;
    await connectAsViewer(roomId: roomId, participantName: participantName);
  }

  Future<void> setMicEnabled(bool enabled) async {
    final lp = _room?.localParticipant;
    if (lp == null || !_canPublish) return;
    await lp.setMicrophoneEnabled(enabled);
  }

  Future<void> disconnect() async {
    final r = _room;
    _room = null;
    _connectedRoomId = null;
    _canPublish = false;
    if (r != null) {
      try {
        await r.disconnect();
      } catch (_) {}
      try {
        await r.dispose();
      } catch (_) {}
    }
  }

  Future<bool> _ensureMicPermission() async {
    final status = await Permission.microphone.request();
    return status.isGranted || status.isLimited;
  }
}

class _TokenBundle {
  _TokenBundle({required this.token, required this.url});
  final String token;
  final String url;
}
