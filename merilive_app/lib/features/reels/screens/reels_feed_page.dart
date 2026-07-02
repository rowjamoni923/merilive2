// R8 — Reels vertical feed with real player, preload pool, and analytics.
//
// R2 laid down the layout skeleton (chip strip + PageView + refresh + states).
// R3 added a shared ReelVideoPool (5-controller LRU), preloading, and
// lifecycle-aware pause/resume.
// R6 added the comments sheet + auto-pause while open.
// R7 wired the real gift + share sheets.
// R8 adds:
//   • Analytics: idempotent `reel_views` writes on becoming active +
//     watch-time / completion telemetry batched via ReelsAnalyticsService.
//   • Polish: haptic on page snap, double-tap-to-like with heart burst,
//     buffering indicator while the active handle warms up.
//   • Fix: routed the comments-sheet handler through the child widget so it
//     no longer references a missing top-level symbol.

import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../bloc/reels_categories_cubit.dart';
import '../bloc/reels_feed_cubit.dart';
import '../data/reel_video_pool.dart';
import '../data/reels_analytics_service.dart';
import '../data/reels_models.dart';
import '../data/reels_realtime.dart';
import '../data/reels_repository.dart';
import '../widgets/reel_bottom_info.dart';
import '../widgets/reel_comments_sheet.dart';
import '../widgets/reel_gift_sheet.dart';
import '../widgets/reel_player.dart';
import '../widgets/reel_right_rail.dart';
import '../widgets/reel_share_sheet.dart';
import '../widgets/reels_category_chips.dart';

class ReelsFeedPage extends StatefulWidget {
  const ReelsFeedPage({super.key});

  @override
  State<ReelsFeedPage> createState() => _ReelsFeedPageState();
}

