/// MeriLive Helper / Topup-Helper model — `public.topup_helpers`
/// Trader levels 1–4 = standard helpers (recharge users via diamonds).
/// Level 5 = payroll-enabled helper (also processes agency withdrawals).
class HelperModel {
  final String id;
  final String userId;
  final int traderLevel; // 1..5
  final bool isActive;
  final bool payrollEnabled;
  final String countryCode;
  final int totalSoldDiamonds;
  final double recommendationRating;
  final int recommendationCount;
  final String? whatsappNumber;
  final DateTime? createdAt;

  HelperModel({
    required this.id,
    required this.userId,
    required this.traderLevel,
    this.isActive = true,
    this.payrollEnabled = false,
    this.countryCode = 'BD',
    this.totalSoldDiamonds = 0,
    this.recommendationRating = 5.0,
    this.recommendationCount = 0,
    this.whatsappNumber,
    this.createdAt,
  });

  factory HelperModel.fromJson(Map<String, dynamic> json) {
    return HelperModel(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      traderLevel: (json['trader_level'] as num?)?.toInt() ?? 1,
      isActive: json['is_active'] ?? true,
      payrollEnabled: json['payroll_enabled'] ?? false,
      countryCode: json['country_code'] ?? 'BD',
      totalSoldDiamonds: (json['total_sold_diamonds'] as num?)?.toInt() ?? 0,
      recommendationRating: (json['recommendation_rating'] as num?)?.toDouble() ?? 5.0,
      recommendationCount: (json['recommendation_count'] as num?)?.toInt() ?? 0,
      whatsappNumber: json['whatsapp_number'],
      createdAt: json['created_at'] != null ? DateTime.tryParse(json['created_at']) : null,
    );
  }

  bool get isPayrollHelper => traderLevel == 5 && payrollEnabled;
  bool get isStandardHelper => traderLevel >= 1 && traderLevel <= 4;
}

/// Helper application — `public.helper_applications`
class HelperApplicationModel {
  final String id;
  final String userId;
  final String? whatsappNumber;
  final String countryCode;
  final String status; // pending | approved | rejected
  final String? notes;
  final DateTime createdAt;

  HelperApplicationModel({
    required this.id,
    required this.userId,
    this.whatsappNumber,
    required this.countryCode,
    this.status = 'pending',
    this.notes,
    required this.createdAt,
  });

  factory HelperApplicationModel.fromJson(Map<String, dynamic> json) {
    return HelperApplicationModel(
      id: json['id'] ?? '',
      userId: json['user_id'] ?? '',
      whatsappNumber: json['whatsapp_number'],
      countryCode: json['country_code'] ?? 'BD',
      status: json['status'] ?? 'pending',
      notes: json['notes'],
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : DateTime.now(),
    );
  }
}

/// Helper payment method — `public.helper_payment_methods`
class HelperPaymentMethodModel {
  final String id;
  final String helperId;
  final String methodType; // bkash | nagad | rocket | epay | lpft | usdt
  final String accountName;
  final String accountNumber;
  final Map<String, dynamic> additionalInfo;
  final bool isPrimary;
  final bool isActive;

  HelperPaymentMethodModel({
    required this.id,
    required this.helperId,
    required this.methodType,
    required this.accountName,
    required this.accountNumber,
    this.additionalInfo = const {},
    this.isPrimary = false,
    this.isActive = true,
  });

  factory HelperPaymentMethodModel.fromJson(Map<String, dynamic> json) {
    return HelperPaymentMethodModel(
      id: json['id'] ?? '',
      helperId: json['helper_id'] ?? '',
      methodType: json['method_type'] ?? '',
      accountName: json['account_name'] ?? '',
      accountNumber: json['account_number'] ?? '',
      additionalInfo: json['additional_info'] is Map
          ? Map<String, dynamic>.from(json['additional_info'])
          : {},
      isPrimary: json['is_primary'] ?? false,
      isActive: json['is_active'] ?? true,
    );
  }
}
