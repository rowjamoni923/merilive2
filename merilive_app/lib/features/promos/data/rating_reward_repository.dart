import 'package:supabase_flutter/supabase_flutter.dart';

import 'promo_models.dart';

/// Rating-reward gating + banner pool.
///
/// Mirrors `FullScreenPromoBanners.tsx#isRatingBannerEligible` +
/// `loadAdminRatingBanners`. A user is eligible only when:
///   • `app_settings.rating_popup_enabled == true`
///   • no existing row in `rating_reward_claims` for this user
class RatingRewardRepository {
  RatingRewardRepository(this._supabase);
  final SupabaseClient _supabase;

  Future<bool> isEnabled() async {
    try {
      final row = await _supabase
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'rating_popup_enabled')
          .maybeSingle();
      final v = row?['setting_value'];
      return v == true || v?.toString().toLowerCase() == 'true';
    } catch (_) {
      return false;
    }
  }

  Future<bool> hasClaim(String userId) async {
    try {
      final rows = await _supabase
          .from('rating_reward_claims')
          .select('id')
          .eq('user_id', userId)
          .limit(1);
      return rows is List && rows.isNotEmpty;
    } catch (_) {
      // Fail-closed: if we can't verify, assume they already claimed to
      // avoid nagging users with a broken popup.
      return true;
    }
  }

  Future<List<RatingBannerRow>> loadActiveBanners() async {
    try {
      final rows = await _supabase
          .from('rating_banners')
          .select('image_url, is_active, display_order')
          .eq('is_active', true)
          .order('display_order', ascending: true);
      if (rows is! List) return const [];
      return rows
          .whereType<Map>()
          .map((r) => (r['image_url'] ?? '').toString())
          .where((u) => u.isNotEmpty)
          .map((u) => RatingBannerRow(imageUrl: u))
          .toList(growable: false);
    } catch (_) {
      return const [];
    }
  }
}
