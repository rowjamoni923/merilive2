import 'payment_gateway_model.dart';

class Trader {
  final String id;
  final String name;
  final String? avatar;
  final String? appUid;
  final int traderLevel;
  final int totalSold;
  final bool isOnline;
  final String? whatsappNumber;
  final String? countryCode;
  final String? countryName;
  final String? countryFlag;
  final List<PaymentMethod>? paymentMethods;
  final List<PaymentGateway>? acceptedGateways;
  final double? recommendationRating;
  final int? recommendationCount;


  Trader({
    required this.id,
    required this.name,
    this.avatar,
    this.appUid,
    required this.traderLevel,
    required this.totalSold,
    required this.isOnline,
    this.whatsappNumber,
    this.countryCode,
    this.countryName,
    this.countryFlag,
    this.paymentMethods,
    this.acceptedGateways,
    this.recommendationRating,
    this.recommendationCount,
  });


  factory Trader.fromJson(Map<String, dynamic> json) {
    return Trader(
      id: json['id'].toString(),
      name: json['display_name'] ?? json['username'] ?? 'Unknown',
      avatar: json['avatar_url'],
      appUid: json['app_uid']?.toString(),
      traderLevel: json['trader_level'] ?? 1,
      totalSold: json['total_sold_diamonds'] ?? 0,
      isOnline: json['is_online'] ?? false,
      whatsappNumber: json['whatsapp_number'],
      countryCode: json['country_code'],
      countryName: json['country_name'],
      countryFlag: json['country_flag'],
      paymentMethods: json['payment_methods'] != null
          ? (json['payment_methods'] as List)
              .map((i) => PaymentMethod.fromJson(i))
              .toList()
          : null,
      acceptedGateways: json['helper_accepted_payment_methods'] != null
          ? (json['helper_accepted_payment_methods'] as List)
              .map((i) => PaymentGateway.fromJson(i))
              .toList()
          : null,
      recommendationRating: (json['recommendation_rating'] ?? 5.0).toDouble(),
      recommendationCount: json['recommendation_count'] ?? (json['total_sold_diamonds'] != null ? (json['total_sold_diamonds'] ~/ 500) : 0),
    );
  }

}

class PaymentMethod {
  final String id;
  final String methodType; // zinipay, sslcommerz, bkash, nagad, etc.
  final String methodName;
  final String accountName;
  final String accountNumber;
  final String? logoUrl;
  final bool isMerchant;
  final Map<String, dynamic>? additionalInfo;

  PaymentMethod({
    required this.id,
    required this.methodType,
    required this.methodName,
    required this.accountName,
    required this.accountNumber,
    this.logoUrl,
    required this.isMerchant,
    this.additionalInfo,
  });

  factory PaymentMethod.fromJson(Map<String, dynamic> json) {
    return PaymentMethod(
      id: json['id'].toString(),
      methodType: json['method_type'] ?? 'bkash',
      methodName: json['method_name'] ?? 'bKash',
      accountName: json['account_name'] ?? '',
      accountNumber: json['account_number'] ?? '',
      logoUrl: json['logo_url'],
      isMerchant: json['is_merchant'] ?? false,
      additionalInfo: json['additional_info'] ?? {},
    );
  }
}