class _ReelsFeedPageState extends State<ReelsFeedPage>
    with AutomaticKeepAliveClientMixin, WidgetsBindingObserver {
  late final ReelsRepository _repo;
  late final ReelsCategoriesCubit _categoriesCubit;
  late final ReelVideoPool _pool;
  late final ReelsAnalyticsService _analytics;

  // One realtime channel per category — subscribed lazily on first hop and
  // reused so counter deltas from other devices tick without a refetch.
  final Map<String, ReelsRealtime> _realtimes = {};
  final Map<String, ReelsFeedCubit> _feedCubits = {};
  final Map<String, PageController> _pageControllers = {};

  bool _tabVisible = true;
  bool _appResumed = true;
  bool _muted = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _repo = ReelsRepository(Supabase.instance.client);
    _categoriesCubit = ReelsCategoriesCubit(_repo)..load();
    _pool = ReelVideoPool();
    _analytics = ReelsAnalyticsService(_repo);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final c in _feedCubits.values) {
      c.close();
    }
    for (final rt in _realtimes.values) {
      unawaited(rt.dispose());
    }
    for (final c in _pageControllers.values) {
      c.dispose();
    }
    _categoriesCubit.close();
    unawaited(_analytics.dispose());
    unawaited(_pool.disposeAll());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appResumed = state == AppLifecycleState.resumed;
    if (!_appResumed) {
      unawaited(_pool.pauseAll());
      unawaited(_analytics.flush());
    } else {
      _syncPlayback();
    }
  }

  void _onTabVisibility(double fraction) {
    final visible = fraction > 0.6;
    if (visible == _tabVisible) return;
    _tabVisible = visible;
    if (!visible) {
      unawaited(_pool.pauseAll());
      unawaited(_analytics.flush());
    } else {
      _syncPlayback();
    }
  }

  bool get _canPlay => _tabVisible && _appResumed;

  void _syncPlayback() {
    if (!mounted) return;
    final slug = _categoriesCubit.state.selectedSlug;
    final cubit = _feedCubits[slug];
    if (cubit == null) return;
    final s = cubit.state;
    if (s.reels.isEmpty) return;
    final active = s.reels[s.currentIndex.clamp(0, s.reels.length - 1)];
    if (_canPlay) {
      unawaited(_pool.play(active.id));
    }
  }

  Future<void> _toggleMute() async {
    setState(() => _muted = !_muted);
    await _pool.setMuted(_muted);
  }

  // R6 — pauses playback while open, resumes on close.
  Future<void> _openCommentsSheet(Reel reel) async {
    unawaited(_pool.pauseAll());
    try {
      await showReelCommentsSheet(context: context, reel: reel);
    } finally {
      if (mounted) _syncPlayback();
    }
  }

  @override
  bool get wantKeepAlive => true;

  ReelsFeedCubit _cubitFor(String slug, List<ReelCategory> knownCategories) {
    return _feedCubits.putIfAbsent(slug, () {
      final realtime = _realtimes.putIfAbsent(
        slug,
        () => ReelsRealtime(Supabase.instance.client)..subscribe(slug),
      );
      final cubit = ReelsFeedCubit(
        repository: _repo,
        realtime: realtime,
        categorySlug: slug,
        currentUserId: Supabase.instance.client.auth.currentUser?.id,
        knownCategories: knownCategories,
      )..loadInitial();
      return cubit;
    });
  }

  PageController _pageControllerFor(String slug) {
    return _pageControllers.putIfAbsent(
      slug,
      () => PageController(keepPage: true),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return VisibilityDetector(
      key: const Key('reels-tab-visibility'),
      onVisibilityChanged: (info) => _onTabVisibility(info.visibleFraction),
      child: BlocProvider.value(
        value: _categoriesCubit,
        child: Scaffold(
          backgroundColor: Colors.black,
          extendBodyBehindAppBar: true,
          body: AnnotatedRegion<SystemUiOverlayStyle>(
            value: SystemUiOverlayStyle.light,
            child: Stack(
              children: [
                Positioned.fill(
                  child:
                      BlocBuilder<ReelsCategoriesCubit, ReelsCategoriesState>(
                    builder: (context, catState) {
                      final slug = catState.selectedSlug;
                      final cubit = _cubitFor(slug, catState.categories);
                      unawaited(_pool.pauseAll());
                      return BlocProvider.value(
                        value: cubit,
                        child: _FeedPageView(
                          pageController: _pageControllerFor(slug),
                          pool: _pool,
                          analytics: _analytics,
                          canPlay: _canPlay,
                          muted: _muted,
                          onToggleMute: _toggleMute,
                          onComment: _openCommentsSheet,
                        ),
                      );
                    },
                  ),
                ),
                Positioned(
                  top: 0,
                  left: 0,
                  right: 0,
                  child: SafeArea(
                    bottom: false,
                    child: Padding(
                      padding: const EdgeInsets.only(top: 6, bottom: 6),
                      child: BlocBuilder<ReelsCategoriesCubit,
                          ReelsCategoriesState>(
                        builder: (context, state) {
                          return ReelsCategoryChips(
                            categories: state.categories,
                            selectedSlug: state.selectedSlug,
                            onSelected: _categoriesCubit.select,
                          );
                        },
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _FeedPageView extends StatefulWidget {
  const _FeedPageView({
    required this.pageController,
    required this.pool,
    required this.analytics,
    required this.canPlay,
    required this.muted,
    required this.onToggleMute,
    required this.onComment,
  });

  final PageController pageController;
  final ReelVideoPool pool;
  final ReelsAnalyticsService analytics;
  final bool canPlay;
  final bool muted;
  final VoidCallback onToggleMute;
  final ValueChanged<Reel> onComment;

  @override
  State<_FeedPageView> createState() => _FeedPageViewState();
}

class _FeedPageViewState extends State<_FeedPageView> {
  String? _lastActiveReelId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _syncActive(context.read<ReelsFeedCubit>().state);
    });
  }

  @override
  void didUpdateWidget(covariant _FeedPageView oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.canPlay != widget.canPlay) {
      _syncActive(context.read<ReelsFeedCubit>().state);
    }
  }

  Future<void> _syncActive(ReelsFeedState state) async {
    if (state.reels.isEmpty) return;
    final idx = state.currentIndex.clamp(0, state.reels.length - 1);
    final active = state.reels[idx];

    final keep = <String>{};
    for (int i = idx - 1; i <= idx + 2; i++) {
      if (i >= 0 && i < state.reels.length) {
        keep.add(state.reels[i].id);
      }
    }
    await widget.pool.retainOnly(keep);

    unawaited(widget.pool.acquire(active.id, active.videoUrl).then((_) async {
      if (!mounted) return;
      if (widget.canPlay &&
          context.read<ReelsFeedCubit>().state.currentIndex == idx) {
        await widget.pool.play(active.id);
        setState(() {});
      }
    }));
    for (int i = idx - 1; i <= idx + 2; i++) {
      if (i == idx) continue;
      if (i >= 0 && i < state.reels.length) {
        final r = state.reels[i];
        unawaited(widget.pool.acquire(r.id, r.videoUrl).then((_) {
          if (mounted) setState(() {});
        }));
      }
    }

    // R8 — close the previous watch window and open a new one; also stamp
    // an idempotent first-per-day view on `reel_views`.
    if (_lastActiveReelId != null && _lastActiveReelId != active.id) {
      final prevHandle = widget.pool.peek(_lastActiveReelId!);
      final v = prevHandle?.controller.value;
      widget.analytics.endWatch(
        _lastActiveReelId!,
        positionMs: v?.position.inMilliseconds ?? 0,
        durationMs: v?.duration.inMilliseconds ?? 0,
      );
      unawaited(widget.pool.pause(_lastActiveReelId!));
    }
    widget.analytics.beginWatch(active.id);
    unawaited(widget.analytics.recordViewOnce(
      reelId: active.id,
      userId: Supabase.instance.client.auth.currentUser?.id,
    ));

    _lastActiveReelId = active.id;
  }

  @override
  Widget build(BuildContext context) {
    return BlocConsumer<ReelsFeedCubit, ReelsFeedState>(
      listenWhen: (a, b) =>
          a.currentIndex != b.currentIndex ||
          a.reels.length != b.reels.length ||
          (a.reels.isEmpty && b.reels.isNotEmpty),
      listener: (context, state) => _syncActive(state),
      builder: (context, state) {
        if (state.isInitialLoading && state.reels.isEmpty) {
          return const _CenterLoader();
        }
        if (state.error != null && state.reels.isEmpty) {
          return _ErrorRetry(
            onRetry: () => context.read<ReelsFeedCubit>().loadInitial(),
          );
        }
        if (state.reels.isEmpty) {
          return const _EmptyState();
        }
        return RefreshIndicator(
          color: Colors.white,
          backgroundColor: Colors.black87,
          onRefresh: () => context.read<ReelsFeedCubit>().refresh(),
          child: PageView.builder(
            controller: widget.pageController,
            scrollDirection: Axis.vertical,
            physics: const _SnappyPageScrollPhysics(),
            onPageChanged: (i) {
              // R8 — light haptic on page snap.
              HapticFeedback.selectionClick();
              context.read<ReelsFeedCubit>().onIndexChanged(i);
            },
            itemCount: state.reels.length,
            itemBuilder: (context, i) {
              final reel = state.reels[i];
              final handle = widget.pool.peek(reel.id);
              final isActive = i == state.currentIndex;
              return _ReelSlide(
                key: ValueKey('reel-slide-${reel.id}'),
                reel: reel,
                handle: handle,
                isActive: isActive && widget.canPlay,
                muted: widget.muted,
                onToggleMute: widget.onToggleMute,
                onComment: widget.onComment,
              );
            },
          ),
        );
      },
    );
  }
}

/// One vertical slide: player + right rail + bottom info + double-tap-like
/// heart burst overlay.
class _ReelSlide extends StatefulWidget {
  const _ReelSlide({
    super.key,
    required this.reel,
    required this.handle,
    required this.isActive,
    required this.muted,
    required this.onToggleMute,
    required this.onComment,
  });

  final Reel reel;
  final ReelVideoHandle? handle;
  final bool isActive;
  final bool muted;
  final VoidCallback onToggleMute;
  final ValueChanged<Reel> onComment;

  @override
  State<_ReelSlide> createState() => _ReelSlideState();
}

class _ReelSlideState extends State<_ReelSlide> {
  final List<_HeartBurst> _bursts = [];
  int _burstSeq = 0;

  void _spawnBurst(Offset localPos) {
    final b = _HeartBurst(
      id: ++_burstSeq,
      position: localPos,
      angle: (math.Random().nextDouble() - 0.5) * 0.6,
    );
    setState(() => _bursts.add(b));
    Future.delayed(const Duration(milliseconds: 750), () {
      if (!mounted) return;
      setState(() => _bursts.removeWhere((x) => x.id == b.id));
    });
  }

  void _handleDoubleTap(TapDownDetails d) {
    HapticFeedback.mediumImpact();
    _spawnBurst(d.localPosition);
    final cubit = context.read<ReelsFeedCubit>();
    // Only fire the network call when transitioning to liked; if it's
    // already liked we still spawn the burst (Instagram / TikTok parity).
    if (!widget.reel.isLiked) {
      unawaited(cubit.toggleLike(widget.reel.id));
    }
  }

  bool get _isBuffering {
    final h = widget.handle;
    if (h == null) return widget.isActive;
    if (!h.initialized) return widget.isActive;
    final v = h.controller.value;
    return widget.isActive && v.isBuffering && !v.isPlaying;
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onDoubleTapDown: _handleDoubleTap,
          onDoubleTap: () {}, // required so onDoubleTapDown fires reliably
          child: ReelPlayer(
            key: ValueKey('reel-${widget.reel.id}'),
            reel: widget.reel,
            handle: widget.handle,
            isActive: widget.isActive,
            isMuted: widget.muted,
            onToggleMute: widget.onToggleMute,
          ),
        ),
        if (_isBuffering)
          const Positioned.fill(
            child: IgnorePointer(
              child: Center(
                child: SizedBox(
                  width: 26,
                  height: 26,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
        ..._bursts.map(
          (b) => Positioned(
            left: b.position.dx - 55,
            top: b.position.dy - 55,
            child: IgnorePointer(child: _HeartBurstWidget(burst: b)),
          ),
        ),
        Positioned(
          right: 0,
          bottom: 0,
          child: ReelRightRail(
            reel: widget.reel,
            onLike: (r) => context.read<ReelsFeedCubit>().toggleLike(r.id),
            onFollow: (r) =>
                context.read<ReelsFeedCubit>().toggleFollow(r.userId),
            onAvatarTap: (r) => _openProfile(context, r.userId),
            onComment: widget.onComment,
            onGift: (r) => _openGiftPlaceholder(context, r),
            onShare: (r) => _openSharePlaceholder(context, r),
            onMore: (r) => _openMoreMenu(context, r),
          ),
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: ReelBottomInfo(
            reel: widget.reel,
            isActive: widget.isActive,
            onHandleTap: (r) => _openProfile(context, r.userId),
            onSoundTap: (r) => _openSoundPlaceholder(context, r),
          ),
        ),
      ],
    );
  }
}

class _HeartBurst {
  _HeartBurst({required this.id, required this.position, required this.angle});
  final int id;
  final Offset position;
  final double angle;
}

class _HeartBurstWidget extends StatefulWidget {
  const _HeartBurstWidget({required this.burst});
  final _HeartBurst burst;
  @override
  State<_HeartBurstWidget> createState() => _HeartBurstWidgetState();
}

class _HeartBurstWidgetState extends State<_HeartBurstWidget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  late final Animation<double> _scale;
  late final Animation<double> _opacity;
  late final Animation<double> _rise;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 720),
    );
    _scale = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.4, end: 1.15), weight: 30),
      TweenSequenceItem(tween: Tween(begin: 1.15, end: 1.0), weight: 20),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.9), weight: 50),
    ]).animate(_c);
    _opacity = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 0.0, end: 1.0), weight: 20),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.0), weight: 40),
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 0.0), weight: 40),
    ]).animate(_c);
    _rise = Tween(begin: 0.0, end: -22.0).animate(
      CurvedAnimation(parent: _c, curve: Curves.easeOut),
    );
    _c.forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) => Transform.translate(
        offset: Offset(0, _rise.value),
        child: Transform.rotate(
          angle: widget.burst.angle,
          child: Transform.scale(
            scale: _scale.value,
            child: Opacity(
              opacity: _opacity.value,
              child: const Icon(
                Icons.favorite,
                color: Color(0xFFFF4D6D),
                size: 110,
                shadows: [Shadow(color: Colors.black45, blurRadius: 18)],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Handlers ────────────────────────────────────────────────────────────────

void _openProfile(BuildContext context, String userId) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text('Profile: $userId'),
      duration: const Duration(milliseconds: 900),
      behavior: SnackBarBehavior.floating,
    ),
  );
}

void _openGiftPlaceholder(BuildContext context, Reel reel) {
  final uid = Supabase.instance.client.auth.currentUser?.id;
  if (uid == null) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Sign in to send gifts'),
        duration: Duration(milliseconds: 1200),
        behavior: SnackBarBehavior.floating,
      ),
    );
    return;
  }
  if (uid == reel.userId) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text("You can't gift your own reel"),
        duration: Duration(milliseconds: 1200),
        behavior: SnackBarBehavior.floating,
      ),
    );
    return;
  }
  showReelGiftSheet(context: context, reel: reel);
}

