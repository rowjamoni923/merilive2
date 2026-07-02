import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// Phase G-25 — Floating emoji reactions bus.
///
/// Mirrors the web `publishReaction` / `useReactions` pipeline
/// (`src/lib/livekitReactions.ts` + FloatingReactionsOverlay) but rides
/// on Supabase Realtime instead of LiveKit data packets — parity in
/// behaviour, zero native dependency, safe on old APKs.
///
/// Rate-limited to ≤10 sends / rolling 5s per user so the UI matches
/// the web's "Slow down — too many reactions" guard.
class LiveReaction {
  LiveReaction({
    required this.key,
    required this.emoji,
    required this.senderId,
    required this.at,
  });
  final String key;
  final String emoji;
  final String? senderId;
  final DateTime at;
}

class LiveReactionsBus {
  LiveReactionsBus._();
  static final LiveReactionsBus instance = LiveReactionsBus._();

  final _client = Supabase.instance.client;
  final _ctrl = StreamController<LiveReaction>.broadcast();
  RealtimeChannel? _channel;
  String? _streamId;
  final List<DateTime> _sendLog = [];

  Stream<LiveReaction> get stream$ => _ctrl.stream;

  Future<void> attach(String streamId) async {
    if (_streamId == streamId && _channel != null) return;
    await detach();
    _streamId = streamId;
    _channel = _client
        .channel('flutter_live_reactions_$streamId')
        .onBroadcast(
          event: 'reaction',
          callback: (payload) {
            final data = payload;
            final emoji = data['emoji']?.toString();
            if (emoji == null || emoji.isEmpty) return;
            _ctrl.add(LiveReaction(
              key: data['key']?.toString() ??
                  DateTime.now().microsecondsSinceEpoch.toString(),
              emoji: emoji,
              senderId: data['sender_id']?.toString(),
              at: DateTime.now(),
            ));
          },
        )
        .subscribe();
  }

  Future<void> detach() async {
    _streamId = null;
    _sendLog.clear();
    try {
      if (_channel != null) await _client.removeChannel(_channel!);
    } catch (_) {}
    _channel = null;
  }

  /// Returns `false` when the local rate-limit rejects the send.
  Future<bool> publish(String emoji) async {
    final streamId = _streamId;
    final ch = _channel;
    if (streamId == null || ch == null) return false;

    final now = DateTime.now();
    _sendLog.removeWhere((t) => now.difference(t) > const Duration(seconds: 5));
    if (_sendLog.length >= 10) return false;
    _sendLog.add(now);

    final uid = _client.auth.currentUser?.id;
    final key = '${uid ?? "anon"}_${now.microsecondsSinceEpoch}';

    // Local echo so the sender sees their own emoji instantly.
    _ctrl.add(LiveReaction(
      key: key,
      emoji: emoji,
      senderId: uid,
      at: now,
    ));

    try {
      await ch.sendBroadcastMessage(
        event: 'reaction',
        payload: {
          'key': key,
          'emoji': emoji,
          'sender_id': uid,
        },
      );
    } catch (_) {
      // best-effort — the local echo already fired.
    }
    return true;
  }
}
