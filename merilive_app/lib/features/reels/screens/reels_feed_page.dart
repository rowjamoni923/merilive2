// R2 — Vertical feed skeleton.
//
// Full-screen dark canvas that hosts:
//   • Sticky top overlay with category chips (translucent, over video).
//   • Vertical PageView of reels for the active category.
//   • Pull-to-refresh at the top.
//   • Bottom gradient scrim for future info bar (R5).
//
// R3 will swap the ReelCardPlaceholder body for the real video player and
// wire preloading. This file owns the layout skeleton only.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../bloc/reels_categories_cubit.dart';
import '../bloc/reels_feed_cubit.dart';
import '../data/reels_models.dart';
import '../data/reels_repository.dart';
import '../widgets/reel_card_placeholder.dart';
import '../widgets/reels_category_chips.dart';

class ReelsFeedPage extends StatefulWidget {
  const ReelsFeedPage({super.key});

  @override
  State<ReelsFeedPage> createState() => _ReelsFeedPageState();
}

class _ReelsFeedPageState extends State<ReelsFeedPage>
    with AutomaticKeepAliveClientMixin {
  late final ReelsRepository _repo;
  late final ReelsCategoriesCubit _categoriesCubit;

  // One feed cubit per category slug — TikTok/Bigo keep each tab's scroll
  // position + prefetched pages when the user hops chips.
  final Map<String, ReelsFeedCubit> _feedCubits = {};
  final Map<String, PageController> _pageControllers = {};

  @override
  void initState() {
    super.initState();
    _repo = ReelsRepository(Supabase.instance.client);
    _categoriesCubit = ReelsCategoriesCubit(_repo)..load();
  }

  @override
  void dispose() {
    for (final c in _feedCubits.values) {
      c.close();
    }
    for (final c in _pageControllers.values) {
      c.dispose();
    }
    _categoriesCubit.close();
    super.dispose();
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
    return BlocProvider.value(
      value: _categoriesCubit,
      child: Scaffold(
        backgroundColor: Colors.black,
        extendBodyBehindAppBar: true,
        body: AnnotatedRegion<SystemUiOverlayStyle>(
          value: SystemUiOverlayStyle.light,
          child: Stack(
            children: [
              // ── Feed layer ─────────────────────────────────────────────
              Positioned.fill(
                child: BlocBuilder<ReelsCategoriesCubit, ReelsCategoriesState>(
                  builder: (context, catState) {
                    final slug = catState.selectedSlug;
                    final cubit = _cubitFor(slug, catState.categories);
                    return BlocProvider.value(
                      value: cubit,
                      child: _FeedPageView(
                        pageController: _pageControllerFor(slug),
                      ),
                    );
                  },
                ),
              ),

              // ── Top chip overlay (safe area padded) ────────────────────
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
    );
  }
}

class _FeedPageView extends StatelessWidget {
  const _FeedPageView({required this.pageController});

  final PageController pageController;

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<ReelsFeedCubit, ReelsFeedState>(
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
            controller: pageController,
            scrollDirection: Axis.vertical,
            physics: const _SnappyPageScrollPhysics(),
            onPageChanged: context.read<ReelsFeedCubit>().onIndexChanged,
            itemCount: state.reels.length,
            itemBuilder: (context, i) {
              return ReelCardPlaceholder(reel: state.reels[i]);
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
