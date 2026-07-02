import 'package:supabase_flutter/supabase_flutter.dart';

/// PK start bridge — Flutter parity with `PKBattlePanel.sendPKRequest` +
/// `LiveStream.startRandomPKSearch` in the web app.
///
/// All writes go through server-authoritative surfaces:
///   • `start_pk_battle` RPC (level ≥ 5, anti-double-accept, clamped duration).
///   • `pk-invite-deliver` edge fn (direct FCM + random-match dispatcher).
///
/// This bridge never mutates `pk_battles` directly. The observer stream lives
/// in `PkBattleBridge`; this file only handles the host-side START flow.
class PkInviteResult {
  const PkInviteResult({
    required this.ok,
    this.battleId,
    this.error,
    this.delivered,
    this.sessionId,
  });

  final bool ok;
  final String? battleId;
  final String? error;
  final int? delivered;
  final String? sessionId;
}

/// Small profile row for a live host in the picker list.
class PkLiveHost {
  const PkLiveHost({
    required this.id,
    required this.streamId,
    required this.displayName,
    required this.avatarUrl,
    required this.userLevel,
    required this.viewerCount,
  });

  final String id;
  final String streamId;
  final String displayName;
  final String avatarUrl;
  final int userLevel;
  final int viewerCount;
}

class PkStartBridge {
  PkStartBridge._();
  static final PkStartBridge instance = PkStartBridge._();

  final _client = Supabase.instance.client;

  /// Fetch all currently-live female hosts, excluding [selfUserId].
  /// Mirrors `PKBattlePanel.fetchLiveHosts` — orders by viewer_count desc.
  Future<List<PkLiveHost>> fetchLiveHosts({required String selfUserId}) async {
    final rows = await _client
        .from('live_streams')
        .select(
          'id, viewer_count, host_id, '
          'profiles!live_streams_host_id_fkey ( id, display_name, avatar_url, user_level, gender )',
        )
        .eq('is_active', true)
        .neq('host_id', selfUserId)
        .order('viewer_count', ascending: false);

    final out = <PkLiveHost>[];
    for (final r in (rows as List)) {
      final row = Map<String, dynamic>.from(r as Map);
      final prof = row['profiles'];
      if (prof is! Map) continue;
      final p = Map<String, dynamic>.from(prof);
      // Web PK panel is female-host only.
      if ((p['gender']?.toString() ?? '').toLowerCase() != 'female') continue;
      out.add(PkLiveHost(
        id: p['id']?.toString() ?? '',
        streamId: row['id']?.toString() ?? '',
        displayName: (p['display_name']?.toString().trim().isNotEmpty ?? false)
            ? p['display_name'].toString()
            : 'Host',
        avatarUrl: p['avatar_url']?.toString() ?? '',
        userLevel: (p['user_level'] as num?)?.toInt() ?? 1,
        viewerCount: (row['viewer_count'] as num?)?.toInt() ?? 0,
      ));
    }
    return out;
  }

  /// Direct invite — creates a `pk_battles` row via `start_pk_battle` then
  /// dispatches an FCM push through `pk-invite-deliver`.
  Future<PkInviteResult> sendDirectInvite({
    required PkLiveHost opponent,
    required String challengerStreamId,
    required String challengerUserId,
    required String challengerName,
    required String challengerAvatar,
    required int challengerLevel,
    required int durationSeconds,
  }) async {
    try {
      final rpc = await _client.rpc('start_pk_battle', params: {
        'p_opponent_id': opponent.id,
        'p_challenger_stream_id': challengerStreamId,
        'p_opponent_stream_id': opponent.streamId,
        'p_duration_seconds': durationSeconds,
      });
      final payload = (rpc is Map) ? Map<String, dynamic>.from(rpc) : const {};
      final ok = payload['ok'] == true;
      final battleId = payload['battle_id']?.toString();
      if (!ok || battleId == null || battleId.isEmpty) {
        return PkInviteResult(
          ok: false,
          error: payload['error']?.toString() ?? 'Failed to create PK invite',
        );
      }

      // Fire-and-forget FCM push. Battle row already exists; missed push
      // does not block the flow — opponent still sees pending invite.
      try {
        await _client.functions.invoke(
          'pk-invite-deliver',
          body: {
            'kind': 'direct_invite',
            'battleId': battleId,
            'toUserId': opponent.id,
            'fromUserId': challengerUserId,
            'fromName': challengerName,
            'fromAvatar': challengerAvatar,
            'fromLevel': challengerLevel,
            'fromStreamId': challengerStreamId,
            'toStreamId': opponent.streamId,
          },
        );
      } catch (_) {}

      return PkInviteResult(ok: true, battleId: battleId);
    } catch (e) {
      return PkInviteResult(ok: false, error: e.toString());
    }
  }

  /// Random-match invite — broadcasts through `pk-invite-deliver` and
  /// returns delivery count + sessionId used to cancel later.
  Future<PkInviteResult> startRandomMatch({
    required String challengerUserId,
    required String challengerName,
    required String challengerAvatar,
    required int challengerLevel,
    required String challengerStreamId,
    required int durationSeconds,
  }) async {
    try {
      final res = await _client.functions.invoke(
        'pk-invite-deliver',
        body: {
          'kind': 'random_invite',
          'fromUserId': challengerUserId,
          'fromName': challengerName,
          'fromAvatar': challengerAvatar,
          'fromLevel': challengerLevel,
          'fromStreamId': challengerStreamId,
          'durationSeconds': durationSeconds,
        },
      );
      final data = res.data;
      final payload = (data is Map) ? Map<String, dynamic>.from(data) : const {};
      final delivered = (payload['delivered'] as num?)?.toInt() ?? 0;
      final sessionId = payload['sessionId']?.toString() ?? '';
      if (sessionId.isEmpty || delivered == 0) {
        return const PkInviteResult(
          ok: false,
          error: 'No eligible live hosts available right now',
          delivered: 0,
        );
      }
      return PkInviteResult(
        ok: true,
        delivered: delivered,
        sessionId: sessionId,
      );
    } catch (e) {
      return PkInviteResult(ok: false, error: e.toString());
    }
  }

  /// Cancel a random-match session (best-effort).
  Future<void> cancelRandomMatch({
    required String challengerUserId,
    required String challengerName,
    required String inviteSessionId,
  }) async {
    try {
      await _client.functions.invoke(
        'pk-invite-deliver',
        body: {
          'kind': 'random_cancel',
          'fromUserId': challengerUserId,
          'fromName': challengerName,
          'inviteSessionId': inviteSessionId,
        },
      );
    } catch (_) {}
  }
}
