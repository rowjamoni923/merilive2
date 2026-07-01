class DiamondPackage {
  final String id;
  final int coins;
  final double priceUsd;
  final int bonusPercentage;
  final bool isActive;
  final String? iconUrl;
  final String? label;


  DiamondPackage({
    required this.id,
    required this.coins,
    required this.priceUsd,
    required this.bonusPercentage,
    required this.isActive,
    this.iconUrl,
    this.label,
  });


  factory DiamondPackage.fromJson(Map<String, dynamic> json) {
    return DiamondPackage(
      id: json['id'].toString(),
      coins: json['coins'] ?? 0,
      priceUsd: (json['price_usd'] ?? 0).toDouble(),
      bonusPercentage: json['bonus_percentage'] ?? 0,
      isActive: json['is_active'] ?? true,
      iconUrl: json['icon_url'],
      label: json['label'],
    );

  }

  int get effectiveCoins => coins + (coins * bonusPercentage ~/ 100);
}

class CurrencyRate {
  final String countryCode;
  final String currencyCode;
  final String currencySymbol;
  final double rateToUsd;
  final bool isDefault;

  CurrencyRate({
    required this.countryCode,
    required this.currencyCode,
    required this.currencySymbol,
    required this.rateToUsd,
    required this.isDefault,
  });

  factory CurrencyRate.fromJson(Map<String, dynamic> json) {
    return CurrencyRate(
      countryCode: json['country_code'] ?? 'US',
      currencyCode: json['currency_code'] ?? 'USD',
      currencySymbol: json['currency_symbol'] ?? '\$',
      rateToUsd: (json['rate_to_usd'] ?? 1.0).toDouble(),
      isDefault: json['is_default'] ?? false,
    );
  }
}


