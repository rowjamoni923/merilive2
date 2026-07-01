import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase_realtime_service.dart';

class ReelsService with ChangeNotifier {
  static final ReelsService _instance = ReelsService._internal();
  factory ReelsService() => _instance;
  ReelsService._internal();

  final _supabase = Supabase.instance.client;
  final _realtime = SupabaseRealtimeService();

  List<Map<String, dynamic>> _reels = [];
  List<Map<String, dynamic>> _categories = [];
  List<Map<String, dynamic>> _comments = [];
  bool _loading = true;
  bool _loadingComments = false;
  String _selectedCategory = 'all';

  List<Map<String, dynamic>> get reels => _reels;
  List<Map<String, dynamic>> get categories => _categories;
  List<Map<String, dynamic>> get comments => _comments;
  bool get loading => _loading;
  bool get loadingComments => _loadingComments;
  String get selectedCategory => _selectedCategory;

  void init() {
    _fetchCategories();
    _fetchReels();

    _realtime.subscribe(
      subscriberId: 'reels-service',
      tables: ['reels', 'reel_likes', 'reel_comments', 'reel_categories'],
      callback: (table, event, payload) {
        if (table == 'reel_categories') {
          _fetchCategories();
        } else if (table == 'reel_comments') {
          // If we are viewing comments for a specific reel, we might want to refresh them
          // but usually it's handled by specific fetch calls.
        } else {
          _fetchReels(isSilent: true);
        }
      },
    );
  }

  Future<void> _fetchCategories() async {
    try {
      final res = await _supabase.from('reel_categories').select().eq('is_active', true).order('display_order');
      _categories = List<Map<String, dynamic>>.from(res);
      notifyListeners();
    } catch (e) {
      debugPrint('[Reels] Categories error: $e');
    }
  }

  Future<void> _fetchReels({bool isSilent = false}) async {
    if (!isSilent) {
      _loading = true;
      notifyListeners();
    }

    try {
      var query = _supabase
          .from('reels')
          .select('''
            *,
            category:reel_categories(id, name, icon, slug),
            user:profiles(id, display_name, avatar_url, user_level, is_verified, is_host)
          ''')
          .eq('is_active', true)
          .eq('is_approved', true)
          .order('created_at', ascending: false);

      if (_selectedCategory != 'all') {
        final cat = _categories.firstWhere((c) => c['slug'] == _selectedCategory, orElse: () => {});
        if (cat.isNotEmpty) {
          query = query.eq('category_id', cat['id']);
        }
      }

      final res = await query.limit(50);
      final rawReels = List<Map<String, dynamic>>.from(res);

      if (_supabase.auth.currentUser != null) {
        final userId = _supabase.auth.currentUser!.id;
        final reelIds = rawReels.map((r) => r['id']).toList();
        final userIds = rawReels.map((r) => r['user_id']).toList();

        final statusRes = await Future.wait([
          _supabase.from('reel_likes').select('reel_id').eq('user_id', userId).inFilter('reel_id', reelIds),
          _supabase.from('followers').select('following_id').eq('follower_id', userId).inFilter('following_id', userIds),
          _supabase.from('saved_reels').select('reel_id').eq('user_id', userId).inFilter('reel_id', reelIds),
        ]);

        final likedIds = Set<String>.from((statusRes[0] as List).map((l) => l['reel_id']));
        final followingIds = Set<String>.from((statusRes[1] as List).map((f) => f['following_id']));
        final savedIds = Set<String>.from((statusRes[2] as List).map((s) => s['reel_id']));

        _reels = rawReels.map((reel) => {
          ...reel,
          'is_liked': likedIds.contains(reel['id']),
          'is_following': followingIds.contains(reel['user_id']),
          'is_saved': savedIds.contains(reel['id']),
        }).toList();
      } else {
        _reels = rawReels;
      }

      _loading = false;
      notifyListeners();
    } catch (e) {
      debugPrint('[Reels] Fetch error: $e');
      _loading = false;
      notifyListeners();
    }
  }

  void setCategory(String categorySlug) {
    _selectedCategory = categorySlug;
    _fetchReels();
  }

  Future<void> toggleLike(String reelId) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return;

    final index = _reels.indexWhere((r) => r['id'] == reelId);
    if (index == -1) return;

    final isLiked = _reels[index]['is_liked'] ?? false;
    final currentCount = _reels[index]['like_count'] ?? 0;

