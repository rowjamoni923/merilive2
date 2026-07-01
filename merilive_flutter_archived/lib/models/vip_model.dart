/// VIP tier definition — `public.vip_tiers`
class VipTierModel {
  final String id;
  final int tierLevel; // 1..N
  final String tierName;
  final int priceDiamonds;
  final int durationDays;
  final List<String> perks;
  final String? badgeUrl;
  final String? color;
  final bool isActive;

  VipTierModel({
    required this.id,
    required this.tierLevel,
    required this.tierName,
    required this.priceDiamonds,
    required this.durationDays,
    this.perks = const [],
    this.badgeUrl,
    this.color,
    this.isActive = true,
  });

  factory VipTierModel.fromJson(Map<String, dynamic> json) {
    final perksRaw = json['perks'];
    final perksList = perksRaw is List
        ? perksRaw.map((e) => e.toString()).toList()
        : <String>[];
    return VipTierModel(
      id: json['id'] ?? '',
      tierLevel: (json['tier_level'] as num?)?.toInt() ?? 1,
      tierName: json['tier_name'] ?? 'VIP',
      priceDiamonds: (json['price_diamonds'] as num?)?.toInt() ?? 0,
      durationDays: (json['duration_days'] as num?)?.toInt() ?? 30,
      perks: perksList,
      badgeUrl: json['badge_url'],
      color: json['color'],
      isActive: json['is_active'] ?? true,
    );
  }
}

/// User VIP subscription — `public.user_vip_subscriptions`
class VipSubscriptionModel {
  final String id;
  final String userId;
  final String tierId;
  final int tierLevel;
  final DateTime startsAt;
  final DateTime expiresAt;
  final bool isActive;
  final bool autoRenew;

  VipSubscriptionModel({
    required this.id,
    required this.userId,
    required this.tierId,
    required this.tierLevel,
    required this.startsAt,
    required this.expiresAt,
    this.isActive = true,
    this.autoRenew = false,
  });

  factory VipSubscriptionModel.fromJson(Map<String, dynamic> json) {
    return VipSubscriptionModel(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      tierId: json['tier_id'] ?? '',
      tierLevel: (json['tier_level'] as num?)?.toInt() ?? 1,
      startsAt: json['starts_at'] != null ? DateTime.parse(json['starts_at']) : DateTime.now(),
      expiresAt: json['expires_at'] != null ? DateTime.parse(json['expires_at']) : DateTime.now(),
      isActive: json['is_active'] ?? true,
      autoRenew: json['auto_renew'] ?? false,
    );
  }

  bool get isExpired => DateTime.now().isAfter(expiresAt);
  Duration get timeRemaining => expiresAt.difference(DateTime.now());
}
