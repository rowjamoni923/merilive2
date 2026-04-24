/// MeriLive Recharge / Diamond Top-Up models — `public.coin_packages`, `public.payment_gateways`,
/// `public.recharge_transactions`, `public.first_recharge_bonus`, `public.recharge_campaigns`.
///
/// Mirrors the web `src/pages/Recharge.tsx` 1:1.

/// Diamond package (Google Play tier OR direct USD purchase).
class CoinPackageModel {
  final String id;
  final String name;
  final int coinsAmount; // diamonds delivered
  final double priceUsd;
  final int bonusCoins;
  final int discountPercent;
  final bool isPopular;
  final bool isActive;
  final int displayOrder;
  final String? iconUrl;
  final String? description;
  final String? productId; // Google Play SKU
  final Map<String, dynamic> localPrices; // optional country-local price overrides

  CoinPackageModel({
    required this.id,
    required this.name,
    required this.coinsAmount,
    required this.priceUsd,
    this.bonusCoins = 0,
    this.discountPercent = 0,
    this.isPopular = false,
    this.isActive = true,
    this.displayOrder = 0,
    this.iconUrl,
    this.description,
    this.productId,
    this.localPrices = const {},
  });

  factory CoinPackageModel.fromJson(Map<String, dynamic> json) {
    return CoinPackageModel(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      coinsAmount: (json['coins_amount'] as num?)?.toInt() ?? 0,
      priceUsd: (json['price_usd'] as num?)?.toDouble() ?? 0.0,
      bonusCoins: (json['bonus_coins'] as num?)?.toInt() ?? 0,
      discountPercent: (json['discount_percent'] as num?)?.toInt() ?? 0,
      isPopular: json['is_popular'] ?? false,
      isActive: json['is_active'] ?? true,
      displayOrder: (json['display_order'] as num?)?.toInt() ?? 0,
      iconUrl: json['icon_url'],
      description: json['description'],
      productId: json['product_id'],
      localPrices: json['local_prices'] is Map
          ? Map<String, dynamic>.from(json['local_prices'])
          : const {},
    );
  }

  int get totalDiamonds => coinsAmount + bonusCoins;
}

/// Payment gateway — `public.payment_gateways`
class PaymentGatewayModel {
  final String id;
  final String name;
  final String gatewayType; // stripe | zinipay | sslcommerz | playstore | manual
  final String? logoUrl;
  final List<String> supportedCurrencies;
  final List<String> countryCodes;
  final bool isIntegrated;
  final bool isActive;
  final int displayOrder;
  final Map<String, dynamic> config;

  PaymentGatewayModel({
    required this.id,
    required this.name,
    required this.gatewayType,
    this.logoUrl,
    this.supportedCurrencies = const [],
    this.countryCodes = const [],
    this.isIntegrated = false,
    this.isActive = true,
    this.displayOrder = 0,
    this.config = const {},
  });

  factory PaymentGatewayModel.fromJson(Map<String, dynamic> json) {
    return PaymentGatewayModel(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      gatewayType: json['gateway_type'] ?? 'manual',
      logoUrl: json['logo_url'],
      supportedCurrencies: json['supported_currencies'] is List
          ? List<String>.from(json['supported_currencies'])
          : const [],
      countryCodes: json['country_codes'] is List
          ? List<String>.from(json['country_codes'])
          : const [],
      isIntegrated: json['is_integrated'] ?? false,
      isActive: json['is_active'] ?? true,
      displayOrder: (json['display_order'] as num?)?.toInt() ?? 0,
      config: json['config'] is Map
          ? Map<String, dynamic>.from(json['config'])
          : const {},
    );
  }
}

/// Recharge transaction — `public.recharge_transactions`
class RechargeTransactionModel {
  final String id;
  final String userId;
  final String? packageId;
  final String? gatewayId;
  final int diamondsCredited;
  final double amountUsd;
  final String status; // pending | success | failed | refunded
  final String? paymentRef;
  final DateTime createdAt;
  final DateTime? completedAt;

  RechargeTransactionModel({
    required this.id,
    required this.userId,
    this.packageId,
    this.gatewayId,
    required this.diamondsCredited,
    required this.amountUsd,
    this.status = 'pending',
    this.paymentRef,
    required this.createdAt,
    this.completedAt,
  });

  factory RechargeTransactionModel.fromJson(Map<String, dynamic> json) {
    return RechargeTransactionModel(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      packageId: json['package_id'],
      gatewayId: json['gateway_id'],
      diamondsCredited: (json['diamonds_credited'] as num?)?.toInt() ??
          (json['coins_amount'] as num?)?.toInt() ??
          0,
      amountUsd: (json['amount_usd'] as num?)?.toDouble() ?? 0.0,
      status: json['status'] ?? 'pending',
      paymentRef: json['payment_ref'],
      createdAt: json['created_at'] != null
          ? DateTime.parse(json['created_at'])
          : DateTime.now(),
      completedAt: json['completed_at'] != null
          ? DateTime.tryParse(json['completed_at'])
          : null,
    );
  }
}

