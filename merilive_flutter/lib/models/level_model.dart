/// User level tier — `public.user_level_tiers`
class UserLevelTierModel {
  final String id;
  final int level;
  final int minRecharged; // total_recharged threshold (diamonds)
  final String? badgeUrl;
  final String? color;
  final List<String> perks;

  UserLevelTierModel({
    required this.id,
    required this.level,
    required this.minRecharged,
    this.badgeUrl,
    this.color,
    this.perks = const [],
  });

  factory UserLevelTierModel.fromJson(Map<String, dynamic> json) {
    final p = json['perks'];
    return UserLevelTierModel(
      id: json['id'] ?? '',
      level: (json['level'] as num?)?.toInt() ?? 0,
      minRecharged: (json['min_recharged'] as num?)?.toInt() ?? 0,
      badgeUrl: json['badge_url'],
      color: json['color'],
      perks: p is List ? p.map((e) => e.toString()).toList() : const [],
    );
  }
}

/// Host level tier — `public.host_levels`
/// Host level grows ONLY by host earnings (beans), never by recharge.
class HostLevelModel {
  final String id;
  final int levelNumber;
  final String levelName;
  final int beansRequired;
  final String? badgeUrl;
  final String? color;
  final List<String> perks;

  HostLevelModel({
    required this.id,
    required this.levelNumber,
    required this.levelName,
    required this.beansRequired,
    this.badgeUrl,
    this.color,
    this.perks = const [],
  });

  factory HostLevelModel.fromJson(Map<String, dynamic> json) {
    final p = json['perks'];
    return HostLevelModel(
      id: json['id'] ?? '',
      levelNumber: (json['level_number'] as num?)?.toInt() ?? 1,
      levelName: json['level_name'] ?? 'Host',
      beansRequired: (json['beans_required'] as num?)?.toInt() ??
          (json['min_beans'] as num?)?.toInt() ??
          0,
      badgeUrl: json['badge_url'],
      color: json['color'],
      perks: p is List ? p.map((e) => e.toString()).toList() : const [],
    );
  }
}
