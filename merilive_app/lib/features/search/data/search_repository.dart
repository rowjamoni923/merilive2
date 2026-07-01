import 'package:supabase_flutter/supabase_flutter.dart';

import 'search_user.dart';

/// Mirrors `src/pages/SearchUsers.tsx#handleSearch`:
///   • Digits-only query → `profiles_public.app_uid` exact (10-digit padded) +
///     partial ilike match.
///   • Tag chips → `profiles_public.tags` overlap.
///   • When both present, tag matches are intersected with UID matches, but if
///     the intersection is empty we fall back to the UID matches (web parity).
///   • Current-user rows are filtered out at the caller.
class SearchRepository {
  SearchRepository(this._client);
  final SupabaseClient _client;

  static const _cols =
      'id, display_name, username, avatar_url, is_online, is_verified, is_host, '
      'gender, user_level, host_level, max_user_level, country_flag, bio, tags, app_uid';

  Future<List<SearchUser>> search({
    required String query,
    required List<String> tags,
  }) async {
    final cleaned = query.replaceAll(RegExp(r'\D'), '');
    final hasQuery = cleaned.isNotEmpty;
    final hasTags = tags.isNotEmpty;
    if (!hasQuery && !hasTags) return const [];

    // UID search
    List<Map<String, dynamic>> uidRows = const [];
    if (hasQuery) {
      final padded = cleaned.padLeft(10, '0');
      final rows = await _client
          .from('profiles_public')
          .select(_cols)
          .or('app_uid.eq.$padded,app_uid.ilike.%$cleaned%')
          .limit(50);
      uidRows = List<Map<String, dynamic>>.from(rows);
    }

    // Tag search
    List<Map<String, dynamic>> tagRows = const [];
    if (hasTags) {
      final rows = await _client
          .from('profiles_public')
          .select(_cols)
          .overlaps('tags', tags)
          .limit(50);
      tagRows = List<Map<String, dynamic>>.from(rows);
    }

    List<Map<String, dynamic>> merged = uidRows;
    if (hasTags) {
      if (merged.isNotEmpty) {
        final existing = merged.map((r) => r['id']).toSet();
        final intersected =
            tagRows.where((r) => existing.contains(r['id'])).toList();
        merged = intersected.isNotEmpty ? intersected : merged;
      } else {
        merged = tagRows;
      }
    }

    return merged.map(SearchUser.fromRow).toList();
  }

  /// Fetches the set of `following_id`s for [userId] so the results list can
  /// render Follow / Following toggle state (parity with SearchUsers.tsx init).
  Future<Set<String>> loadFollowingIds(String userId) async {
    final rows = await _client
        .from('followers')
        .select('following_id')
        .eq('follower_id', userId);
    return {for (final r in rows) r['following_id'] as String};
  }

  Future<void> follow(String currentUserId, String targetId) async {
    await _client.from('followers').insert({
      'follower_id': currentUserId,
      'following_id': targetId,
    });
  }

  Future<void> unfollow(String currentUserId, String targetId) async {
    await _client
        .from('followers')
        .delete()
        .eq('follower_id', currentUserId)
        .eq('following_id', targetId);
  }
}
