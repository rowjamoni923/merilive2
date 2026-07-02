import 'package:supabase_flutter/supabase_flutter.dart';

import '../widgets/premium_viewer_profile_card.dart';

/// H5 P0 #4 — Viewer Profile bridge (Flutter parity with
/// `src/components/live/PremiumViewerProfileCard.tsx`).
///
/// Loads a compact profile snapshot from `profiles` + follower-follow state
/// from `followers`. Read-only fetch; follow/unfollow uses the existing
/// `LiveFollowBridge` — this file only builds the display data.
class ViewerProfileBridge {
  ViewerProfileBridge._();
  static final instance = ViewerProfileBridge._();

  final _client = Supabase.instance.client;

  Future<PremiumViewerProfile?> fetchByUserId(String userId) async {
    try {
      final row = await _client
          .from('profiles')
          .select(
              'id,name,username,avatar_url,bio,level,vip_level,is_host,followers_count,following_count,country')
          .eq('id', userId)
          .maybeSingle();
      if (row == null) return null;

      // Follow state — is *current user* following [userId]?
      final me = _client.auth.currentUser?.id;
      bool isFollowing = false;
      if (me != null && me != userId) {
        final f = await _client
            .from('followers')
            .select('follower_id')
            .eq('follower_id', me)
            .eq('following_id', userId)
            .maybeSingle();
        isFollowing = f != null;
      }

      return PremiumViewerProfile(
        userId: row['id'] as String,
        name: (row['name'] as String?) ??
            (row['username'] as String?) ??
            'Viewer',
        avatarUrl: row['avatar_url'] as String?,
        level: (row['level'] as num?)?.toInt() ?? 1,
        isVip: ((row['vip_level'] as num?)?.toInt() ?? 0) > 0,
        bio: row['bio'] as String?,
        country: row['country'] as String?,
        isHost: (row['is_host'] as bool?) ?? false,
        followers: (row['followers_count'] as num?)?.toInt() ?? 0,
        following: (row['following_count'] as num?)?.toInt() ?? 0,
        isFollowing: isFollowing,
      );
    } catch (_) {
      return null;
    }
  }
}
