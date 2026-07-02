// R3 — Reels video controller pool.
//
// TikTok/Bigo/Chamet keep a tiny bounded set of decoders alive around the
// currently visible reel and dispose the rest to save memory + battery.
//
// Strategy (see mem://features/pk-battle-research.md style — competitor-locked):
//   • Cache size: 5 controllers max (current + 2 ahead + 2 behind).
//   • Preload window: index-1 .. index+2 (initialized, paused, buffered).
//   • Play only the controller matching the active index.
//   • Evict LRU when cache exceeds size.
//   • All controllers are network HLS/MP4; muted-by-default on preload so iOS
//     doesn't reject autoplay, then unmuted when it becomes active.

import 'dart:async';
import 'dart:collection';

import 'package:flutter/foundation.dart';
import 'package:video_player/video_player.dart';

class ReelVideoHandle {
  ReelVideoHandle(this.reelId, this.controller);
  final String reelId;
  final VideoPlayerController controller;
  bool initialized = false;
  Object? error;
}

class ReelVideoPool {
  ReelVideoPool({this.maxSize = 5});

  final int maxSize;
  // LinkedHashMap preserves insertion order — we treat that as LRU.
  final LinkedHashMap<String, ReelVideoHandle> _cache =
      LinkedHashMap<String, ReelVideoHandle>();

  bool _muted = false;

  bool get isMuted => _muted;

  /// Returns an existing handle or creates + initializes one.
  Future<ReelVideoHandle> acquire(String reelId, String url) async {
    final existing = _cache.remove(reelId);
    if (existing != null) {
      // Bump recency.
      _cache[reelId] = existing;
      return existing;
    }

    final controller = VideoPlayerController.networkUrl(
      Uri.parse(url),
      videoPlayerOptions: VideoPlayerOptions(
        mixWithOthers: false,
        allowBackgroundPlayback: false,
      ),
    );
    final handle = ReelVideoHandle(reelId, controller);
    _cache[reelId] = handle;
    _evictIfNeeded();

    try {
      await controller.initialize();
      await controller.setLooping(true);
      await controller.setVolume(_muted ? 0.0 : 1.0);
      handle.initialized = true;
    } catch (e) {
      handle.error = e;
      if (kDebugMode) {
        debugPrint('[ReelVideoPool] init failed for $reelId: $e');
      }
    }
    return handle;
  }

  ReelVideoHandle? peek(String reelId) => _cache[reelId];

  Future<void> play(String reelId) async {
    final h = _cache[reelId];
    if (h == null || !h.initialized) return;
    await h.controller.play();
  }

  Future<void> pause(String reelId) async {
    final h = _cache[reelId];
    if (h == null || !h.initialized) return;
    await h.controller.pause();
  }

  Future<void> pauseAll() async {
    for (final h in _cache.values) {
      if (h.initialized) await h.controller.pause();
    }
  }

  Future<void> setMuted(bool muted) async {
    _muted = muted;
    for (final h in _cache.values) {
      if (h.initialized) {
        await h.controller.setVolume(muted ? 0.0 : 1.0);
      }
    }
  }

  /// Drop everything outside [keep] and dispose the rest.
  Future<void> retainOnly(Set<String> keep) async {
    final toDrop =
        _cache.keys.where((id) => !keep.contains(id)).toList(growable: false);
    for (final id in toDrop) {
      final h = _cache.remove(id);
      if (h != null) {
        await _safeDispose(h.controller);
      }
    }
  }

  Future<void> disposeAll() async {
    for (final h in _cache.values) {
      await _safeDispose(h.controller);
    }
    _cache.clear();
  }

  void _evictIfNeeded() {
    while (_cache.length > maxSize) {
      final oldestKey = _cache.keys.first;
      final h = _cache.remove(oldestKey);
      if (h != null) {
        // Fire-and-forget — dispose is async but safe to background.
        unawaited(_safeDispose(h.controller));
      }
    }
  }

  Future<void> _safeDispose(VideoPlayerController c) async {
    try {
      await c.pause();
    } catch (_) {}
    try {
      await c.dispose();
    } catch (_) {}
  }
}
