import 'package:supabase_flutter/supabase_flutter.dart';

/// A4 — Follow/unfollow helpers.
///
/// Web-truth reference: `src/pages/LiveStream.tsx` (`handleFollowHost` +
/// `handleFollowFromCard`). Insert/delete on the `followers` table using
/// `follower_id` (current user) and `following_id` (target).
class LiveFollowBridge {
  LiveFollowBridge._();
  static final LiveFollowBridge instance = LiveFollowBridge._();

  final _client = Supabase.instance.client;

  Future<bool> isFollowing(String targetUserId) async {
    final uid = _client.auth.currentUser?.id;
    if (uid == null || uid == targetUserId) return false;
    final row = await _client
        .from('followers')
        .select('id')
        .eq('follower_id', uid)
        .eq('following_id', targetUserId)
        .maybeSingle();
    return row != null;
  }

  /// Toggles follow state; returns the resulting `isFollowing` value.
  Future<bool> toggle(String targetUserId) async {
    final uid = _client.auth.currentUser?.id;
    if (uid == null) {
      throw StateError('Not signed in');
    }
    if (uid == targetUserId) return false;

    final currently = await isFollowing(targetUserId);
    if (currently) {
      await _client
          .from('followers')
          .delete()
          .eq('follower_id', uid)
          .eq('following_id', targetUserId);
      return false;
    }
    await _client.from('followers').insert({
      'follower_id': uid,
      'following_id': targetUserId,
    });
    return true;
  }
}
