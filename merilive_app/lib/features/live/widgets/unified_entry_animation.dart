import 'dart:async';
import 'package:flutter/material.dart';

import 'entry_banner_animation.dart';
import 'entry_name_bar_animation.dart';

/// Flutter port of `UnifiedEntryAnimation.tsx` — dispatcher that decides
/// which entry effect to play for a joining user and enforces global queue.
///
/// Priority order (matches web):
/// 1. `Premium Entry Effects` (car/dragon banner) via [EntryBannerAnimation]
/// 2. `Flying Name Bars` via [EntryNameBarAnimation]
/// 3. Vehicle Entrance / Welcome chat message — handled elsewhere
///
/// Single global slot: any pending entry waits until the current one finishes.
/// Max 2s idle gap between successive entries is enforced by the caller.
///
/// Real Android VAP/SVGA rendering runs through NativeEntryAnimation plugin.
/// This class is the fallback + queue manager when native path is disabled.
class UnifiedEntryRequest {
  final String userId;
  final String userName;
  final int level;

  /// If provided → premium entry banner (vehicle) is used.
  final String? bannerImageUrl;
  final String? avatarUrl;
  final List<Color>? plateGradient;

  /// If provided (and [bannerImageUrl] is null) → flying name bar is used.
  final List<Color>? nameBarGradient;

  const UnifiedEntryRequest({
    required this.userId,
    required this.userName,
    required this.level,
    this.bannerImageUrl,
    this.avatarUrl,
    this.plateGradient,
    this.nameBarGradient,
  });
}

class UnifiedEntryAnimationController {
  UnifiedEntryAnimationController._();
  static final instance = UnifiedEntryAnimationController._();

  final List<_QueueItem> _q = [];
  bool _busy = false;
  BuildContext? _rootContext;

  void attach(BuildContext ctx) => _rootContext = ctx;
  void detach(BuildContext ctx) {
    if (_rootContext == ctx) _rootContext = null;
  }

  void enqueue(UnifiedEntryRequest req) {
    // dedupe: drop if same user id is already queued
    if (_q.any((e) => e.req.userId == req.userId)) return;
    if (_q.length > 24) _q.removeAt(0); // cap
    _q.add(_QueueItem(req));
    _drain();
  }

  Future<void> _drain() async {
    if (_busy) return;
    final ctx = _rootContext;
    if (ctx == null || _q.isEmpty) return;
    _busy = true;
    while (_q.isNotEmpty) {
      final item = _q.removeAt(0);
      final durMs = _play(ctx, item.req);
      await Future.delayed(Duration(milliseconds: durMs + 120));
    }
    _busy = false;
  }

  int _play(BuildContext ctx, UnifiedEntryRequest r) {
    if (r.bannerImageUrl != null) {
      EntryBannerAnimation.show(
        ctx,
        EntryBannerData(
          userName: r.userName,
          level: r.level,
          bannerImageUrl: r.bannerImageUrl!,
          plateGradient: r.plateGradient,
        ),
      );
      return 4200;
    }
    EntryNameBarAnimation.show(
      ctx,
      EntryNameBarData(
        userName: r.userName,
        level: r.level,
        gradient: r.nameBarGradient ??
            const [Color(0xFF3B82F6), Color(0xFF06B6D4)],
        avatarUrl: r.avatarUrl,
      ),
    );
    return 3000;
  }
}

class _QueueItem {
  final UnifiedEntryRequest req;
  _QueueItem(this.req);
}

/// Mount once (e.g. inside `live_stream_page.dart`) to bind an Overlay context.
class UnifiedEntryAnimationHost extends StatefulWidget {
  final Widget child;
  const UnifiedEntryAnimationHost({super.key, required this.child});

  @override
  State<UnifiedEntryAnimationHost> createState() =>
      _UnifiedEntryAnimationHostState();
}

class _UnifiedEntryAnimationHostState extends State<UnifiedEntryAnimationHost> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      UnifiedEntryAnimationController.instance.attach(context);
    });
  }

  @override
  void dispose() {
    UnifiedEntryAnimationController.instance.detach(context);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
