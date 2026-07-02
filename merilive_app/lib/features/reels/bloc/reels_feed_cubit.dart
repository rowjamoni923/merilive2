// R2 — Reels feed cubit.
//
// Owns the vertical feed state for a single category: pages, current index,
// loading/error flags, end-of-feed sentinel. Category chip switching creates
// a new cubit (via ReelsFeedController) so each tab keeps its own scroll
// position + prefetch pipeline — matches TikTok/Bigo tab isolation.

import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:meta/meta.dart';

import '../data/reels_models.dart';
import '../data/reels_repository.dart';

@immutable
class ReelsFeedState {
  const ReelsFeedState({
    this.reels = const [],
    this.currentIndex = 0,
    this.isInitialLoading = false,
    this.isPaging = false,
    this.reachedEnd = false,
    this.error,
  });

  final List<Reel> reels;
  final int currentIndex;
  final bool isInitialLoading;
  final bool isPaging;
  final bool reachedEnd;
  final Object? error;

  ReelsFeedState copyWith({
    List<Reel>? reels,
    int? currentIndex,
    bool? isInitialLoading,
    bool? isPaging,
    bool? reachedEnd,
    Object? error,
    bool clearError = false,
  }) {
    return ReelsFeedState(
      reels: reels ?? this.reels,
      currentIndex: currentIndex ?? this.currentIndex,
      isInitialLoading: isInitialLoading ?? this.isInitialLoading,
      isPaging: isPaging ?? this.isPaging,
      reachedEnd: reachedEnd ?? this.reachedEnd,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class ReelsFeedCubit extends Cubit<ReelsFeedState> {
  ReelsFeedCubit({
    required ReelsRepository repository,
    required this.categorySlug,
    required this.currentUserId,
    required List<ReelCategory> knownCategories,
  })  : _repo = repository,
        _knownCategories = knownCategories,
        super(const ReelsFeedState());

  final ReelsRepository _repo;
  final String categorySlug;
  final String? currentUserId;
  final List<ReelCategory> _knownCategories;

  /// Prefetch when the user is within this many items of the tail.
  static const int _prefetchThreshold = 3;

  Future<void> loadInitial() async {
    if (state.isInitialLoading) return;
    emit(state.copyWith(isInitialLoading: true, clearError: true));
    try {
      final page = await _repo.fetchFeed(
        categorySlug: categorySlug,
        currentUserId: currentUserId,
        knownCategories: _knownCategories,
        cursor: null,
      );
      emit(state.copyWith(
        reels: page,
        isInitialLoading: false,
        reachedEnd: page.isEmpty,
      ));
    } catch (e) {
      emit(state.copyWith(isInitialLoading: false, error: e));
    }
  }

  Future<void> refresh() async {
    try {
      final page = await _repo.fetchFeed(
        categorySlug: categorySlug,
        currentUserId: currentUserId,
        knownCategories: _knownCategories,
        cursor: null,
      );
      emit(state.copyWith(
        reels: page,
        currentIndex: 0,
        reachedEnd: page.isEmpty,
        clearError: true,
      ));
    } catch (e) {
      emit(state.copyWith(error: e));
    }
  }

  Future<void> _loadMore() async {
    if (state.isPaging || state.reachedEnd || state.reels.isEmpty) return;
    emit(state.copyWith(isPaging: true));
    try {
      final cursor = state.reels.last.createdAt;
      final page = await _repo.fetchFeed(
        categorySlug: categorySlug,
        currentUserId: currentUserId,
        knownCategories: _knownCategories,
        cursor: cursor,
      );
      final existing = {for (final r in state.reels) r.id};
      final merged = [
        ...state.reels,
        ...page.where((r) => !existing.contains(r.id)),
      ];
      emit(state.copyWith(
        reels: merged,
        isPaging: false,
        reachedEnd: page.isEmpty,
      ));
    } catch (e) {
      emit(state.copyWith(isPaging: false, error: e));
    }
  }

  void onIndexChanged(int index) {
    if (index == state.currentIndex) return;
    emit(state.copyWith(currentIndex: index));
    final remaining = state.reels.length - index - 1;
    if (remaining <= _prefetchThreshold) {
      unawaited(_loadMore());
    }
  }

  // ── Optimistic mutators (used by R4/R7). ────────────────────────────────
  void applyLikeToggle(String reelId, bool liked) {
    final list = [
      for (final r in state.reels)
        r.id == reelId
            ? r.copyWith(
                isLiked: liked,
                likeCount: (r.likeCount + (liked ? 1 : -1))
                    .clamp(0, 1 << 31),
              )
            : r,
    ];
    emit(state.copyWith(reels: list));
  }

  void applyFollowToggle(String userId, bool following) {
    final list = [
      for (final r in state.reels)
        r.userId == userId ? r.copyWith(isFollowing: following) : r,
    ];
    emit(state.copyWith(reels: list));
  }
}
