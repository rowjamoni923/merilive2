/// MeriLive Gift Model — `public.gifts` table.
///
/// Read-only from Flutter. Sending a gift goes through `process_gift_transaction` RPC.
class GiftModel {
  final String id;
  final String name;
  final int coinPrice; // cost in diamonds
  final String? category; // wall | lucky | luxurious | vip | pro
  final String? iconUrl;
  final String? animationUrl; // SVGA / Lottie / MP4
  final String? soundUrl;
  final int? soundDurationMs;
  final bool isActive;
  final int? displayOrder;

  GiftModel({
    required this.id,
    required this.name,
    required this.coinPrice,
    this.category,
    this.iconUrl,
    this.animationUrl,
    this.soundUrl,
    this.soundDurationMs,
    this.isActive = true,
    this.displayOrder,
  });

  factory GiftModel.fromJson(Map<String, dynamic> json) {
    return GiftModel(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      coinPrice: (json['coin_price'] as num?)?.toInt() ?? 0,
      category: json['category'],
      iconUrl: json['icon_url'],
      animationUrl: json['animation_url'],
      soundUrl: json['sound_url'],
      soundDurationMs: (json['sound_duration_ms'] as num?)?.toInt(),
      isActive: json['is_active'] ?? true,
      displayOrder: (json['display_order'] as num?)?.toInt(),
    );
  }
}