    try {
      if (isLiked) {
        await _supabase.from('reel_likes').delete().eq('reel_id', reelId).eq('user_id', userId);
        await _supabase.from('reels').update({'like_count': (currentCount - 1).clamp(0, double.infinity)}).eq('id', reelId);
      } else {
        await _supabase.from('reel_likes').insert({'reel_id': reelId, 'user_id': userId});
        await _supabase.from('reels').update({'like_count': currentCount + 1}).eq('id', reelId);
      }
      _fetchReels(isSilent: true);
    } catch (e) {
      debugPrint('[Reels] Like error: $e');
    }
  }

  Future<void> toggleFollow(String creatorId) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null || userId == creatorId) return;

    final index = _reels.indexWhere((r) => r['user_id'] == creatorId);
    if (index == -1) return;

    final isFollowing = _reels[index]['is_following'] ?? false;

    try {
      if (isFollowing) {
        await _supabase.from('followers').delete().eq('follower_id', userId).eq('following_id', creatorId);
      } else {
        await _supabase.from('followers').insert({'follower_id': userId, 'following_id': creatorId});
      }
      _fetchReels(isSilent: true);
    } catch (e) {
      debugPrint('[Reels] Follow error: $e');
    }
  }

  Future<void> toggleSave(String reelId) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return;

    final index = _reels.indexWhere((r) => r['id'] == reelId);
    if (index == -1) return;

    final isSaved = _reels[index]['is_saved'] ?? false;

    try {
      if (isSaved) {
        await _supabase.from('saved_reels').delete().eq('reel_id', reelId).eq('user_id', userId);
      } else {
        await _supabase.from('saved_reels').insert({'reel_id': reelId, 'user_id': userId});
      }
      _fetchReels(isSilent: true);
    } catch (e) {
      debugPrint('[Reels] Save error: $e');
    }
  }

  Future<void> handleShare(String reelId) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return;

    try {
      await _supabase.from('reel_shares').insert({'reel_id': reelId, 'user_id': userId});
      final index = _reels.indexWhere((r) => r['id'] == reelId);
      if (index != -1) {
        final currentCount = _reels[index]['share_count'] ?? 0;
        await _supabase.from('reels').update({'share_count': currentCount + 1}).eq('id', reelId);
      }
      _fetchReels(isSilent: true);
    } catch (e) {
      debugPrint('[Reels] Share error: $e');
    }
  }

  Future<void> fetchComments(String reelId) async {
    _loadingComments = true;
    _comments = [];
    notifyListeners();

    try {
      final res = await _supabase
          .from('reel_comments')
          .select('''
            *,
            user:profiles(id, display_name, avatar_url, user_level)
          ''')
          .eq('reel_id', reelId)
          .eq('is_active', true)
          .order('created_at', ascending: false);
      
      _comments = List<Map<String, dynamic>>.from(res);
      _loadingComments = false;
      notifyListeners();
    } catch (e) {
      debugPrint('[Reels] Comments error: $e');
      _loadingComments = false;
      notifyListeners();
    }
  }

  Future<void> sendComment(String reelId, String content) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null || content.trim().isEmpty) return;

    try {
      await _supabase.from('reel_comments').insert({
        'reel_id': reelId,
        'user_id': userId,
        'content': content.trim(),
      });
      
      final index = _reels.indexWhere((r) => r['id'] == reelId);
      if (index != -1) {
        final currentCount = _reels[index]['comment_count'] ?? 0;
        await _supabase.from('reels').update({'comment_count': currentCount + 1}).eq('id', reelId);
      }
      
      fetchComments(reelId);
      _fetchReels(isSilent: true);
    } catch (e) {
      debugPrint('[Reels] Send comment error: $e');
    }
  }

  Future<void> blockUser(String targetUserId) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null || userId == targetUserId) return;

    try {
      await _supabase.from('blocked_users').insert({
        'blocker_id': userId,
        'blocked_id': targetUserId,
      });
      _reels.removeWhere((r) => r['user_id'] == targetUserId);
      notifyListeners();
    } catch (e) {
      debugPrint('[Reels] Block error: $e');
    }
  }

  Future<void> reportReel(String reelId, String creatorId, String reason) async {
    final userId = _supabase.auth.currentUser?.id;
    if (userId == null) return;

    try {
      await _supabase.from('reports').insert({
        'reporter_id': userId,
        'reported_user_id': creatorId,
        'content_type': 'reel',
        'content_id': reelId,
        'reason': reason,
      });
    } catch (e) {
      debugPrint('[Reels] Report error: $e');
    }
  }

  Future<void> togglePrivacy(String reelId, bool currentStatus) async {
    try {
      await _supabase.from('reels').update({'is_active': !currentStatus}).eq('id', reelId);
      _fetchReels(isSilent: true);
    } catch (e) {
      debugPrint('[Reels] Privacy error: $e');
    }
  }

  Future<void> deleteReel(String reelId) async {
    try {
      await _supabase.from('reels').delete().eq('id', reelId);
      _reels.removeWhere((r) => r['id'] == reelId);
      notifyListeners();
    } catch (e) {
      debugPrint('[Reels] Delete error: $e');
    }
  }

  Future<void> incrementView(String reelId) async {
    try {
      await _supabase.rpc('increment_reel_view', params: {'reel_uuid': reelId});
    } catch (e) {
      debugPrint('[Reels] View error: $e');
    }
  }

  void disposeReels() {
    _realtime.unsubscribe('reels-service');
    _reels = [];
    _categories = [];
    _comments = [];
    _loading = true;
  }
}
