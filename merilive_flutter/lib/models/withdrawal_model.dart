/// MeriLive Agency Withdrawal Model — `public.agency_withdrawals` table.
class WithdrawalModel {
  final String id;
  final String agencyId;
  final double amount;
  final double? usdAmount;
  final String? paymentMethod; // 'epay' | 'lpft' | 'usdt' | ...
  final String? paymentMethodType;
  final Map<String, dynamic>? paymentDetails;
  final String status; // pending | processing | paid | rejected
  final String? assignedHelperId;
  final String? countryCode;
  final String? currency;
  final double? exchangeRate;
  final double? feePercentage;
  final double? netAmountMoney;
  final double? netDiamondsToHelper;
  final String? notes;
  final String? adminNote;
  final Map<String, dynamic>? helperProof;
  final DateTime? helperProcessedAt;
  final DateTime? processedAt;
  final String? processedBy;
  final DateTime requestedAt;

  WithdrawalModel({
    required this.id,
    required this.agencyId,
    required this.amount,
    required this.status,
    required this.requestedAt,
    this.usdAmount,
    this.paymentMethod,
    this.paymentMethodType,
    this.paymentDetails,
    this.assignedHelperId,
    this.countryCode,
    this.currency,
    this.exchangeRate,
    this.feePercentage,
    this.netAmountMoney,
    this.netDiamondsToHelper,
    this.notes,
    this.adminNote,
    this.helperProof,
    this.helperProcessedAt,
    this.processedAt,
    this.processedBy,
  });

  factory WithdrawalModel.fromJson(Map<String, dynamic> json) {
    return WithdrawalModel(
      id: json['id'] ?? '',
      agencyId: json['agency_id'] ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0.0,
      usdAmount: (json['usd_amount'] as num?)?.toDouble(),
      paymentMethod: json['payment_method'],
      paymentMethodType: json['payment_method_type'],
      paymentDetails: json['payment_details'] is Map
          ? Map<String, dynamic>.from(json['payment_details'])
          : null,
      status: json['status'] ?? 'pending',
      assignedHelperId: json['assigned_helper_id'],
      countryCode: json['country_code'],
      currency: json['currency'],
      exchangeRate: (json['exchange_rate'] as num?)?.toDouble(),
      feePercentage: (json['fee_percentage'] as num?)?.toDouble(),
      netAmountMoney: (json['net_amount_money'] as num?)?.toDouble(),
      netDiamondsToHelper: (json['net_diamonds_to_helper'] as num?)?.toDouble(),
      notes: json['notes'],
      adminNote: json['admin_note'],
      helperProof: json['helper_proof'] is Map
          ? Map<String, dynamic>.from(json['helper_proof'])
          : null,
      helperProcessedAt: json['helper_processed_at'] != null
          ? DateTime.tryParse(json['helper_processed_at'])
          : null,
      processedAt: json['processed_at'] != null
          ? DateTime.tryParse(json['processed_at'])
          : null,
      processedBy: json['processed_by'],
      requestedAt: json['requested_at'] != null
          ? DateTime.parse(json['requested_at'])
          : DateTime.now(),
    );
  }
}
