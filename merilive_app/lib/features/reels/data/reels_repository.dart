// R1 — Reels repository.
//
// Ports the supabase queries in `src/pages/Reels.tsx` to Flutter. Uses the
// same table names + join view (`profiles_public`) so RLS behavior is
// identical between web and app. All writes are additive to the shared
// database; no schema change is introduced here.
//
// Divergence from web (intentional):
//   • Web orders `created_at ASC` (long-standing quirk); the Flutter feed
//     uses DESC so newest reels land at index 0 — matches TikTok/Bigo UX.
//   • Feed pagination uses a keyset cursor (`created_at < lastSeen`) instead
//     of a fixed 50-row window, so infinite-scroll works as the user swipes.

import 'package:supabase_flutter/supabase_flutter.dart';

import 'reels_models.dart';

class ReelsRepository {
  ReelsRepository(this._client);

  final SupabaseClient _client;

  static const int _pageSize = 20;
  static const String _reelUserSelect =
      'id, app_uid, display_name, avatar_url, user_level, host_level, '
      'max_user_level, gender, is_verified, is_host, frame_id, equipped_frame_id';

  // ── Categories ────────────────────────────────────────────────────────────
  Future<List<ReelCategory>> fetchCategories() async {
    final res = await _client
        .from('reel_categories')
        .select('id, name, slug, icon_url, display_order')
        .eq('is_active', true)
        .order('display_order', ascending: true);
    return [
      ReelCategory.all,
      ...List<Map<String, dynamic>>.from(res)
          .map(ReelCategory.fromMap),
    ];
  }

  // ── Feed ──────────────────────────────────────────────────────────────────
  ///
  /// [cursor] — pass the [Reel.createdAt] of the last item you already have to
  /// fetch the next page (keyset pagination). Pass `null` for the first page.
  Future<List<Reel>> fetchFeed({
    required String categorySlug,
    required String? currentUserId,
    required List<ReelCategory> knownCategories,
    DateTime? cursor,
  }) async {
    var query = _client
        .from('reels')
        .select(
          '*, user:profiles_public!reels_user_id_fkey($_reelUserSelect)',
        )
        .eq('is_active', true)
        .eq('is_approved', true);

    if (categorySlug != 'all') {
      final cat = knownCategories.where((c) => c.slug == categorySlug).toList();
      if (cat.isNotEmpty) {
        query = query.eq('category_id', cat.first.id);
      }
    }
    if (cursor != null) {
      query = query.lt('created_at', cursor.toIso8601String());
    }

    final rows = await query
        .order('created_at', ascending: false)
        .limit(_pageSize);

    final list = List<Map<String, dynamic>>.from(rows)
        .map(Reel.fromMap)
        .toList(growable: true);

    if (list.isEmpty || currentUserId == null) return list;

    // Enrich with is_liked + is_following in two batched queries.
    final reelIds = list.map((r) => r.id).toList();
    final userIds = list.map((r) => r.userId).toSet().toList();

    final likesFut = _client
        .from('reel_likes')
        .select('reel_id')
        .eq('user_id', currentUserId)
        .inFilter('reel_id', reelIds);
    final followsFut = _client
        .from('followers')
        .select('following_id')
        .eq('follower_id', currentUserId)
        .inFilter('following_id', userIds);
    final savesFut = _client
        .from('saved_reels')
        .select('reel_id')
        .eq('user_id', currentUserId)
        .inFilter('reel_id', reelIds);

    final results = await Future.wait([likesFut, followsFut, savesFut]);
    final liked = {
      for (final r in List<Map<String, dynamic>>.from(results[0]))
        r['reel_id'] as String
    };
    final following = {
      for (final r in List<Map<String, dynamic>>.from(results[1]))
        r['following_id'] as String
    };
    final saved = {
      for (final r in List<Map<String, dynamic>>.from(results[2]))
        r['reel_id'] as String
    };

    return [
      for (final r in list)
        r.copyWith(
          isLiked: liked.contains(r.id),
          isFollowing: following.contains(r.userId),
          isSaved: saved.contains(r.id),
        ),
    ];
  }