void _openSharePlaceholder(BuildContext context, Reel reel) {
  final cubit = context.read<ReelsFeedCubit>();
  showReelShareSheet(
    context: context,
    reel: reel,
    cubit: cubit,
    onReport: () => _openReportSheet(context, cubit, reel),
  );
}

void _openSoundPlaceholder(BuildContext context, Reel reel) {
  final label = reel.isOriginalSound
      ? 'Original sound'
      : (reel.soundTitle ?? reel.musicTitle ?? 'Sound');
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      content: Text(label),
      duration: const Duration(milliseconds: 900),
      behavior: SnackBarBehavior.floating,
    ),
  );
}

void _openMoreMenu(BuildContext context, Reel reel) {
  final cubit = context.read<ReelsFeedCubit>();
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: const Color(0xFF111827),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (ctx) {
      return SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 6),
            Container(
              width: 36,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(height: 6),
            ListTile(
              leading: const Icon(Icons.flag_outlined, color: Colors.white),
              title: const Text('Report',
                  style: TextStyle(color: Colors.white)),
              onTap: () {
                Navigator.pop(ctx);
                _openReportSheet(context, cubit, reel);
              },
            ),
            ListTile(
              leading: const Icon(Icons.block, color: Colors.white),
              title: const Text('Not interested',
                  style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.pop(ctx),
            ),
            ListTile(
              leading: const Icon(Icons.close, color: Colors.white70),
              title: const Text('Cancel',
                  style: TextStyle(color: Colors.white70)),
              onTap: () => Navigator.pop(ctx),
            ),
          ],
        ),
      );
    },
  );
}

