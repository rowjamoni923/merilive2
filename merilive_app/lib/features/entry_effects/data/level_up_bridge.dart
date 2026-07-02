import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// M9 — Self-scoped level-up detector.
///
/// Mirrors the web `useLevelUpCelebration` hook: subscribes to
/// `profiles` row UPDATEs for the signed-in user and emits an event
/// whenever `user_level` strictly increases. Consumers render a
/// confetti / celebration overlay in whatever room surface they own.
///
/// Attach once per authenticated session — safe to call `attach()`
/// multiple times, later calls no-op. `detach()` on sign-out.
class LevelUpEvent {
  const LevelUpEvent({required this.oldLevel, required this.newLevel});
  final int oldLevel;
  final int newLevel;
}

class LevelUpBridge {
  LevelUpBridge._();
  static final LevelUpBridge instance = LevelUpBridge._();

  final _controller = StreamController<LevelUpEvent>.broadcast();
  Stream<LevelUpEvent> get events$ => _controller.stream;

  RealtimeChannel? _channel;
  int? _lastLevel;
  String? _userId;

  Future<void> attach() async {
    final client = Supabase.instance.client;
    final uid = client.auth.currentUser?.id;
    if (uid == null) return;
    if (_userId == uid && _channel != null) return;
    await detach();
    _userId = uid;

    // Seed baseline so we don't fire on the initial snapshot.
    try {
      final row = await client
          .from('profiles')
          .select('user_level')
          .eq('id', uid)
          .maybeSingle();
      _lastLevel = (row?['user_level'] as num?)?.toInt();
    } catch (_) {}

    _channel = client
        .channel('level_up_self_$uid')
        .onPostgresChanges(
          event: PostgresChangeEvent.update,
          schema: 'public',
          table: 'profiles',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'id',
            value: uid,
          ),
          callback: (payload) {
            final next = (payload.newRecord['user_level'] as num?)?.toInt();
            if (next == null) return;
            final prev = _lastLevel;
            _lastLevel = next;
            if (prev != null && next > prev) {
              _controller.add(LevelUpEvent(oldLevel: prev, newLevel: next));
            }
          },
        )
        .subscribe();
  }

  Future<void> detach() async {
    final ch = _channel;
    _channel = null;
    _userId = null;
    _lastLevel = null;
    if (ch != null) {
      try {
        await Supabase.instance.client.removeChannel(ch);
      } catch (_) {}
    }
  }
}
