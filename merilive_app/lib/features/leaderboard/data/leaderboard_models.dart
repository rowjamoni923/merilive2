// Leaderboard data models — parity with src/pages/Leaderboard.tsx.
//
// Four categories × three periods. PK competition uses its own row set
// (pk_competitions + dynamic participants) instead of RPC-backed leaderboards.

enum LeaderboardCategory { hostEarning, gameRanking, topGifter, pkCompetition }

extension LeaderboardCategoryX on LeaderboardCategory {
  /// DB category key used by `leaderboard_reward_config` +
  /// `leaderboard_podium_frames`. Mirrors `getCategoryDbKey()` on web.
  String get dbKey {
    switch (this) {
      case LeaderboardCategory.hostEarning:
        return 'host_earnings';
      case LeaderboardCategory.gameRanking:
        return 'game_winners';
      case LeaderboardCategory.topGifter:
        return 'top_gifters';
      case LeaderboardCategory.pkCompetition:
        return 'pk_competition';
    }
  }

  String get label {
    switch (this) {
      case LeaderboardCategory.hostEarning:
        return 'Charm';
      case LeaderboardCategory.gameRanking:
        return 'Game';
      case LeaderboardCategory.topGifter:
        return 'Wealth';
      case LeaderboardCategory.pkCompetition:
        return 'PK';
    }
  }
}

enum LeaderboardPeriod { daily, weekly, monthly }

extension LeaderboardPeriodX on LeaderboardPeriod {
  String get dbKey => switch (this) {
        LeaderboardPeriod.daily => 'daily',
        LeaderboardPeriod.weekly => 'weekly',
        LeaderboardPeriod.monthly => 'monthly',
      };
  String get label => switch (this) {
        LeaderboardPeriod.daily => 'Daily',
        LeaderboardPeriod.weekly => 'Weekly',
        LeaderboardPeriod.monthly => 'Monthly',
      };
}

class RankingEntry {
  final String id;
  final String? displayName;
  final String? appUid;
  final String? avatarUrl;
  final String? countryFlag;
  final int? hostLevel;
  final int? userLevel;
  final int? maxUserLevel;
  final String? gender;
  final bool? isHost;
  final num statValue;

  const RankingEntry({
    required this.id,
    required this.statValue,
    this.displayName,
    this.appUid,
    this.avatarUrl,
    this.countryFlag,
    this.hostLevel,
    this.userLevel,
    this.maxUserLevel,
    this.gender,
    this.isHost,
  });

  String get display => displayName ?? (appUid ?? 'User');
  int get displayLevel {
    final u = userLevel ?? 0;
    final m = maxUserLevel ?? 0;
    final h = hostLevel ?? 0;
    return [u, m, h].reduce((a, b) => a > b ? a : b);
  }

  factory RankingEntry.fromJson(Map<String, dynamic> j) => RankingEntry(
        id: (j['id'] ?? '').toString(),
        displayName: j['display_name']?.toString(),
        appUid: j['app_uid']?.toString(),
        avatarUrl: j['avatar_url']?.toString(),
        countryFlag: j['country_flag']?.toString(),
        hostLevel: (j['host_level'] as num?)?.toInt(),
        userLevel: (j['user_level'] as num?)?.toInt(),
        maxUserLevel: (j['max_user_level'] as num?)?.toInt(),
        gender: j['gender']?.toString(),
        isHost: j['is_host'] as bool?,
        statValue: (j['stat_value'] as num?) ?? 0,
      );
}

class RewardTier {
  final int rankFrom;
  final int rankTo;
  final int rewardCoins;
  final int rewardDiamonds;
  final int rewardBeans;
  const RewardTier({
    required this.rankFrom,
    required this.rankTo,
    required this.rewardCoins,
    required this.rewardDiamonds,
    required this.rewardBeans,
  });
  factory RewardTier.fromJson(Map<String, dynamic> j) => RewardTier(
        rankFrom: (j['rank_from'] as num?)?.toInt() ?? 0,
        rankTo: (j['rank_to'] as num?)?.toInt() ?? 0,
        rewardCoins: (j['reward_coins'] as num?)?.toInt() ?? 0,
        rewardDiamonds: (j['reward_diamonds'] as num?)?.toInt() ?? 0,
        rewardBeans: (j['reward_beans'] as num?)?.toInt() ?? 0,
      );

  bool covers(int rank) => rank >= rankFrom && rank <= rankTo;

  String get shortLabel {
    final parts = <String>[];
    if (rewardBeans > 0) parts.add('${_fmt(rewardBeans)}B');
    if (rewardDiamonds > 0) parts.add('${_fmt(rewardDiamonds)}💎');
    if (rewardCoins > 0) parts.add('${_fmt(rewardCoins)}💰');
    return parts.join(' + ');
  }
}

class PkCompetitionRow {
  final String id;
  final String title;
  final String? description;
  final DateTime startDate;
  final DateTime endDate;
  final String status;
  final String competitionType;

  const PkCompetitionRow({
    required this.id,
    required this.title,
    required this.startDate,
    required this.endDate,
    required this.status,
    required this.competitionType,
    this.description,
  });

  factory PkCompetitionRow.fromJson(Map<String, dynamic> j) => PkCompetitionRow(
        id: (j['id'] ?? '').toString(),
        title: (j['title'] ?? '').toString(),
        description: j['description']?.toString(),
        startDate: DateTime.parse(j['start_date'].toString()),
        endDate: DateTime.parse(j['end_date'].toString()),
        status: (j['status'] ?? '').toString(),
        competitionType:
            (j['competition_type'] ?? 'gift_receiving').toString(),
      );
}

String _fmt(num n) {
  if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
  if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}K';
  return n.toString();
}

String formatStat(num n) => _fmt(n);
