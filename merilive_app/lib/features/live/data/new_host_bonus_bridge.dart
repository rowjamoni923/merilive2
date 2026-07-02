import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import '../widgets/new_host_bonus_card.dart';

/// H5 P0 #5 — New Host Live Bonus bridge (Flutter parity with
/// `src/components/live/NewHostBonusCard.tsx`).
///
/// Server-authoritative: calls `get_host_live_bonus_state`,
/// `record_host_live_minute` (every 60s while streaming), and
/// `claim_host_live_hour_bonus`. All eligibility/day windows come from
/// admin table `new_host_live_bonus_settings` (single source of truth).
class NewHostBonusState {
  final bool eligible;
  final int daysLeft;
  final int minutesStreamed;
  final int coinsEarned;
  final List<NewHostBonusMilestone> milestones;

  const NewHostBonusState({
    required this.eligible,
    required this.daysLeft,
    required this.minutesStreamed,
    required this.coinsEarned,
    required this.milestones,
  });

  static const empty = NewHostBonusState(
    eligible: false,
    daysLeft: 0,
    minutesStreamed: 0,
    coinsEarned: 0,
    milestones: [],
  );
}

class NewHostBonusBridge {
  NewHostBonusBridge._();
  static final instance = NewHostBonusBridge._();

  final _client = Supabase.instance.client;
  Timer? _minuteTicker;

  Future<NewHostBonusState> fetchState(String hostId) async {
    try {
      final res = await _client
          .rpc('get_host_live_bonus_state', params: {'_host_id': hostId});
      if (res is! Map) return NewHostBonusState.empty;
      final eligible = (res['eligible'] as bool?) ?? false;
      if (!eligible) return NewHostBonusState.empty;
      final daysLeft = (res['days_left'] as num?)?.toInt() ?? 0;
      final minutes = (res['minutes_streamed'] as num?)?.toInt() ??
          (res['minutes'] as num?)?.toInt() ??
          0;
      final coins = (res['coins_earned'] as num?)?.toInt() ??
          (res['coins'] as num?)?.toInt() ??
          0;
      final rawMs = res['milestones'];
      final milestones = <NewHostBonusMilestone>[];
      if (rawMs is List) {
        for (final m in rawMs) {
          if (m is Map) {
            milestones.add(NewHostBonusMilestone(
              label: (m['label'] as String?) ??
                  (m['hour'] != null ? 'Hour ${m['hour']}' : 'Milestone'),
              minutesGoal: (m['minutes_goal'] as num?)?.toInt() ??
                  (m['minutes'] as num?)?.toInt() ??
                  0,
              rewardCoins: (m['reward_coins'] as num?)?.toInt() ??
                  (m['reward'] as num?)?.toInt() ??
                  0,
              achieved: (m['achieved'] as bool?) ?? false,
            ));
          }
        }
      }
      return NewHostBonusState(
        eligible: true,
        daysLeft: daysLeft,
        minutesStreamed: minutes,
        coinsEarned: coins,
        milestones: milestones,
      );
    } catch (_) {
      return NewHostBonusState.empty;
    }
  }

  /// Starts a 60-second ticker that records each streamed minute. Idempotent.
  void startMinuteTicker(String hostId, {VoidCallback? onEachTick}) {
    _minuteTicker?.cancel();
    _minuteTicker = Timer.periodic(const Duration(seconds: 60), (_) async {
      try {
        await _client.rpc('record_host_live_minute',
            params: {'_host_id': hostId});
      } catch (_) {}
      onEachTick?.call();
    });
  }

  void stopMinuteTicker() {
    _minuteTicker?.cancel();
    _minuteTicker = null;
  }

  Future<String?> claimHour(String hostId, int hour) async {
    try {
      final res = await _client.rpc('claim_host_live_hour_bonus',
          params: {'_host_id': hostId, '_hour_number': hour});
      if (res is Map && res['success'] == true) return null;
      if (res is Map) return (res['error'] as String?) ?? 'Failed to claim';
      return 'Failed to claim';
    } catch (e) {
      return e.toString();
    }
  }
}

typedef VoidCallback = void Function();
