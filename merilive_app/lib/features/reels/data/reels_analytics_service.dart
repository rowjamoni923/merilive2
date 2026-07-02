// R8 — Reels analytics service.
//
// Client-side aggregator that records:
//   • First-view-of-the-day per (reel, user) via existing `reel_views` upsert
//     (idempotent, matches web contract — no counter double-bump).
//   • Local watch-time + completion telemetry per session, batched in memory
//     so future server-side aggregation (edge fn / warehouse) can drain it
//     with zero UI-side rework.
//
// Design notes:
//   • Zero UI dependency — pure controller. Feed page calls
//     `beginWatch(reelId)` when a reel becomes active and `endWatch(reelId,
//     positionMs, durationMs)` when it loses focus. Duplicate begins for the
//     same reel are folded into a single continuous window.
//   • `recordViewOnce` dedupes per app session so we never spam the network
//     as the user scrolls back and forth over the same clip.
//   • Never throws — analytics failures must not affect playback UX.
//
// If/when a `reel_watch_events` (or similar) table lands, only `_persistBatch`
// needs a body — nothing in the feed page changes.
import 'dart:async';
import 'dart:developer' as dev;

import 'reels_repository.dart';

class ReelsAnalyticsService {
  ReelsAnalyticsService(this._repo);

  final ReelsRepository _repo;

  final Set<String> _viewsRecordedThisSession = <String>{};
  final Map<String, DateTime> _openSessions = <String, DateTime>{};
  final List<_WatchEvent> _pending = <_WatchEvent>[];

  /// Idempotently record a first-per-day view against `reel_views`.
  /// Safe to call from playback-sync hot paths.
  Future<void> recordViewOnce({
    required String reelId,
    required String? userId,
  }) async {
    if (userId == null || userId.isEmpty) return;
    final key = '$reelId::$userId';
    if (!_viewsRecordedThisSession.add(key)) return;
    try {
      await _repo.recordView(reelId: reelId, userId: userId);
    } catch (e) {
      // Never let analytics break the feed.
      dev.log('recordViewOnce failed: $e', name: 'reels.analytics');
    }
  }

  /// Mark a reel as the currently-playing one. Coalesces duplicate calls.
  void beginWatch(String reelId) {
    _openSessions.putIfAbsent(reelId, DateTime.now);
  }

  /// Close the watch window for `reelId`. `positionMs` / `durationMs` come
  /// from the video controller so completion inference is exact.
  void endWatch(
    String reelId, {
    required int positionMs,
    required int durationMs,
  }) {
    final started = _openSessions.remove(reelId);
    if (started == null) return;
    final watchMs = DateTime.now().difference(started).inMilliseconds;
    if (watchMs <= 250) return; // filter accidental page-through swipes
    final completed = durationMs > 0 && positionMs >= (durationMs * 0.9).round();
    _pending.add(_WatchEvent(
      reelId: reelId,
      watchMs: watchMs,
      positionMs: positionMs,
      durationMs: durationMs,
      completed: completed,
      at: DateTime.now(),
    ));
    if (_pending.length >= 20) {
      unawaited(_flush());
    }
  }

  /// Force-flush pending events (called on tab hide, app pause, dispose).
  Future<void> flush() => _flush();

  Future<void> _flush() async {
    if (_pending.isEmpty) return;
    final batch = List<_WatchEvent>.from(_pending);
    _pending.clear();
    try {
      await _persistBatch(batch);
    } catch (e) {
      dev.log('analytics flush failed: $e', name: 'reels.analytics');
    }
  }

  Future<void> _persistBatch(List<_WatchEvent> batch) async {
    // No server table yet — surface via debug log so we can validate the
    // pipeline locally. When `reel_watch_events` (or an edge fn) is added,
    // swap this for the real writer without touching the feed page.
    for (final e in batch) {
      dev.log(
        'watch reel=${e.reelId} ms=${e.watchMs} pos=${e.positionMs}/${e.durationMs} '
        'done=${e.completed}',
        name: 'reels.analytics',
      );
    }
  }

  Future<void> dispose() async {
    await _flush();
    _openSessions.clear();
    _viewsRecordedThisSession.clear();
  }
}

class _WatchEvent {
  const _WatchEvent({
    required this.reelId,
    required this.watchMs,
    required this.positionMs,
    required this.durationMs,
    required this.completed,
    required this.at,
  });
  final String reelId;
  final int watchMs;
  final int positionMs;
  final int durationMs;
  final bool completed;
  final DateTime at;
}
