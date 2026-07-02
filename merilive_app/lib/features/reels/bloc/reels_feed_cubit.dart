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
import '../data/reels_realtime.dart';
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
    required ReelsRealtime realtime,
    required this.categorySlug,
    required this.currentUserId,
    required List<ReelCategory> knownCategories,
  })  : _repo = repository,
        _realtime = realtime,
        _knownCategories = knownCategories,
        super(const ReelsFeedState()) {
    _realtimeSub = _realtime.stream.listen(_onRealtimePatch);
  }

  final ReelsRepository _repo;
  final ReelsRealtime _realtime;
  final String categorySlug;
  final String? currentUserId;
  final List<ReelCategory> _knownCategories;
  StreamSubscription<ReelPatch>? _realtimeSub;
  Timer? _reelUpsertDebounce;

  /// Prefetch when the user is within this many items of the tail.
  static const int _prefetchThreshold = 3;

  void _onRealtimePatch(ReelPatch p) {
    // Ignore echoes of our own optimistic mutations — the local path already
    // updated the counter, and applying the realtime delta on top would
    // double-count.
    if (p.actorUserId != null && p.actorUserId == currentUserId) return;

    switch (p.kind) {
      case ReelPatchKind.likeAdd:
        _bumpCount(p.reelId, likeDelta: 1);
        break;
      case ReelPatchKind.likeRemove:
        _bumpCount(p.reelId, likeDelta: -1);
        break;
      case ReelPatchKind.commentAdd:
        _bumpCount(p.reelId, commentDelta: 1);
        break;
      case ReelPatchKind.commentRemove:
        _bumpCount(p.reelId, commentDelta: -1);
        break;
      case ReelPatchKind.shareAdd:
        _bumpCount(p.reelId, shareDelta: 1);
        break;
      case ReelPatchKind.reelUpsert:
        // Debounced silent tail-refresh so new uploads / approval flips /
        // deletes surface without yanking the current viewer off-screen.
        _reelUpsertDebounce?.cancel();
        _reelUpsertDebounce =
            Timer(const Duration(milliseconds: 1500), _silentRefresh);
        break;
    }
  }

  void _bumpCount(
    String reelId, {
    int likeDelta = 0,
    int commentDelta = 0,
    int shareDelta = 0,
  }) {
    if (likeDelta == 0 && commentDelta == 0 && shareDelta == 0) return;
    var touched = false;
    final list = [
      for (final r in state.reels)
        if (r.id == reelId)
          () {
            touched = true;
            return r.copyWith(
              likeCount: (r.likeCount + likeDelta).clamp(0, 1 << 31),
              commentCount:
                  (r.commentCount + commentDelta).clamp(0, 1 << 31),
              shareCount: (r.shareCount + shareDelta).clamp(0, 1 << 31),
            );
          }()
        else
          r,
    ];
    if (touched) emit(state.copyWith(reels: list));
  }

  Future<void> _silentRefresh() async {
    try {
      final page = await _repo.fetchFeed(
        categorySlug: categorySlug,
        currentUserId: currentUserId,
        knownCategories: _knownCategories,
        cursor: null,
      );
      if (page.isEmpty) return;
      // Merge without disturbing the current index — new reels prepend only
      // if we're at the very top so the viewer isn't yanked.
      final existing = {for (final r in state.reels) r.id};
      final freshTop =
          page.where((r) => !existing.contains(r.id)).toList(growable: false);
      if (freshTop.isEmpty) return;
      final merged = state.currentIndex == 0
          ? [...freshTop, ...state.reels]
          : [...state.reels, ...freshTop];
      emit(state.copyWith(reels: merged));
    } catch (_) {
      // Best-effort refresh; ignore failures.
    }
  }

  @override
  Future<void> close() async {
    _reelUpsertDebounce?.cancel();
    await _realtimeSub?.cancel();
    return super.close();
  }


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

  /// R6 — adjust the visible comment count on the target reel. Used by the
  /// comments sheet after a successful post/delete + realtime deltas.
  void bumpComment(String reelId, int delta) {
    if (delta == 0) return;
    final list = [
      for (final r in state.reels)
        r.id == reelId
            ? r.copyWith(
                commentCount:
                    (r.commentCount + delta).clamp(0, 1 << 31),
              )
            : r,
    ];
    emit(state.copyWith(reels: list));
  }

  // ── Server-backed actions with optimistic rollback (R4). ────────────────
  Future<void> toggleLike(String reelId) async {
    final uid = currentUserId;
    if (uid == null) return;
    final current = state.reels.firstWhere(
      (r) => r.id == reelId,
      orElse: () => throw StateError('reel gone'),
    );
    final next = !current.isLiked;
    applyLikeToggle(reelId, next);
    try {
      if (next) {
        await _repo.like(reelId, uid);
      } else {
        await _repo.unlike(reelId, uid);
      }
    } catch (_) {
      applyLikeToggle(reelId, !next);
    }
  }

  Future<void> toggleFollow(String targetUserId) async {
    final uid = currentUserId;
    if (uid == null || uid == targetUserId) return;
    final target = state.reels.firstWhere(
      (r) => r.userId == targetUserId,
      orElse: () => throw StateError('user gone'),
    );
    final next = !target.isFollowing;
    applyFollowToggle(targetUserId, next);
    try {
      if (next) {
        await _repo.follow(targetUserId, uid);
      } else {
        await _repo.unfollow(targetUserId, uid);
      }
    } catch (_) {
      applyFollowToggle(targetUserId, !next);
    }
  }

  Future<void> recordShare({
    required String reelId,
    required String platform,
    required String shareType,
  }) async {
    final uid = currentUserId;
    if (uid == null) return;
    final list = [
      for (final r in state.reels)
        r.id == reelId ? r.copyWith(shareCount: r.shareCount + 1) : r,
    ];
    emit(state.copyWith(reels: list));
    try {
      await _repo.recordShare(
        reelId: reelId,
        userId: uid,
        platform: platform,
        shareType: shareType,
      );
    } catch (_) {
      // Realtime will reconcile; leave optimistic value.
    }
  }

  Future<void> reportReel({
    required String reelId,
    required String reason,
    String? description,
  }) async {
    final uid = currentUserId;
    if (uid == null) return;
    await _repo.report(
      reelId: reelId,
      userId: uid,
      reason: reason,
      description: description,
    );
  }
}
