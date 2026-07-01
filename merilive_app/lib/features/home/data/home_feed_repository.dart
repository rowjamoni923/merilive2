import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'home_host.dart';

/// Home feed data source — 1:1 with web `Index.tsx` `["index-hosts-v4"]` query.
///
/// `get_public_home_hosts_v2` is a SECURITY DEFINER RPC that already:
///   • filters banned/blocked/deleted
///   • joins live_streams, party_rooms, private_calls
///   • applies sub-tab logic (popular/live/new/following)
///   • sorts live→busy→online→offline server-side (500 row cap)
///
/// We simply forward the args, map rows to [HomeHost], and re-run whenever a
/// change vector fires on the shared realtime channel (live/party/call/profile).
class HomeFeedRepository {
  HomeFeedRepository(this._supabase);

  final SupabaseClient _supabase;

  Future<List<HomeHost>> fetch({
    required String selectedCountry,
    required String subTab,
    required String? currentUserId,
  }) async {
    final raw = await _supabase.rpc(
      'get_public_home_hosts_v2',
      params: {
        'p_selected_country': selectedCountry,
        'p_sub_tab': subTab,
        'p_current_user_id': currentUserId,
      },
    );
    if (raw is! List) return const [];
    return raw
        .whereType<Map>()
        .map((r) => HomeHost.fromRow(Map<String, dynamic>.from(r)))
        .toList(growable: false);
  }

  /// Realtime invalidator — fires a `void` event whenever a table that
  /// influences home feed presence changes. Callers debounce + refetch.
  ///
  /// Web equivalent: query invalidation on `live_streams`, `party_rooms`,
  /// `private_calls` postgres_changes + broadcast channels.
  Stream<void> watchInvalidations() {
    final controller = StreamController<void>.broadcast();
    void ping(dynamic _) {
      if (!controller.isClosed) controller.add(null);
    }

    final channel = _supabase
        .channel('home-feed-invalidations')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'live_streams',
          callback: ping,
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'party_rooms',
          callback: ping,
        )
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'private_calls',
          callback: ping,
        )
        .subscribe();

    controller.onCancel = () async {
      await _supabase.removeChannel(channel);
    };
    return controller.stream;
  }
}
