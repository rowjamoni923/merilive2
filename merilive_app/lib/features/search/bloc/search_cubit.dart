import 'dart:async';

import 'package:flutter_bloc/flutter_bloc.dart';

import '../data/recent_searches_store.dart';
import '../data/search_repository.dart';
import '../data/search_user.dart';

class SearchState {
  const SearchState({
    this.query = '',
    this.selectedTags = const [],
    this.results = const [],
    this.recents = const [],
    this.followingIds = const {},
    this.isLoading = false,
    this.errorMessage,
  });

  final String query;
  final List<String> selectedTags;
  final List<SearchUser> results;
  final List<SearchUser> recents;
  final Set<String> followingIds;
  final bool isLoading;
  final String? errorMessage;

  bool get hasActiveInput => query.trim().isNotEmpty || selectedTags.isNotEmpty;

  SearchState copyWith({
    String? query,
    List<String>? selectedTags,
    List<SearchUser>? results,
    List<SearchUser>? recents,
    Set<String>? followingIds,
    bool? isLoading,
    Object? errorMessage = _sentinel,
  }) {
    return SearchState(
      query: query ?? this.query,
      selectedTags: selectedTags ?? this.selectedTags,
      results: results ?? this.results,
      recents: recents ?? this.recents,
      followingIds: followingIds ?? this.followingIds,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: identical(errorMessage, _sentinel)
          ? this.errorMessage
          : errorMessage as String?,
    );
  }

  static const _sentinel = Object();
}

class SearchCubit extends Cubit<SearchState> {
  SearchCubit(this._repo, {this.currentUserId})
      : super(SearchState(recents: RecentSearchesStore.instance.items));

  final SearchRepository _repo;
  final String? currentUserId;

  Timer? _debounce;
  int _requestSeq = 0;

  Future<void> bootstrap() async {
    // Hydrate persisted recents before anything else so the empty-state
    // shows the real list instead of an empty flash.
    try {
      await RecentSearchesStore.instance.hydrate();
      if (!isClosed) {
        emit(state.copyWith(recents: RecentSearchesStore.instance.items));
      }
    } catch (_) {}
    if (currentUserId == null) return;
    try {
      final ids = await _repo.loadFollowingIds(currentUserId!);
      if (!isClosed) emit(state.copyWith(followingIds: ids));
    } catch (_) {/* non-fatal */}
  }

  void setQuery(String q) {
    emit(state.copyWith(query: q));
    _scheduleSearch();
  }

  void toggleTag(String tag) {
    final list = [...state.selectedTags];
    list.contains(tag) ? list.remove(tag) : list.add(tag);
    emit(state.copyWith(selectedTags: list));
    _scheduleSearch();
  }

  void clearTags() {
    emit(state.copyWith(selectedTags: const []));
    _scheduleSearch();
  }

  void _scheduleSearch() {
    _debounce?.cancel();
    if (!state.hasActiveInput) {
      emit(state.copyWith(results: const [], isLoading: false, errorMessage: null));
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 300), _runSearch);
  }

  Future<void> _runSearch() async {
    final seq = ++_requestSeq;
    emit(state.copyWith(isLoading: true, errorMessage: null));
    try {
      final list = await _repo.search(
        query: state.query,
        tags: state.selectedTags,
      );
      if (seq != _requestSeq || isClosed) return;
      final filtered = currentUserId == null
          ? list
          : list.where((u) => u.id != currentUserId).toList();
      emit(state.copyWith(results: filtered, isLoading: false));
    } catch (e) {
      if (seq != _requestSeq || isClosed) return;
      emit(state.copyWith(
        isLoading: false,
        errorMessage: 'Search failed. Please try again.',
      ));
    }
  }

  Future<void> rememberTap(SearchUser user) async {
    await RecentSearchesStore.instance.add(user);
    if (!isClosed) {
      emit(state.copyWith(recents: RecentSearchesStore.instance.items));
    }
  }

  Future<void> removeRecent(String id) async {
    await RecentSearchesStore.instance.remove(id);
    if (!isClosed) {
      emit(state.copyWith(recents: RecentSearchesStore.instance.items));
    }
  }

  Future<void> clearRecents() async {
    await RecentSearchesStore.instance.clear();
    if (!isClosed) emit(state.copyWith(recents: const []));
  }

  Future<String?> toggleFollow(String targetId) async {
    if (currentUserId == null) return 'Please login first';
    if (currentUserId == targetId) return "You can't follow yourself";
    final isFollowing = state.followingIds.contains(targetId);
    final next = {...state.followingIds};
    isFollowing ? next.remove(targetId) : next.add(targetId);
    emit(state.copyWith(followingIds: next));
    try {
      if (isFollowing) {
        await _repo.unfollow(currentUserId!, targetId);
      } else {
        await _repo.follow(currentUserId!, targetId);
      }
      return null;
    } catch (e) {
      // rollback
      final rollback = {...state.followingIds};
      isFollowing ? rollback.add(targetId) : rollback.remove(targetId);
      emit(state.copyWith(followingIds: rollback));
      final msg = e.toString();
      if (msg.contains('cannot follow yourself')) return "You can't follow yourself";
      if (msg.contains('unavailable user')) return 'This user is not available';
      if (msg.contains('blocked relationship')) return "Blocked — can't follow";
      if (msg.contains('duplicate key')) return 'Already following';
      return 'Action failed';
    }
  }

  @override
  Future<void> close() {
    _debounce?.cancel();
    return super.close();
  }
}