/// First-recharge bonus banner — `public.first_recharge_bonus`
class FirstRechargeBonusModel {
  final String id;
  final int bonusCoins;
  final double bonusPercentage;
  final double bonusMultiplier;
  final String? bonusLabel;
  final String? description;
  final String? bannerImageUrl;
  final String? bannerTitle;
  final String? bannerSubtitle;
  final String? bannerType;
  final bool isActive;

  FirstRechargeBonusModel({
    required this.id,
    this.bonusCoins = 0,
    this.bonusPercentage = 0,
    this.bonusMultiplier = 1.0,
    this.bonusLabel,
    this.description,
    this.bannerImageUrl,
    this.bannerTitle,
    this.bannerSubtitle,
    this.bannerType,
    this.isActive = true,
  });

  factory FirstRechargeBonusModel.fromJson(Map<String, dynamic> json) {
    return FirstRechargeBonusModel(
      id: json['id'] ?? '',
      bonusCoins: (json['bonus_coins'] as num?)?.toInt() ?? 0,
      bonusPercentage: (json['bonus_percentage'] as num?)?.toDouble() ?? 0,
      bonusMultiplier: (json['bonus_multiplier'] as num?)?.toDouble() ?? 1.0,
      bonusLabel: json['bonus_label'],
      description: json['description'],
      bannerImageUrl: json['banner_image_url'],
      bannerTitle: json['banner_title'],
      bannerSubtitle: json['banner_subtitle'],
      bannerType: json['banner_type'],
      isActive: json['is_active'] ?? true,
    );
  }
}

/// Limited-time recharge campaign — `public.recharge_campaigns`
class RechargeCampaignModel {
  final String id;
  final String campaignName;
  final String campaignType; // flash | first_recharge | weekend
  final double originalPriceUsd;
  final double offerPriceUsd;
  final int diamondsAmount;
  final int bonusDiamonds;
  final int durationMinutes;
  final String? bannerImageUrl;
  final String? badgeText;
  final List<String> displayLocations; // home | recharge | popup
  final String? targetAudience;
  final bool isFirstRechargeOnly;
  final bool isActive;

  RechargeCampaignModel({
    required this.id,
    required this.campaignName,
    required this.campaignType,
    required this.originalPriceUsd,
    required this.offerPriceUsd,
    required this.diamondsAmount,
    this.bonusDiamonds = 0,
    this.durationMinutes = 60,
    this.bannerImageUrl,
    this.badgeText,
    this.displayLocations = const [],
    this.targetAudience,
    this.isFirstRechargeOnly = false,
    this.isActive = true,
  });

  factory RechargeCampaignModel.fromJson(Map<String, dynamic> json) {
    return RechargeCampaignModel(
      id: json['id'] ?? '',
      campaignName: json['campaign_name'] ?? '',
      campaignType: json['campaign_type'] ?? 'flash',
      originalPriceUsd: (json['original_price_usd'] as num?)?.toDouble() ?? 0,
      offerPriceUsd: (json['offer_price_usd'] as num?)?.toDouble() ?? 0,
      diamondsAmount: (json['diamonds_amount'] as num?)?.toInt() ?? 0,
      bonusDiamonds: (json['bonus_diamonds'] as num?)?.toInt() ?? 0,
      durationMinutes: (json['duration_minutes'] as num?)?.toInt() ?? 60,
      bannerImageUrl: json['banner_image_url'],
      badgeText: json['badge_text'],
      displayLocations: json['display_locations'] is List
          ? List<String>.from(json['display_locations'])
          : const [],
      targetAudience: json['target_audience'],
      isFirstRechargeOnly: json['is_first_recharge_only'] ?? false,
      isActive: json['is_active'] ?? true,
    );
  }

  int get totalDiamonds => diamondsAmount + bonusDiamonds;
  int get discountPercent => originalPriceUsd > 0
      ? (((originalPriceUsd - offerPriceUsd) / originalPriceUsd) * 100).round()
      : 0;
}

/// Helper-routed diamond package (Tab = "Helper" in Recharge).
class HelperDiamondPackageModel {
  final String id;
  final int diamondAmount;
  final double priceUsd;
  final String? description;
  final bool isActive;
  final int displayOrder;
  final Map<String, dynamic> localPrices;

  HelperDiamondPackageModel({
    required this.id,
    required this.diamondAmount,
    required this.priceUsd,
    this.description,
    this.isActive = true,
    this.displayOrder = 0,
    this.localPrices = const {},
  });

  factory HelperDiamondPackageModel.fromJson(Map<String, dynamic> json) {
    return HelperDiamondPackageModel(
      id: json['id'] ?? '',
      diamondAmount: (json['diamond_amount'] as num?)?.toInt() ?? 0,
      priceUsd: (json['price_usd'] as num?)?.toDouble() ?? 0.0,
      description: json['description'],
      isActive: json['is_active'] ?? true,
      displayOrder: (json['display_order'] as num?)?.toInt() ?? 0,
      localPrices: json['local_prices'] is Map
          ? Map<String, dynamic>.from(json['local_prices'])
          : const {},
    );
  }
}
