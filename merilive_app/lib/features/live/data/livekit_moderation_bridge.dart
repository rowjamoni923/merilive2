import 'package:supabase_flutter/supabase_flutter.dart';

/// Host-side LiveKit moderation bridge — Flutter parity with
/// `src/lib/livekitModeration.ts` + `src/lib/livekitUpdatePermission.ts`.
///
/// All actions are LiveKit-permission based (Supabase state stays untouched).
/// Server verifies caller owns the room (live_streams.host_id or
/// party_rooms.host_id) before executing.
class LiveKitModerationResult {
  const LiveKitModerationResult({required this.ok, this.error});
  final bool ok;
  final String? error;
}

class LiveKitModerationBridge {
  LiveKitModerationBridge._();
  static final LiveKitModerationBridge instance = LiveKitModerationBridge._();

  final _client = Supabase.instance.client;

  Future<LiveKitModerationResult> _invokeModerate(
    String action, {
    required String roomName,
    String? identity,
    String? reason,
  }) async {
    try {
      final body = <String, dynamic>{
        'action': action,
        'roomName': roomName,
        if (identity != null) 'identity': identity,
        if (reason != null) 'reason': reason,
      };
      final res =
          await _client.functions.invoke('livekit-moderate', body: body);
      final data = res.data;
      if (data is Map && data['success'] == true) {
        return const LiveKitModerationResult(ok: true);
      }
      final err = (data is Map ? data['error']?.toString() : null) ??
          'unknown_error';
      return LiveKitModerationResult(ok: false, error: err);
    } catch (e) {
      return LiveKitModerationResult(ok: false, error: e.toString());
    }
  }

  Future<LiveKitModerationResult> _invokeUpdatePermission({
    required String roomName,
    required String identity,
    required Map<String, dynamic> permission,
    String? reason,
  }) async {
    try {
      final body = <String, dynamic>{
        'roomName': roomName,
        'identity': identity,
        'permission': permission,
        if (reason != null) 'reason': reason,
      };
      final res = await _client.functions
          .invoke('livekit-update-permission', body: body);
      final data = res.data;
      if (data is Map && data['success'] == true) {
        return const LiveKitModerationResult(ok: true);
      }
      final err = (data is Map ? data['error']?.toString() : null) ??
          'unknown_error';
      return LiveKitModerationResult(ok: false, error: err);
    } catch (e) {
      return LiveKitModerationResult(ok: false, error: e.toString());
    }
  }

  // ── Moderation actions (mute / kick) ────────────────────────────────────
  Future<LiveKitModerationResult> muteParticipantAudio({
    required String roomName,
    required String identity,
    String? reason,
  }) =>
      _invokeModerate('mute_participant_audio',
          roomName: roomName, identity: identity, reason: reason);

  Future<LiveKitModerationResult> unmuteParticipantAudio({
    required String roomName,
    required String identity,
    String? reason,
  }) =>
      _invokeModerate('unmute_participant_audio',
          roomName: roomName, identity: identity, reason: reason);

  Future<LiveKitModerationResult> kickParticipant({
    required String roomName,
    required String identity,
    String? reason,
  }) =>
      _invokeModerate('kick_participant',
          roomName: roomName, identity: identity, reason: reason);

  Future<LiveKitModerationResult> muteAllAudio({
    required String roomName,
    String? reason,
  }) =>
      _invokeModerate('mute_all_audio', roomName: roomName, reason: reason);

  Future<LiveKitModerationResult> unmuteAllAudio({
    required String roomName,
    String? reason,
  }) =>
      _invokeModerate('unmute_all_audio', roomName: roomName, reason: reason);

  // ── Update permission (promote / demote / lock mic) ────────────────────
  Future<LiveKitModerationResult> promoteToSpeaker({
    required String roomName,
    required String identity,
    String? reason,
  }) =>
      _invokeUpdatePermission(
        roomName: roomName,
        identity: identity,
        reason: reason,
        permission: const {
          'canPublish': true,
          'canSubscribe': true,
          'canPublishData': true,
          'canPublishSources': [
            'camera',
            'microphone',
            'screen_share',
            'screen_share_audio',
          ],
        },
      );

  Future<LiveKitModerationResult> demoteToAudience({
    required String roomName,
    required String identity,
    String? reason,
  }) =>
      _invokeUpdatePermission(
        roomName: roomName,
        identity: identity,
        reason: reason,
        permission: const {
          'canPublish': false,
          'canSubscribe': true,
          'canPublishData': true,
        },
      );

  Future<LiveKitModerationResult> lockMicrophone({
    required String roomName,
    required String identity,
    String? reason,
  }) =>
      _invokeUpdatePermission(
        roomName: roomName,
        identity: identity,
        reason: reason,
        permission: const {
          'canPublish': true,
          'canSubscribe': true,
          'canPublishData': true,
          'canPublishSources': ['camera', 'screen_share'],
        },
      );
}