void _openReportSheet(
  BuildContext context,
  ReelsFeedCubit cubit,
  Reel reel,
) {
  const reasons = <String>[
    'Sexual content',
    'Violence or dangerous acts',
    'Hate speech',
    'Harassment or bullying',
    'Spam or misleading',
    'Other',
  ];
  showModalBottomSheet<void>(
    context: context,
    backgroundColor: const Color(0xFF111827),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (ctx) {
      return SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(16, 14, 16, 8),
              child: Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Report this reel',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ),
            for (final r in reasons)
              ListTile(
                title: Text(r,
                    style: const TextStyle(color: Colors.white)),
                onTap: () async {
                  Navigator.pop(ctx);
                  try {
                    await cubit.reportReel(reelId: reel.id, reason: r);
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Report submitted'),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    }
                  } catch (_) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Could not submit report'),
                          behavior: SnackBarBehavior.floating,
                        ),
                      );
                    }
                  }
                },
              ),
          ],
        ),
      );
    },
  );
}

class _SnappyPageScrollPhysics extends PageScrollPhysics {
  const _SnappyPageScrollPhysics({super.parent});

  @override
  _SnappyPageScrollPhysics applyTo(ScrollPhysics? ancestor) {
    return _SnappyPageScrollPhysics(parent: buildParent(ancestor));
  }

  @override
  SpringDescription get spring => const SpringDescription(
        mass: 60,
        stiffness: 130,
        damping: 1.1,
      );
}

class _CenterLoader extends StatelessWidget {
  const _CenterLoader();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: SizedBox(
        width: 32,
        height: 32,
        child: CircularProgressIndicator(
          strokeWidth: 2.4,
          color: Colors.white,
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.symmetric(horizontal: 32),
        child: Text(
          'No reels here yet.\nCheck back soon.',
          textAlign: TextAlign.center,
          style: TextStyle(
            color: Colors.white70,
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _ErrorRetry extends StatelessWidget {
  const _ErrorRetry({required this.onRetry});
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, color: Colors.white70, size: 40),
          const SizedBox(height: 10),
          const Text(
            'Couldn\u2019t load reels.',
            style: TextStyle(color: Colors.white70, fontSize: 13),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: onRetry,
            style: TextButton.styleFrom(
              foregroundColor: Colors.white,
              backgroundColor: Colors.white.withOpacity(0.12),
              padding:
                  const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
            child: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
