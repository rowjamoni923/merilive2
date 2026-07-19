import 'package:supabase_flutter/supabase_flutter.dart';

import 'leaderboard_models.dart';

/// Repository — mirrors the four data fetches in `src/pages/Leaderboard.tsx`.
///
/// * `get_host_earnings_leaderboard` / `get_game_rankings_leaderboard` /
///   `get_top_gifters_leaderboard` — server-side RPCs that already apply
///   period buckets + Asia/Dhaka 12:30 reset.
/// * PK: reads `pk_competitions` (active/upcoming) then aggregates
///   participants dynamically based on `competition_type`.
class LeaderboardRepository {
  LeaderboardRepository(this._client);
  final SupabaseClient _client;

  // Demo/admin exclusion parity with web (see Leaderboard.tsx EXCLUDED_IDS).
  static const _excludedIds = <String>{
    '6888e618-ae45-4bbb-bbd2-6834fc0f9ff9',
    'ab155d31-96d4-4a42-855d-b2c090ba0339',
    '251cbe57-e46b-41c0-bfb5-4cfcad9d6499',
  };

  Future<List<RankingEntry>> fetchRankings({
    required LeaderboardCategory category,
    required LeaderboardPeriod period,
  }) async {
    if (category == LeaderboardCategory.pkCompetition) return const [];
    final rpcName = switch (category) {
      LeaderboardCategory.hostEarning => 'get_host_earnings_leaderboard',
      LeaderboardCategory.gameRanking => 'get_game_rankings_leaderboard',
      LeaderboardCategory.topGifter => 'get_top_gifters_leaderboard',
      _ => '',
    };
    final res = await _client.rpc(rpcName, params: {
      'p_period_type': period.dbKey,
    });
    final list = (res as List?) ?? const [];
    return list
        .whereType<Map>()
        .map((m) => RankingEntry.fromJson(Map<String, dynamic>.from(m)))
        .where((r) => !_excludedIds.contains(r.id))
        .take(50)
        .toList(growable: false);
  }

  Future<List<RewardTier>> fetchRewardTiers({
    required LeaderboardCategory category,
    required LeaderboardPeriod period,
  }) async {
    if (category == LeaderboardCategory.pkCompetition) return const [];
    final res = await _client
        .from('leaderboard_reward_config')
        .select('rank_from,rank_to,reward_diamonds,reward_diamonds,reward_beans')
        .eq('category', category.dbKey)
        .eq('period_type', period.dbKey)
        .eq('is_active', true)
        .order('rank_from');
    return (res as List)
        .whereType<Map>()
        .map((m) => RewardTier.fromJson(Map<String, dynamic>.from(m)))
        .toList(growable: false);
  }

  Future<List<PkCompetitionRow>> fetchPkCompetitions() async {
    final res = await _client
        .from('pk_competitions')
        .select(
            'id,title,description,start_date,end_date,status,competition_type')
        .inFilter('status', ['active', 'upcoming'])
        .eq('is_active', true)
        .order('start_date', ascending: false)
        .limit(10);
    return (res as List)
        .whereType<Map>()
        .map((m) => PkCompetitionRow.fromJson(Map<String, dynamic>.from(m)))
        .toList(growable: false);
  }

  Future<List<RewardTier>> fetchPkRewardTiers(String competitionId) async {
    final res = await _client
        .from('pk_competition_rewards')
        .select('rank_from,rank_to,reward_diamonds,reward_diamonds,reward_beans')
        .eq('competition_id', competitionId)
        .eq('is_active', true)
        .order('rank_from');
    return (res as List)
        .whereType<Map>()
        .map((m) => RewardTier.fromJson(Map<String, dynamic>.from(m)))
        .toList(growable: false);
  }

  Future<List<RankingEntry>> fetchPkParticipants(PkCompetitionRow comp) async {
    final startIso = comp.startDate.toIso8601String();
    final endIso = comp.endDate.toIso8601String();
    final type = comp.competitionType;
    final stats = <String, num>{};

    if (type == 'gift_sending' || type == 'diamonds_spent') {
      final res = await _client
          .from('gift_transactions')
          .select('sender_id,diamond_amount')
          .gte('created_at', startIso)
          .lte('created_at', endIso);
      for (final row in (res as List).whereType<Map>()) {
        final id = row['sender_id']?.toString();
        if (id == null) continue;
        stats[id] = (stats[id] ?? 0) + ((row['diamond_amount'] as num?) ?? 0);
      }
    } else if (type == 'gift_receiving' || type == 'beans_earned') {
      final res = await _client
          .from('gift_transactions')
          .select('receiver_id,diamond_amount')
          .gte('created_at', startIso)
          .lte('created_at', endIso);
      for (final row in (res as List).whereType<Map>()) {
        final id = row['receiver_id']?.toString();
        if (id == null) continue;
        final diamond = ((row['diamond_amount'] as num?) ?? 0);
        stats[id] = (stats[id] ?? 0) + (diamond * 0.6).floor();
      }
    } else {
      final res = await _client
          .from('pk_participants')
          .select('user_id,score')
          .eq('competition_id', comp.id)
          .order('score', ascending: false)
          .limit(50);
      for (final row in (res as List).whereType<Map>()) {
        final id = row['user_id']?.toString();
        if (id == null) continue;
        stats[id] = (row['score'] as num?) ?? 0;
      }
    }

    final ids = stats.entries
        .where((e) => e.value > 0 && !_excludedIds.contains(e.key))
        .map((e) => e.key)
        .toList(growable: false);
    if (ids.isEmpty) return const [];

    final profiles = await _client
        .from('profiles_public')
        .select(
            'id,display_name,app_uid,avatar_url,country_flag,host_level,user_level,max_user_level,gender,is_host')
        .inFilter('id', ids);
    final pmap = <String, Map<String, dynamic>>{};
    for (final row in (profiles as List).whereType<Map>()) {
      pmap[row['id'].toString()] = Map<String, dynamic>.from(row);
    }

    final sorted = ids
        .map((id) {
          final p = pmap[id];
          return RankingEntry(
            id: id,
            statValue: stats[id] ?? 0,
            displayName: p?['display_name']?.toString(),
            appUid: p?['app_uid']?.toString(),
            avatarUrl: p?['avatar_url']?.toString(),
            countryFlag: p?['country_flag']?.toString(),
            hostLevel: (p?['host_level'] as num?)?.toInt(),
            userLevel: (p?['user_level'] as num?)?.toInt(),
            maxUserLevel: (p?['max_user_level'] as num?)?.toInt(),
            gender: p?['gender']?.toString(),
            isHost: p?['is_host'] as bool?,
          );
        })
        .toList()
      ..sort((a, b) => b.statValue.compareTo(a.statValue));
    return sorted.take(50).toList(growable: false);
  }
}
