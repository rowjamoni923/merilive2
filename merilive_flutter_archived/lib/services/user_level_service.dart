import 'package:flutter/material.dart';
import 'admin_controller_service.dart';

class UserLevelService {
  static final AdminControllerService _admin = AdminControllerService();

  /// Calculates progress (0.0 to 1.0) towards the next level using remote tiers
  static double calculateLevelProgress(int points, int currentLevel, {String type = 'user'}) {
    return _admin.calculateProgress(points, type);
  }

  /// Points required just for the current level's progress bar (next threshold - current min)
  static int getPointsToNextLevel(int points, {String type = 'user'}) {
    final tiers = type == 'host' ? _admin.hostTiers : _admin.userTiers;
    if (tiers.isEmpty) return 0;

    final key = type == 'host' ? 'min_earning_amount' : 'min_topup_amount';
    int currentLevel = _admin.resolveLevel(points, type);

    for (int i = 0; i < tiers.length; i++) {
      if (tiers[i]['level_number'] == currentLevel) {
        if (i + 1 < tiers.length) {
          final nextMin = (tiers[i + 1][key] ?? 0) as num;
          return (nextMin.toInt() - points).clamp(0, 999999999);
        }
        break;
      }
    }
    return 0; // Max level or unknown
  }
}


