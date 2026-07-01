import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'banner.dart';

/// Reads home banners from `public.banners` with the exact filter used by
/// the web app (`is_active = true` AND `location IS NULL OR location = 'home'`,
/// ordered by `display_order ASC`). Realtime invalidations fire whenever the
/// admin edits any row so the app matches the panel instantly.
class BannerRepository {
  BannerRepository(this._supabase);

  final SupabaseClient _supabase;

  Future<List<HomeBanner>> fetch() async {
    final rows = await _supabase
        .from('banners')
        .select()
        .eq('is_active', true)
        .or('location.is.null,location.eq.home')
        .order('display_order', ascending: true);
    if (rows is! List) return const [];
    return rows
        .whereType<Map>()
        .map((r) => HomeBanner.fromRow(Map<String, dynamic>.from(r)))
        .toList(growable: false);
  }

  Stream<void> watchInvalidations() {
    final controller = StreamController<void>.broadcast();
    void ping(dynamic _) {
      if (!controller.isClosed) controller.add(null);
    }

    final channel = _supabase
        .channel('home-banner-invalidations')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'banners',
          callback: ping,
        )
        .subscribe();

    controller.onCancel = () async {
      await _supabase.removeChannel(channel);
      await controller.close();
    };
    return controller.stream;
  }
}
