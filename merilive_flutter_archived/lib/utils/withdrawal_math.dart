import 'package:flutter/material.dart';
class WithdrawalMath {
  /// Matches resolveNetWithdrawalUsd in web parity (agencyWithdrawalAmounts.ts)
  static double resolveNetUsd({
    required Map<String, dynamic>? paymentDetails,
    required double grossAmountBeans,
    required double beansToUsdRate,
  }) {
    if (paymentDetails == null) {
      return (grossAmountBeans / (beansToUsdRate > 0 ? beansToUsdRate : 9000)).clamp(0, double.infinity);
    }

    final double? storedNet = _toDouble(paymentDetails['net_withdrawal_usd']);
    if (storedNet != null) return storedNet.clamp(0, double.infinity);

    final double? gross = _toDouble(paymentDetails['usd_amount']);
    final double? fee = _toDouble(paymentDetails['withdrawal_fee_usd']);
    
    if (gross != null && fee != null) return (gross - fee).clamp(0, double.infinity);
    if (gross != null) return gross.clamp(0, double.infinity);

    return (grossAmountBeans / (beansToUsdRate > 0 ? beansToUsdRate : 9000)).clamp(0, double.infinity);
  }

  /// Matches resolveNetWithdrawalLocal in web parity
  static double resolveNetLocal({
    required Map<String, dynamic>? paymentDetails,
    required double? fallbackLocalAmount,
  }) {
    if (paymentDetails == null) return (fallbackLocalAmount ?? 0).toDouble().clamp(0, double.infinity);

    final double? storedNet = _toDouble(paymentDetails['net_withdrawal_local']);
    if (storedNet != null) return storedNet.clamp(0, double.infinity);

    final double? gross = _toDouble(paymentDetails['local_amount']) ?? _toDouble(fallbackLocalAmount);
    final double? fee = _toDouble(paymentDetails['withdrawal_fee_local']);

    if (gross != null && fee != null) return (gross - fee).clamp(0, double.infinity);
    return (gross ?? 0).clamp(0, double.infinity);
  }

  static double? _toDouble(dynamic val) {
    if (val == null) return null;
    if (val is num) return val.toDouble();
    if (val is String) return double.tryParse(val);
    return null;
  }
}


