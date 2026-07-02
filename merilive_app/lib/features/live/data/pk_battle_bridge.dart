import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// A6 — PK Battle bridge (Flutter parity with `src/components/live/PKBattleActive.tsx`
/// + `PKPunishmentOverlay.tsx`).
///
/// Server-authoritative: subscribes to a single `pk_battles` row and streams
/// score / timer / winner / punishment window fields. NEVER writes back —
/// scoring is done by `bill_pk_gift()` and end/winner by `pk-battle-tick` cron.
class PkBattleSnapshot {
  const PkBattleSnapshot({
    required this.battleId,
    required this.challengerId,
    required this.opponentId,
    required this.challengerStreamId,
    required this.opponentStreamId,
    required this.challengerScore,
    required this.opponentScore,
    required this.startedAt,
    required this.durationSeconds,
    required this.status,
    required this.winnerUserId,
    required this.mvpUserId,
    required this.finalStatus,
    required this.punishmentEndTs,
    required this.challengerName,
    required this.challengerAvatar,
    required this.challengerLevel,
    required this.opponentName,
    required this.opponentAvatar,
    required this.opponentLevel,
  });

  final String battleId;
  final String challengerId;
  final String opponentId;
  final String? challengerStreamId;
  final String? opponentStreamId;
  final int challengerScore;
  final int opponentScore;
  final DateTime? startedAt;
  final int durationSeconds;
  final String status;
  final String? winnerUserId;
  final String? mvpUserId;
  final String? finalStatus;
  final DateTime? punishmentEndTs;
  final String challengerName;
  final String challengerAvatar;
  final int challengerLevel;
  final String opponentName;
  final String opponentAvatar;
  final int opponentLevel;

  bool get isEnded => status == 'ended';
  bool get inPunishment {
    final end = punishmentEndTs;
    if (end == null) return false;
    return end.isAfter(DateTime.now());
  }

  PkBattleSnapshot copyWithRow(Map<String, dynamic> row) {
    return PkBattleSnapshot(
      battleId: battleId,
      challengerId: challengerId,
      opponentId: opponentId,
      challengerStreamId: challengerStreamId,
      opponentStreamId: opponentStreamId,
      challengerScore: (row['challenger_score'] as num?)?.toInt() ?? challengerScore,
      opponentScore: (row['opponent_score'] as num?)?.toInt() ?? opponentScore,
      startedAt: _parseTs(row['started_at']) ?? startedAt,
      durationSeconds: (row['duration_seconds'] as num?)?.toInt() ?? durationSeconds,
      status: (row['status'] as String?) ?? status,
      winnerUserId: (row['winner_user_id'] as String?) ?? winnerUserId,
      mvpUserId: (row['mvp_user_id'] as String?) ?? mvpUserId,
      finalStatus: (row['final_status'] as String?) ?? finalStatus,
      punishmentEndTs: _parseTs(row['punishment_end_ts']) ?? punishmentEndTs,
      challengerName: challengerName,
      challengerAvatar: challengerAvatar,
      challengerLevel: challengerLevel,
      opponentName: opponentName,
      opponentAvatar: opponentAvatar,
      opponentLevel: opponentLevel,
    );
  }

  static DateTime? _parseTs(dynamic v) {
    if (v == null) return null;
    if (v is DateTime) return v;
    return DateTime.tryParse(v.toString());
  }
}

class PkBattleBridge {
  PkBattleBridge._();
  static final PkBattleBridge instance = PkBattleBridge._();

  final _client = Supabase.instance.client;
  RealtimeChannel? _channel;
  StreamController<PkBattleSnapshot?>? _controller;
  PkBattleSnapshot? _current;

  /// Emits the current active PK battle snapshot (or null when none is active).
  Stream<PkBattleSnapshot?> watch(String streamId) {
    _controller?.close();
    _channel?.let((c) => _client.removeChannel(c));
    _controller = StreamController<PkBattleSnapshot?>.broadcast();
    _current = null;
    _bootstrap(streamId);
    return _controller!.stream;
  }

