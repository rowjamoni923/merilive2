import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// H5 P0 #1 — Live-stream vertical-swipe controller.
///
/// Web-truth: `src/hooks/useLiveStreamSwipe.ts`.
///
/// Fetches the top 100 active `live_streams` ordered by `viewer_count DESC`
/// (same as web), keeps the list fresh over Supabase Realtime with a 250 ms
/// debounce, and exposes O(1) `next`/`prev` neighbour lookups for the
/// current stream id. Singleton — one shared list across the whole app so
/// consecutive swipes don't re-fetch.
///
/// Semantics match web exactly:
///   • Swipe UP  → higher index in list → lower viewer count (`next`)
///   • Swipe DOWN → lower index → higher viewer count (`prev`)
///
/// Hosts should not swipe away from their own broadcast; the widget layer
/// gates the gesture, not this controller.
class LiveStreamSwipeController {
  LiveStreamSwipeController._();
  static final LiveStreamSwipeController instance =
      LiveStreamSwipeController._();

  final _client = Supabase.instance.client;

  List<String> _ids = const [];
  RealtimeChannel? _channel;
  Timer? _refreshDebounce;
  bool _fetching = false;
  DateTime? _lastFetch;

  /// Cached ordered id list (top → bottom = highest → lowest viewer count).
  List<String> get orderedIds => List.unmodifiable(_ids);

  /// Attach — idempotent. Kicks off first fetch and (once) subscribes to
  /// realtime `live_streams` changes. Safe to call every time a viewer
  /// enters a stream page.
  Future<void> attach() async {
    // Refresh at most every 5s if already attached (viewer count churn is
    // heavy and the debounced realtime path handles inserts/updates).
    final now = DateTime.now();
    if (_lastFetch != null &&
        now.difference(_lastFetch!) < const Duration(seconds: 5) &&
        _ids.isNotEmpty) {
      return;
    }
    await _fetch();
    if (_channel != null) return;
    _channel = _client
        .channel('live_streams:swipe')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'live_streams',
          callback: (_) => _debouncedRefresh(),
        )
        .subscribe();
  }

  void _debouncedRefresh() {
    _refreshDebounce?.cancel();
    _refreshDebounce = Timer(const Duration(milliseconds: 250), _fetch);
  }

  Future<void> _fetch() async {
    if (_fetching) return;
    _fetching = true;
    try {
      final rows = await _client
          .from('live_streams')
          .select('id')
          .eq('is_active', true)
          .order('viewer_count', ascending: false)
          .limit(100);
      _ids = [
        for (final r in (rows as List))
          (r as Map)['id'] as String,
      ];
      _lastFetch = DateTime.now();
    } catch (_) {
      // Silent — swipe is an enhancement; failure just means neighbours
      // are unknown and the widget will be a no-op.
    } finally {
      _fetching = false;
    }
  }

  int _indexOf(String currentId) => _ids.indexOf(currentId);

  /// Next stream in the ordered list (swipe UP). Returns null when the
  /// current id isn't in cache or the caller is already at the tail.
  String? next(String currentId) {
    final i = _indexOf(currentId);
    if (i < 0 || i >= _ids.length - 1) return null;
    return _ids[i + 1];
  }

  /// Previous stream (swipe DOWN). Null when at head or unknown current.
  String? prev(String currentId) {
    final i = _indexOf(currentId);
    if (i <= 0) return null;
    return _ids[i - 1];
  }

  bool hasNext(String currentId) => next(currentId) != null;
  bool hasPrev(String currentId) => prev(currentId) != null;

  /// Full teardown — call from app-wide dispose only. Individual page
  /// dismounts should NOT detach because the list is shared.
  Future<void> dispose() async {
    _refreshDebounce?.cancel();
    _refreshDebounce = null;
    final ch = _channel;
    _channel = null;
    if (ch != null) {
      try {
        await _client.removeChannel(ch);
      } catch (_) {}
    }
  }
}
