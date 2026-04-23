import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_realtime_service.dart';

class SocialService with ChangeNotifier {
  static final SocialService _instance = SocialService._internal();
  factory SocialService() => _instance;
  SocialService._internal();

  final _supabase = Supabase.instance.client;
  final _realtime = SupabaseRealtimeService();

  Map<String, dynamic> _equippedPrivileges = {};
  List<Map<String, dynamic>> _allPrivileges = [];
  int _followerCount = 0;
  int _followingCount = 0;
  bool _loading = true;

  Map<String, dynamic> get equippedPrivileges => _equippedPrivileges;
  List<Map<String, dynamic>> get allPrivileges => _allPrivileges;
  int get followerCount => _followerCount;
  int get followingCount => _followingCount;
  bool get loading => _loading;

  void init(String userId) {
    _fetchPrivileges(userId);
    _fetchSocialStats(userId);

    _realtime.subscribe(
      subscriberId: 'social-service-$userId',
      tables: ['user_purchases', 'level_privileges', 'profiles', 'followers'],
      callback: (table, event, payload) {
        if (table == 'user_purchases' || table == 'level_privileges' || (table == 'profiles' && payload['id'] == userId)) {
          _fetchPrivileges(userId);
        }
        if (table == 'followers') {
          _fetchSocialStats(userId);
        }
      },
    );
  }

  Future<void> _fetchPrivileges(String userId) async {
    try {
      final res = await _supabase.from('profiles').select('user_level').eq('id', userId).single();
      final level = res['user_level'] ?? 0;

      final results = await Future.wait([
        _supabase.from('user_purchases').select('*, shop_items(*)').eq('user_id', userId).eq('is_active', true),
        _supabase.from('level_privileges').select().eq('is_active', true).lte('unlock_level', level),
      ]);

      final purchases = results[0] as List;
      final levelPrivs = results[1] as List;

      Map<String, dynamic> equipped = {};
      List<Map<String, dynamic>> all = [];

      for (var p in purchases) {
        final item = p['shop_items'];
        final priv = {
          'id': p['id'],
          'category': item['category'],
          'name': item['name'],
          'animation_url': item['animation_url'],
          'is_equipped': p['is_equipped'] ?? false,
          'type': 'shop',
        };
        all.add(priv);
        if (priv['is_equipped']) {
          equipped[item['category']] = priv;
        }
      }

      for (var lp in levelPrivs) {
        final priv = {
          'id': lp['id'],
          'category': lp['privilege_type'],
          'name': lp['name'],
          'animation_url': lp['animation_url'],
          'is_equipped': true,
          'type': 'level',
        };
        all.add(priv);
        if (equipped[lp['privilege_type']] == null) {
          equipped[lp['privilege_type']] = priv;
        }
      }

      _allPrivileges = all;
      _equippedPrivileges = equipped;
      _loading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('[Social] Privileges error: $e');
    }
  }

  Future<void> _fetchSocialStats(String userId) async {
    try {
      final res = await Future.wait([
        _supabase.from('followers').select('*', count: CountOption.exact, head: true).eq('following_id', userId),
        _supabase.from('followers').select('*', count: CountOption.exact, head: true).eq('follower_id', userId),
      ]);
      _followerCount = res[0].count;
      _followingCount = res[1].count;
      notifyListeners();
    } catch (e) {
      debugPrint('[Social] Stats error: $e');
    }
  }

  Future<void> followUser(String targetId) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return;
    try {
      await _supabase.from('followers').insert({'follower_id': userId, 'following_id': targetId});
    } catch (e) {
      debugPrint('[Social] Follow error: $e');
    }
  }

  Future<void> unfollowUser(String targetId) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return;
    try {
      await _supabase.from('followers').delete().eq('follower_id', userId).eq('following_id', targetId);
    } catch (e) {
      debugPrint('[Social] Unfollow error: $e');
    }
  }

  void disposeSocial(String userId) {
    _realtime.unsubscribe('social-service-$userId');
    _equippedPrivileges = {};
    _allPrivileges = [];
    _followerCount = 0;
    _followingCount = 0;
    _loading = true;
  }
}
