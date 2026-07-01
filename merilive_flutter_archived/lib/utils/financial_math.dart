import 'package:flutter/material.dart';

class FinancialMath {
  /// [DYNAMIC] Conversion rate for the platform (Set via Admin Panel)
  /// Initialized to 1000 as a safe default.
  static int beansPerUsd = 1000;

  /// [DYNAMIC] Commission settings updated via AdminControllerService
  static double defaultAgencyPercent = 0.02;
  static double hostCallPercent = 0.40;
  static double hostGiftPercent = 0.40;
  static int callGracePeriodSeconds = 21;
  static double exchangeFeePercent = 0.05;
  static List<Map<String, dynamic>> agencyCommissionTiers = [{'min_usd': 0, 'percent': 3}];

  /// Standard host commission for calls/gifts if not overridden
  static const double defaultHostPercent = 0.40;

  /// Resolves billable minutes from seconds (Any fraction of a minute = 1 full minute)
  static int calculateBillableMinutes(int seconds) {
    if (seconds <= 0) return 0;
    return (seconds / 60).ceil();
  }

  /// [NEW] Resolves host net beans from a call session with grace period and rounding
  /// Logic: If duration < 21s -> 0. Else -> ceiling(duration/60) * rate * host%
  static int calculateHostCallEarnings({
    required int durationSeconds,
    required int ratePerMinute,
    double? hostPercent,
  }) {
    if (durationSeconds < callGracePeriodSeconds) return 0;
    
    final minutes = calculateBillableMinutes(durationSeconds);
    final totalDiamonds = minutes * ratePerMinute;
    final percent = hostPercent ?? hostCallPercent;
    
    return (totalDiamonds * percent).floor();
  }

  /// [NEW] Resolves host net beans from a gift transaction
  static int calculateHostGiftEarnings(int diamondValue, {double? hostPercent}) {
    final percent = hostPercent ?? hostGiftPercent;
    return (diamondValue * percent).floor();
  }

  /// [NEW] Calculates game winnings based on multiplier (Chalet/Gaming Logic)
  static int calculateGameWinAmount(int bet, double multiplier) {
    return (bet * multiplier).floor();
  }

  /// [NEW] Converts beans to USD equivalent for reporting (Synced with Admin Panel)
  static double convertBeansToUsd(int beans) {
    if (beansPerUsd <= 0) return 0.0;
    return beans / beansPerUsd;
  }

  /// [NEW] Calculates Agency Share for USD reporting
  static double calculateAgencyUsdShare(int hostEarningsBeans, double agencyRate) {
    final agencyBeans = (hostEarningsBeans * agencyRate).floor();
    return convertBeansToUsd(agencyBeans);
  }

  /// Resolves the net beans a host earns from a diamond transaction (Legacy Generic)
  static int resolveHostNetBeans(int diamondsPaid, {double? hostPercent}) {
    final percent = hostPercent ?? hostGiftPercent;
    return (diamondsPaid * percent).floor();
  }

  /// Resolves the net USD amount from beans based on the platform rate
  static double beansToUsd(int beans) {
    if (beans <= 0) return 0.0;
    return beans / beansPerUsd;
  }

  /// Resolves the agency commission based on tiered earnings (Matches Audio Logic)
  static double calculateAgencyCommissionPercent(int weeklyBeans) {
    final usd = beansToUsd(weeklyBeans);
    
    // Sort tiers by min_usd descending to find the highest applicable tier
    final sortedTiers = List<Map<String, dynamic>>.from(agencyCommissionTiers)
      ..sort((a, b) => (b['min_usd'] as num).compareTo(a['min_usd'] as num));

    for (var tier in sortedTiers) {
      if (usd >= (tier['min_usd'] as num)) {
        return (tier['percent'] as num) / 100.0;
      }
    }
    
    return defaultAgencyPercent; 
  }

  /// Resolves total agency earnings in beans for a given volume
  static int calculateAgencyEarnings(int totalHostBeans) {
    final percent = calculateAgencyCommissionPercent(totalHostBeans);
    return (totalHostBeans * percent).floor();
  }

  /// Resolves the diamond count after exchange (User Beans -> Diamonds)
  static int resolveExchangeDiamonds(int beans, {double? feePercent}) {
    final effectiveFee = feePercent ?? exchangeFeePercent;
    final netBeans = beans * (1 - effectiveFee);
    // Standard exchange is 100 beans = 100 diamonds (minus fee)
    return netBeans.floor();
  }
}
