import 'package:supabase_flutter/supabase_flutter.dart';

import 'promo_models.dart';

/// Reads the highest-priority active row from `public.popup_event_banners`
/// applying the same date-window filter as `EventPopupBanner.tsx`.
class EventPopupRepository {
  EventPopupRepository(this._supabase);
  final SupabaseClient _supabase;

  Future<EventPopupBannerRow?> fetchActive() async {
    final nowIso = DateTime.now().toUtc().toIso8601String();
    final rows = await _supabase
        .from('popup_event_banners')
        .select(
            'id, title, image_url, skip_delay_seconds, auto_dismiss_seconds, end_date, start_date, display_order, is_active')
        .eq('is_active', true)
        .or('start_date.is.null,start_date.lte.$nowIso')
        .or('end_date.is.null,end_date.gte.$nowIso')
        .order('display_order', ascending: true)
        .limit(1);
    if (rows is! List || rows.isEmpty) return null;
    return EventPopupBannerRow.fromRow(Map<String, dynamic>.from(rows.first));
  }
}
