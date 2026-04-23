import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_realtime_service.dart';

class LevelService with ChangeNotifier {
  static final LevelService _instance = LevelService._internal();
  factory LevelService() => _instance;
  LevelService._internal();

  final _supabase = Supabase.instance.client;
  final _realtime = SupabaseRealtimeService();

  int _level = 1;
  Map<String, dynamic>? _levelData;
  List<Map<String, dynamic>> _tiers = [];
  double _progress = 0;
  bool _loading = true;

  int get level => _level;
  Map<String, dynamic>? get levelData => _levelData;
  List<Map<String, dynamic>> get tiers => _tiers;
  double get progress => _progress;
  bool get loading => _loading;

  void init(String userId) {
    _fetchLevel(userId);
    _fetchTiers(userId);

    _realtime.subscribe(
      subscriberId: 'level-service-$userId',
      tables: ['profiles', 'user_level_tiers', 'gift_transactions'],
      callback: (table, event, payload) {
        if (table == 'profiles' && payload['id'] == userId) {
          _fetchLevel(userId);
        } else if (table == 'user_level_tiers') {
          _fetchTiers(userId);
        } else if (table == 'gift_transactions' && payload['receiver_id'] == userId) {
          _fetchLevel(userId);
        }
      },
    );
  }

  Future<void> _fetchLevel(String userId) async {
    try {
      final res = await _supabase.from('profiles').select().eq('id', userId).single();
      _levelData = res;
      _level = res['user_level'] ?? 1;
      _calculateProgress();
      _loading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('[Level] Error: $e');
    }
  }

  Future<void> _fetchTiers(String userId) async {
    try {
      final res = await _supabase
          .from('user_level_tiers')
          .select()
          .eq('is_active', true)
          .order('level_number', ascending: true);
      _tiers = List<Map<String, dynamic>>.from(res);
      _calculateProgress();
      notifyListeners();
    } catch (e) {
      debugPrint('[Tiers] Error: $e');
    }
  }

  void _calculateProgress() {
    if (_levelData == null || _tiers.isEmpty) return;

    final isHost = _levelData!['is_host'] == true && (_levelData!['gender']?.toString().toLowerCase() == 'female');
    final xp = isHost ? (_levelData!['weekly_earnings'] ?? 0) : (_levelData!['total_recharged'] ?? 0);
    final displayLevel = isHost ? (_levelData!['host_level'] ?? 0) : (_levelData!['user_level'] ?? 1);

    final currentTier = _tiers.firstWhere((t) => t['level_number'] == displayLevel, orElse: () => {});
    final nextTier = _tiers.firstWhere((t) => t['level_number'] == displayLevel + 1, orElse: () => {});

    if (currentTier.isNotEmpty && nextTier.isNotEmpty) {
      final currentMin = isHost ? currentTier['min_earning_amount'] : currentTier['min_topup_amount'];
      final nextMin = isHost ? nextTier['min_earning_amount'] : nextTier['min_topup_amount'];
      final range = nextMin - currentMin;
      if (range > 0) {
        _progress = (xp - currentMin) / range;
      }
    } else if (currentTier.isEmpty && nextTier.isNotEmpty) {
      final nextMin = isHost ? nextTier['min_earning_amount'] : nextTier['min_topup_amount'];
      if (nextMin > 0) {
        _progress = xp / nextMin;
      }
    } else if (currentTier.isNotEmpty) {
      _progress = 1.0;
    }
  }

  void disposeLevel(String userId) {
    _realtime.unsubscribe('level-service-$userId');
    _levelData = null;
    _tiers = [];
    _loading = true;
  }
}
