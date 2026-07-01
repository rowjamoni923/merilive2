import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../data/banner.dart';
import '../data/banner_repository.dart';

/// State for the home banner rails.
///
/// Split rule matches `src/components/home/DynamicBanner.tsx`:
///   • `top`    → last banner in the active list (highest display_order)
///   • `middle` → everything else, in display_order
class BannerState extends Equatable {
  const BannerState({
    this.isLoading = true,
    this.errorMessage,
    this.top = const [],
    this.middle = const [],
  });

  final bool isLoading;
  final String? errorMessage;
  final List<HomeBanner> top;
  final List<HomeBanner> middle;

  BannerState copyWith({
    bool? isLoading,
    String? errorMessage,
    List<HomeBanner>? top,
    List<HomeBanner>? middle,
    bool clearError = false,
  }) =>
      BannerState(
        isLoading: isLoading ?? this.isLoading,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
        top: top ?? this.top,
        middle: middle ?? this.middle,
      );

  @override
  List<Object?> get props => [isLoading, errorMessage, top, middle];
}

class BannerCubit extends Cubit<BannerState> {
  BannerCubit(this._repo) : super(const BannerState());

  final BannerRepository _repo;
  StreamSubscription<void>? _sub;
  Timer? _debounce;

  Future<void> start() async {
    await refresh();
    _sub ??= _repo.watchInvalidations().listen((_) {
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 400), refresh);
    });
  }

  Future<void> refresh() async {
    try {
      final list = (await _repo.fetch()).where((b) => b.isActiveNow).toList();
      if (list.isEmpty) {
        emit(state.copyWith(
            isLoading: false, top: const [], middle: const [], clearError: true));
        return;
      }
      // Match web: last banner → top slot, remainder → middle slot.
      final top = <HomeBanner>[list.last];
      final middle = list.sublist(0, list.length - 1);
      emit(state.copyWith(
          isLoading: false, top: top, middle: middle, clearError: true));
    } catch (e) {
      emit(state.copyWith(isLoading: false, errorMessage: e.toString()));
    }
  }

  @override
  Future<void> close() async {
    _debounce?.cancel();
    await _sub?.cancel();
    return super.close();
  }
}