  // ── Likes ─────────────────────────────────────────────────────────────────
  Future<void> like(String reelId, String userId) async {
    await _client.from('reel_likes').insert({
      'reel_id': reelId,
      'user_id': userId,
    });
  }

  Future<void> unlike(String reelId, String userId) async {
    await _client
        .from('reel_likes')
        .delete()
        .eq('reel_id', reelId)
        .eq('user_id', userId);
  }

  // ── Follow ────────────────────────────────────────────────────────────────
  Future<void> follow(String targetUserId, String followerId) async {
    await _client.from('followers').insert({
      'follower_id': followerId,
      'following_id': targetUserId,
    });
  }

  Future<void> unfollow(String targetUserId, String followerId) async {
    await _client
        .from('followers')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', targetUserId);
  }

  // ── Save / Unsave ─────────────────────────────────────────────────────────
  Future<void> save(String reelId, String userId) async {
    await _client.from('saved_reels').insert({
      'reel_id': reelId,
      'user_id': userId,
    });
  }

  Future<void> unsave(String reelId, String userId) async {
    await _client
        .from('saved_reels')
        .delete()
        .eq('reel_id', reelId)
        .eq('user_id', userId);
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  Future<List<ReelComment>> fetchComments(String reelId) async {
    final rows = await _client
        .from('reel_comments')
        .select(
          'id, reel_id, user_id, content, parent_id, likes_count, created_at, '
          'user:profiles_public!reel_comments_user_id_fkey($_reelUserSelect)',
        )
        .eq('reel_id', reelId)
        .eq('is_active', true)
        .order('created_at', ascending: false)
        .limit(200);
    return List<Map<String, dynamic>>.from(rows)
        .map(ReelComment.fromMap)
        .toList(growable: false);
  }

  Future<ReelComment> postComment({
    required String reelId,
    required String userId,
    required String content,
    String? parentId,
  }) async {
    final inserted = await _client
        .from('reel_comments')
        .insert({
          'reel_id': reelId,
          'user_id': userId,
          'content': content,
          if (parentId != null) 'parent_id': parentId,
        })
        .select(
          'id, reel_id, user_id, content, parent_id, likes_count, created_at, '
          'user:profiles_public!reel_comments_user_id_fkey($_reelUserSelect)',
        )
        .single();
    return ReelComment.fromMap(Map<String, dynamic>.from(inserted));
  }

  // ── Share + View ──────────────────────────────────────────────────────────
  Future<void> recordShare({
    required String reelId,
    required String userId,
    required String platform,
    required String shareType,
  }) async {
    await _client.from('reel_shares').insert({
      'reel_id': reelId,
      'user_id': userId,
      'platform': platform,
      'share_type': shareType,
    });
  }

  Future<void> recordView({
    required String reelId,
    required String userId,
  }) async {
    // Table is upsert-friendly on (reel_id, user_id, viewed_date). Web uses
    // an INSERT with `on_conflict` ignore — we mimic that via upsert with
    // ignoreDuplicates so we don't bump counters for repeat same-day views.
    await _client.from('reel_views').upsert(
      {
        'reel_id': reelId,
        'user_id': userId,
        'viewed_date': DateTime.now().toUtc().toIso8601String().substring(0, 10),
      },
      onConflict: 'reel_id,user_id,viewed_date',
      ignoreDuplicates: true,
    );
  }

  // ── Report ────────────────────────────────────────────────────────────────
  Future<void> report({
    required String reelId,
    required String userId,
    required String reason,
    String? description,
  }) async {
    await _client.from('reel_reports').insert({
      'reel_id': reelId,
      'user_id': userId,
      'reason': reason,
      if (description != null) 'description': description,
    });
  }
}
