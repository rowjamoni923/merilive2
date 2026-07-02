import 'dart:async';

import 'package:supabase_flutter/supabase_flutter.dart';

/// H3 — Raise-hand queue bridge (viewer + host).
///
/// Web-truth parity: `src/lib/livekitRaiseHand.ts` uses LiveKit participant
/// metadata; the Flutter native side has no metadata plumbing yet, so this
/// bridge persists queue state in `public.live_raise_hand_queue` and streams
/// updates over Supabase Realtime — same FIFO semantics, same host UX.
///
/// Statuses: pending | approved | rejected | cancelled.
class RaiseHandEntry {
  final String id;
  final String streamId;
  final String viewerId;
  final String? viewerName;
  final String? viewerAvatar;
  final String? reason;
  final String status;
  final DateTime raisedAt;

  const RaiseHandEntry({
    required this.id,
    required this.streamId,
    required this.viewerId,
    required this.viewerName,
    required this.viewerAvatar,
    required this.reason,
    required this.status,
    required this.raisedAt,
  });

  factory RaiseHandEntry.fromMap(Map<String, dynamic> m) => RaiseHandEntry(
        id: m['id'] as String,
        streamId: m['stream_id'] as String,
        viewerId: m['viewer_id'] as String,
        viewerName: m['viewer_name'] as String?,
        viewerAvatar: m['viewer_avatar'] as String?,
        reason: m['reason'] as String?,
        status: (m['status'] as String?) ?? 'pending',
        raisedAt:
            DateTime.tryParse(m['raised_at'] as String? ?? '') ?? DateTime.now(),
      );
}

class LiveRaiseHandBridge {
  LiveRaiseHandBridge._();
  static final LiveRaiseHandBridge instance = LiveRaiseHandBridge._();

  final _client = Supabase.instance.client;

  RealtimeChannel? _channel;
  String? _streamId;
  final _controller = StreamController<List<RaiseHandEntry>>.broadcast();
  final Map<String, RaiseHandEntry> _cache = {};

  /// Stream of pending queue entries (FIFO by raised_at) for the given stream.
  Stream<List<RaiseHandEntry>> watch(String streamId) {
    if (_streamId != streamId) {
      _subscribe(streamId);
    }
    return _controller.stream;
  }

  Future<void> _subscribe(String streamId) async {
    await _teardown();
    _streamId = streamId;
    _cache.clear();

    // Seed from REST
    try {
      final rows = await _client
          .from('live_raise_hand_queue')
          .select()
          .eq('stream_id', streamId)
          .eq('status', 'pending')
          .order('raised_at');
      for (final r in (rows as List)) {
        final e = RaiseHandEntry.fromMap(Map<String, dynamic>.from(r as Map));
        _cache[e.id] = e;
      }
      _emit();
    } catch (_) {}

    _channel = _client
        .channel('live_raise_hand:$streamId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'live_raise_hand_queue',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'stream_id',
            value: streamId,
          ),
          callback: (payload) {
            final newRow = payload.newRecord;
            final oldRow = payload.oldRecord;
            if (payload.eventType == PostgresChangeEvent.delete) {
              final id = oldRow['id'] as String?;
              if (id != null) _cache.remove(id);
            } else if (newRow.isNotEmpty) {
              final e = RaiseHandEntry.fromMap(
                Map<String, dynamic>.from(newRow),
              );
              if (e.status == 'pending') {
                _cache[e.id] = e;
              } else {
                _cache.remove(e.id);
              }
            }
            _emit();
          },
        )
        .subscribe();
  }

  void _emit() {
    final list = _cache.values.toList()
      ..sort((a, b) => a.raisedAt.compareTo(b.raisedAt));
    _controller.add(list);
  }

  Future<void> _teardown() async {
    final ch = _channel;
    _channel = null;
    _streamId = null;
    if (ch != null) {
      try {
        await _client.removeChannel(ch);
      } catch (_) {}
    }
  }

  Future<void> dispose() async {
    await _teardown();
    await _controller.close();
  }

  // ── Viewer actions ────────────────────────────────────────────────

  /// Raise the caller's hand for [streamId]. Idempotent via UNIQUE
  /// (stream_id, viewer_id) — an existing row is refreshed to pending.
  Future<bool> raise({
    required String streamId,
    String? reason,
  }) async {
    final me = _client.auth.currentUser;
    if (me == null) return false;
    final profile = await _client
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', me.id)
        .maybeSingle();

    try {
      await _client.from('live_raise_hand_queue').upsert({
        'stream_id': streamId,
        'viewer_id': me.id,
        'viewer_name': profile?['display_name'],
        'viewer_avatar': profile?['avatar_url'],
        'reason': reason,
        'status': 'pending',
        'raised_at': DateTime.now().toIso8601String(),
        'resolved_at': null,
        'resolved_by': null,
      }, onConflict: 'stream_id,viewer_id');
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Viewer cancels their own raised hand.
  Future<bool> lower({required String streamId}) async {
    final me = _client.auth.currentUser;
    if (me == null) return false;
    try {
      await _client
          .from('live_raise_hand_queue')
          .update({
            'status': 'cancelled',
            'resolved_at': DateTime.now().toIso8601String(),
          })
          .eq('stream_id', streamId)
          .eq('viewer_id', me.id);
      return true;
    } catch (_) {
      return false;
    }
  }

  /// Check if this user is currently raised in the stream.
  Future<bool> isRaised({required String streamId}) async {
    final me = _client.auth.currentUser;
    if (me == null) return false;
    try {
      final r = await _client
          .from('live_raise_hand_queue')
          .select('id')
          .eq('stream_id', streamId)
          .eq('viewer_id', me.id)
          .eq('status', 'pending')
          .maybeSingle();
      return r != null;
    } catch (_) {
      return false;
    }
  }

  // ── Host actions ─────────────────────────────────────────────────

  Future<bool> approve(RaiseHandEntry entry) => _resolve(entry, 'approved');
  Future<bool> reject(RaiseHandEntry entry) => _resolve(entry, 'rejected');

  Future<bool> _resolve(RaiseHandEntry entry, String status) async {
    final me = _client.auth.currentUser;
    if (me == null) return false;
    try {
      await _client.from('live_raise_hand_queue').update({
        'status': status,
        'resolved_at': DateTime.now().toIso8601String(),
        'resolved_by': me.id,
      }).eq('id', entry.id);
      return true;
    } catch (_) {
      return false;
    }
  }
}
