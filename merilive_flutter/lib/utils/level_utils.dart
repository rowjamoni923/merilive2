import 'package:supabase_flutter/supabase_flutter.dart';

class LevelUtils {
  static const int PAGE_SIZE = 1000;

  static bool isFemaleHost(Map<String, dynamic> profile) {
    return (profile['is_host'] ?? false) && 
           (profile['gender']?.toString().toLowerCase() == 'female');
  }

  static Future<Map<String, dynamic>> resolveLevelProgress(
    Map<String, dynamic> profile,
    List<Map<String, dynamic>> tiers,
  ) async {
    final bool hostMode = isFemaleHost(profile);
    
    // 1. Resolve Total Points (Parity with Web resolver)
    int totalPoints = 0;
    if (hostMode) {
      totalPoints = profile['weekly_earnings'] ?? 0;
    } else {
      totalPoints = profile['total_recharged'] ?? profile['coins'] ?? 0;
    }

    // 2. Resolve Current Level
    int derivedLevel = tiers.fold(0, (highest, tier) {
      final threshold = hostMode ? (tier['min_earning_amount'] ?? 0) : (tier['min_topup_amount'] ?? 0);
      return totalPoints >= threshold ? (tier['level_number'] > highest ? tier['level_number'] : highest) : highest;
    });

    final storedLevel = hostMode ? (profile['host_level'] ?? 0) : (profile['user_level'] ?? 1);
    final maxUserLevel = profile['max_user_level'] ?? 0;
    
    int currentLevel = hostMode 
        ? derivedLevel 
        : [storedLevel, maxUserLevel, derivedLevel, 1].reduce((a, b) => a > b ? a : b);

    // 3. Calculate Progress
    final currentTier = tiers.firstWhere(
      (t) => t['level_number'] == currentLevel, 
      orElse: () => tiers.isNotEmpty ? tiers.first : {'level_number': 1}
    );
    
    final iconUrl = currentTier['icon_url'] ?? currentTier['animation_url'];

    final nextTier = tiers.firstWhere(
      (t) => t['level_number'] > currentLevel, 
      orElse: () => {'level_number': currentLevel + 1}
    );

    double progress = 100.0;
    int nextLevelXP = totalPoints;
    int nextLevelNumber = currentLevel + 1;

    if (nextTier.containsKey('min_topup_amount') || nextTier.containsKey('min_earning_amount')) {
      final currentMin = hostMode ? (currentTier['min_earning_amount'] ?? 0) : (currentTier['min_topup_amount'] ?? 0);
      final nextMin = hostMode ? (nextTier['min_earning_amount'] ?? 0) : (nextTier['min_topup_amount'] ?? 0);
      final range = nextMin - currentMin;
      final progressInRange = totalPoints - currentMin;
      progress = range > 0 ? (progressInRange / range * 100).clamp(0.0, 100.0) : 0.0;
      nextLevelXP = nextMin;
      nextLevelNumber = nextTier['level_number'];
    }

    return {
      'level': currentLevel,
      'progress': progress,
      'currentXP': totalPoints,
      'nextLevelXP': nextLevelXP,
      'nextLevelNumber': nextLevelNumber,
      'isHost': hostMode,
      'iconUrl': iconUrl,
    };
  }
}