  Future<void> _bootstrap(String streamId) async {
    try {
      final row = await _client
          .from('pk_battles')
          .select(
            'id, challenger_id, opponent_id, challenger_stream_id, opponent_stream_id, '
            'challenger_score, opponent_score, started_at, duration_seconds, status, '
            'winner_user_id, mvp_user_id, final_status, punishment_end_ts',
          )
          .or('challenger_stream_id.eq.$streamId,opponent_stream_id.eq.$streamId')
          .inFilter('status', ['accepted', 'active', 'ended'])
          .order('started_at', ascending: false)
          .limit(1)
          .maybeSingle();

      if (row == null) {
        _controller?.add(null);
        return;
      }

      // Skip stale ended battles (older than 3 min after punishment window).
      final endTs = PkBattleSnapshot._parseTs(row['punishment_end_ts']);
      if (row['status'] == 'ended' &&
          endTs != null &&
          endTs.isBefore(DateTime.now().subtract(const Duration(minutes: 3)))) {
        _controller?.add(null);
        return;
      }

      final challengerId = row['challenger_id']?.toString() ?? '';
      final opponentId = row['opponent_id']?.toString() ?? '';

      final profiles = await _client
          .from('profiles_public')
          .select('id, display_name, avatar_url, user_level, host_level, max_user_level')
          .inFilter('id', [challengerId, opponentId]);

      Map<String, dynamic>? cp;
      Map<String, dynamic>? op;
      for (final p in (profiles as List)) {
        final m = Map<String, dynamic>.from(p as Map);
        if (m['id'] == challengerId) cp = m;
        if (m['id'] == opponentId) op = m;
      }

      int lvl(Map<String, dynamic>? p) {
        if (p == null) return 1;
        final a = (p['max_user_level'] as num?)?.toInt() ?? 0;
        final b = (p['user_level'] as num?)?.toInt() ?? 0;
        final c = (p['host_level'] as num?)?.toInt() ?? 0;
        final v = [a, b, c].reduce((x, y) => x > y ? x : y);
        return v > 0 ? v : 1;
      }

      _current = PkBattleSnapshot(
        battleId: row['id'].toString(),
        challengerId: challengerId,
        opponentId: opponentId,
        challengerStreamId: row['challenger_stream_id']?.toString(),
        opponentStreamId: row['opponent_stream_id']?.toString(),
        challengerScore: (row['challenger_score'] as num?)?.toInt() ?? 0,
        opponentScore: (row['opponent_score'] as num?)?.toInt() ?? 0,
        startedAt: PkBattleSnapshot._parseTs(row['started_at']),
        durationSeconds: (row['duration_seconds'] as num?)?.toInt() ?? 300,
        status: (row['status'] as String?) ?? 'accepted',
        winnerUserId: row['winner_user_id'] as String?,
        mvpUserId: row['mvp_user_id'] as String?,
        finalStatus: row['final_status'] as String?,
        punishmentEndTs: PkBattleSnapshot._parseTs(row['punishment_end_ts']),
        challengerName: cp?['display_name']?.toString() ?? 'Host',
        challengerAvatar: cp?['avatar_url']?.toString() ?? '',
        challengerLevel: lvl(cp),
        opponentName: op?['display_name']?.toString() ?? 'Host',
        opponentAvatar: op?['avatar_url']?.toString() ?? '',
        opponentLevel: lvl(op),
      );
      _controller?.add(_current);

      final battleId = _current!.battleId;
      _channel = _client.channel('flutter_pk_$battleId')
        ..onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'pk_battles',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: battleId,
          ),
          callback: (payload) {
            final newRow = payload.newRecord;
            _current = _current?.copyWithRow(newRow);
            if (_current != null) _controller?.add(_current);
          },
        )
        ..subscribe();
    } catch (_) {
      _controller?.add(null);
    }
  }

  Future<void> dispose() async {
    final c = _channel;
    if (c != null) {
      _channel = null;
      await _client.removeChannel(c);
    }
    await _controller?.close();
    _controller = null;
    _current = null;
  }
}

extension _Let<T> on T {
  R let<R>(R Function(T) f) => f(this);
}
