/// Shop item — `public.shop_items`
/// Categories: avatar_frame, entry_banner, vehicle, bubble, medal, vip_only
class ShopItemModel {
  final String id;
  final String name;
  final String? description;
  final String category; // frame | entrance | vehicle | bubble | medal
  final String itemType;
  final int priceCoins;
  final int priceDiamonds;
  final String? imageUrl;
  final String? animationUrl;
  final String? svgaUrl;
  final String? previewUrl;
  final int? durationDays; // null = permanent
  final bool isPermanent;
  final bool isActive;
  final int displayOrder;

  ShopItemModel({
    required this.id,
    required this.name,
    this.description,
    required this.category,
    this.itemType = 'cosmetic',
    this.priceCoins = 0,
    this.priceDiamonds = 0,
    this.imageUrl,
    this.animationUrl,
    this.svgaUrl,
    this.previewUrl,
    this.durationDays,
    this.isPermanent = false,
    this.isActive = true,
    this.displayOrder = 0,
  });

  factory ShopItemModel.fromJson(Map<String, dynamic> json) {
    return ShopItemModel(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      description: json['description'],
      category: json['category'] ?? 'frame',
      itemType: json['item_type'] ?? 'cosmetic',
      priceCoins: (json['price_coins'] as num?)?.toInt() ?? 0,
      priceDiamonds: (json['price_diamonds'] as num?)?.toInt() ?? 0,
      imageUrl: json['image_url'],
      animationUrl: json['animation_url'],
      svgaUrl: json['svga_url'],
      previewUrl: json['preview_url'],
      durationDays: (json['duration_days'] as num?)?.toInt(),
      isPermanent: json['is_permanent'] ?? false,
      isActive: json['is_active'] ?? true,
      displayOrder: (json['display_order'] as num?)?.toInt() ?? 0,
    );
  }

  /// Prefer static preview; fallback to image. Animation only when item is equipped/active.
  String? get displayUrl => previewUrl ?? imageUrl;
}
