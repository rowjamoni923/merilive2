import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// Live-tunable gift animation config, mirroring the web implementation in
/// `src/hooks/useGlobalFullScreenGift.ts`.
///
/// Reads `app_settings.gift_animation_config`:
/// ```json
/// { "full_screen_threshold": 500, "full_screen_enabled": true }
/// ```
///
/// Admin panel: `/admin/gift-animation-config`. Row missing → safe defaults.
class GiftAnimationConfig {
  GiftAnimationConfig._();

  static final GiftAnimationConfig instance = GiftAnimationConfig._();

  static const int defaultThreshold = 500;
  static const bool defaultEnabled = true;
  static const Duration _ttl = Duration(minutes: 1);

  int _threshold = defaultThreshold;
  bool _enabled = defaultEnabled;
  DateTime? _fetchedAt;
  Future<void>? _inflight;
  RealtimeChannel? _channel;

  int get fullScreenThreshold {
    _ensureFresh();
    return _threshold;
  }

  bool get fullScreenEnabled {
    _ensureFresh();
    return _enabled;
  }

  /// Returns true when a gift's per-unit coin value should trigger the
  /// full-screen animation pipeline.
  bool shouldPlayFullScreen(int perUnitCoins) {
    _ensureFresh();
    return _enabled && perUnitCoins >= _threshold;
  }

  /// Preload the config (call once during app bootstrap for zero cold-start
  /// latency on the first gift) and subscribe to live admin edits.
  Future<void> initialize() async {
    await refresh();
    _subscribeToAdminUpdates();
  }

  Future<void> refresh() {
    final existing = _inflight;
    if (existing != null) return existing;
    final future = _fetch();
    _inflight = future;
    return future.whenComplete(() => _inflight = null);
  }

  void _ensureFresh() {
    final fetchedAt = _fetchedAt;
    if (fetchedAt == null || DateTime.now().difference(fetchedAt) > _ttl) {
      // Fire-and-forget refresh — callers always see the last cached value.
      refresh();
    }
  }

  Future<void> _fetch() async {
    try {
      final row = await Supabase.instance.client
          .from('app_settings')
          .select('setting_value')
          .eq('setting_key', 'gift_animation_config')
          .maybeSingle();
      final value = row?['setting_value'];
      if (value is Map) {
        final threshold = value['full_screen_threshold'];
        final enabled = value['full_screen_enabled'];
        if (threshold is num && threshold > 0) {
          _threshold = threshold.toInt();
        }
        if (enabled is bool) {
          _enabled = enabled;
        }
      }
      _fetchedAt = DateTime.now();
    } catch (_) {
      // Keep last cached value on failure — never poison the cache.
    }
  }

  void _subscribeToAdminUpdates() {
    if (_channel != null) return;
    try {
      _channel = Supabase.instance.client
          .channel('gift_animation_config_updates')
          .onPostgresChanges(
            event: PostgresChangeEvent.all,
            schema: 'public',
            table: 'app_settings',
            filter: PostgresChangeFilter(
              type: PostgresChangeFilterType.eq,
              column: 'setting_key',
              value: 'gift_animation_config',
            ),
            callback: (_) {
              _fetchedAt = null;
              refresh();
            },
          )
          .subscribe();
    } catch (_) {
      /* realtime unavailable — TTL-based refresh still works */
    }
  }
}
