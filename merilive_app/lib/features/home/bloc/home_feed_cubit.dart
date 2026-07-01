import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../data/home_feed_repository.dart';
import '../data/home_host.dart';

enum HomeSubTab { popular, live, newHosts, follow }

extension HomeSubTabRpc on HomeSubTab {
  String get rpcValue => switch (this) {
        HomeSubTab.popular => 'popular',
        HomeSubTab.live => 'live',
        HomeSubTab.newHosts => 'new',
        HomeSubTab.follow => 'following',
      };
}

class HomeFeedState extends Equatable {
  const HomeFeedState({
    required this.hosts,
    required this.selectedCountry,
    required this.subTab,
    required this.isLoading,
    required this.isRefreshing,
    this.errorMessage,
  });

  factory HomeFeedState.initial() => const HomeFeedState(
        hosts: [],
        selectedCountry: 'all',
        subTab: HomeSubTab.popular,
        isLoading: true,
        isRefreshing: false,
      );

  final List<HomeHost> hosts;
  final String selectedCountry;
  final HomeSubTab subTab;
  final bool isLoading;
  final bool isRefreshing;
  final String? errorMessage;

  HomeFeedState copyWith({
    List<HomeHost>? hosts,
    String? selectedCountry,
    HomeSubTab? subTab,
    bool? isLoading,
    bool? isRefreshing,
    String? errorMessage,
    bool clearError = false,
  }) =>
      HomeFeedState(
        hosts: hosts ?? this.hosts,
        selectedCountry: selectedCountry ?? this.selectedCountry,
        subTab: subTab ?? this.subTab,
        isLoading: isLoading ?? this.isLoading,
        isRefreshing: isRefreshing ?? this.isRefreshing,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      );

  @override
  List<Object?> get props =>
      [hosts, selectedCountry, subTab, isLoading, isRefreshing, errorMessage];
}

/// Owns the home feed. Debounces realtime invalidations (server pushes a lot
/// during peak live hours) and coalesces country/sub-tab changes into a single
/// pending fetch so we never fire two RPCs in flight for the same view.
class HomeFeedCubit extends Cubit<HomeFeedState> {
  HomeFeedCubit(this._repo, {String? currentUserId})
      : _currentUserId = currentUserId,
        super(HomeFeedState.initial());

  final HomeFeedRepository _repo;
  final String? _currentUserId;

  StreamSubscription<void>? _invalSub;
  Timer? _debounce;
  int _requestId = 0;

  void start() {
    refresh();
    _invalSub ??= _repo.watchInvalidations().listen((_) => _scheduleRefresh());
  }

  void selectCountry(String code) {
    if (code == state.selectedCountry) return;
    emit(state.copyWith(selectedCountry: code, isLoading: true));
    refresh();
  }

  void selectSubTab(HomeSubTab tab) {
    if (tab == state.subTab) return;
    emit(state.copyWith(subTab: tab, isLoading: true));
    refresh();
  }

  void _scheduleRefresh() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), refresh);
  }

  Future<void> refresh() async {
    final myId = ++_requestId;
    if (state.hosts.isNotEmpty) {
      emit(state.copyWith(isRefreshing: true, clearError: true));
    }
    try {
      final rows = await _repo.fetch(
        selectedCountry: state.selectedCountry,
        subTab: state.subTab.rpcValue,
        currentUserId: _currentUserId,
      );
      if (myId != _requestId) return; // superseded
      emit(state.copyWith(
        hosts: rows,
        isLoading: false,
        isRefreshing: false,
        clearError: true,
      ));
    } catch (e) {
      if (myId != _requestId) return;
      emit(state.copyWith(
        isLoading: false,
        isRefreshing: false,
        errorMessage: e.toString(),
      ));
    }
  }

  @override
  Future<void> close() async {
    _debounce?.cancel();
    await _invalSub?.cancel();
    return super.close();
  }
}
