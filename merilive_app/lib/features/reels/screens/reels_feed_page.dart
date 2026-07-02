// R2 + R3 — Vertical feed with real video player and preload pool.
//
// R2 laid down the layout skeleton (chip strip + PageView + refresh + states).
// R3 adds:
//   • Shared ReelVideoPool (5-controller LRU) with index-1..index+2 preload.
//   • Global mute toggle propagated to every pooled controller.
//   • Lifecycle awareness: pauses when tab hidden, app backgrounded, or the
//     current route is covered by another PageRoute.
//   • Handoff on category switch — old category's controllers are paused
//     (kept warm in LRU so hopping back is instant).

import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:visibility_detector/visibility_detector.dart';

import '../bloc/reels_categories_cubit.dart';
import '../bloc/reels_feed_cubit.dart';
import '../data/reel_video_pool.dart';
import '../data/reels_models.dart';
import '../data/reels_repository.dart';
import '../widgets/reel_player.dart';
import '../widgets/reel_right_rail.dart';
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

  // One feed cubit per category slug — TikTok/Bigo keep each tab's scroll
  // position + prefetched pages when the user hops chips.
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
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    for (final c in _feedCubits.values) {
      c.close();
    }
    for (final c in _pageControllers.values) {
      c.dispose();
    }
    _categoriesCubit.close();
    unawaited(_pool.disposeAll());
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appResumed = state == AppLifecycleState.resumed;
    if (!_appResumed) {
      unawaited(_pool.pauseAll());
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
    } else {
      _syncPlayback();
    }
  }

  bool get _canPlay => _tabVisible && _appResumed;

  void _syncPlayback() {
    // Called after visibility/lifecycle change — the current visible slug's
    // active reel resumes if we can play.
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

  @override
  bool get wantKeepAlive => true;

  ReelsFeedCubit _cubitFor(String slug, List<ReelCategory> knownCategories) {
    return _feedCubits.putIfAbsent(slug, () {
      final cubit = ReelsFeedCubit(
        repository: _repo,
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
                // ── Feed layer ────────────────────────────────────────────
                Positioned.fill(
                  child:
                      BlocBuilder<ReelsCategoriesCubit, ReelsCategoriesState>(
                    builder: (context, catState) {
                      final slug = catState.selectedSlug;
                      final cubit = _cubitFor(slug, catState.categories);
                      // Pause any other-category playback the moment slug
                      // changes — we keep controllers warm in the LRU.
                      unawaited(_pool.pauseAll());
                      return BlocProvider.value(
                        value: cubit,
                        child: _FeedPageView(
                          pageController: _pageControllerFor(slug),
                          pool: _pool,
                          canPlay: _canPlay,
                          muted: _muted,
                          onToggleMute: _toggleMute,
                        ),
                      );
                    },
                  ),
                ),

                // ── Top chip overlay (safe area padded) ───────────────────
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

/// Feed body: watches feed state, drives the pool (preload/play/evict), and
/// renders a ReelPlayer per page.
class _FeedPageView extends StatefulWidget {
  const _FeedPageView({
    required this.pageController,
    required this.pool,
    required this.canPlay,
    required this.muted,
    required this.onToggleMute,
  });

  final PageController pageController;
  final ReelVideoPool pool;
  final bool canPlay;
  final bool muted;
  final VoidCallback onToggleMute;

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
    // Lifecycle/mute changes may need to re-sync playback.
    if (oldWidget.canPlay != widget.canPlay) {
      _syncActive(context.read<ReelsFeedCubit>().state);
    }
  }

  Future<void> _syncActive(ReelsFeedState state) async {
    if (state.reels.isEmpty) return;
    final idx = state.currentIndex.clamp(0, state.reels.length - 1);
    final active = state.reels[idx];

    // Keep-set: index-1 .. index+2 → matches pool max (5).
    final keep = <String>{};
    for (int i = idx - 1; i <= idx + 2; i++) {
      if (i >= 0 && i < state.reels.length) {
        keep.add(state.reels[i].id);
      }
    }
    // Retain warm controllers only for the neighborhood.
    await widget.pool.retainOnly(keep);

    // Acquire active + neighbors (fire-and-forget for non-active).
    unawaited(widget.pool.acquire(active.id, active.videoUrl).then((_) async {
      if (!mounted) return;
      if (widget.canPlay &&
          context.read<ReelsFeedCubit>().state.currentIndex == idx) {
        await widget.pool.play(active.id);
        setState(() {}); // rebuild player once handle is ready
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

    // Pause any previously active reel that isn't active anymore.
    if (_lastActiveReelId != null && _lastActiveReelId != active.id) {
      unawaited(widget.pool.pause(_lastActiveReelId!));
    }
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
            onPageChanged: context.read<ReelsFeedCubit>().onIndexChanged,
            itemCount: state.reels.length,
            itemBuilder: (context, i) {
              final reel = state.reels[i];
              final handle = widget.pool.peek(reel.id);
              final isActive = i == state.currentIndex;
              return ReelPlayer(
                key: ValueKey('reel-${reel.id}'),
                reel: reel,
                handle: handle,
                isActive: isActive && widget.canPlay,
                isMuted: widget.muted,
                onToggleMute: widget.onToggleMute,
              );
            },
          ),
        );
      },
    );
  }
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
            'Couldn’t load reels.',
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
