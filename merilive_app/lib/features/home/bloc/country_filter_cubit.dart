import 'package:equatable/equatable.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../data/country_repository.dart';

/// Country filter state for the home tab.
///
/// Web parity notes:
///   • Seed list paints immediately (no waiting on network).
///   • RPC result is merged in on top; if it fails we keep the seed silently
///     — the strip stays usable, matches web `useQuery` degrading gracefully.
///   • Selected code persists across refreshes; defaults to `all`.
class CountryFilterState extends Equatable {
  const CountryFilterState({
    required this.countries,
    required this.selectedCode,
    required this.isLoading,
    this.errorMessage,
  });

  factory CountryFilterState.initial(List<HomeCountry> seed) =>
      CountryFilterState(
        countries: seed,
        selectedCode: 'all',
        isLoading: true,
      );

  final List<HomeCountry> countries;
  final String selectedCode;
  final bool isLoading;
  final String? errorMessage;

  CountryFilterState copyWith({
    List<HomeCountry>? countries,
    String? selectedCode,
    bool? isLoading,
    String? errorMessage,
    bool clearError = false,
  }) =>
      CountryFilterState(
        countries: countries ?? this.countries,
        selectedCode: selectedCode ?? this.selectedCode,
        isLoading: isLoading ?? this.isLoading,
        errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      );

  @override
  List<Object?> get props =>
      [countries, selectedCode, isLoading, errorMessage];
}

class CountryFilterCubit extends Cubit<CountryFilterState> {
  CountryFilterCubit(this._repo)
      : super(CountryFilterState.initial(
          _repo.merge(const <HomeCountry>[]),
        ));

  final CountryRepository _repo;

  /// Refresh dynamic countries from the RPC. Safe to call on tab enter or
  /// after pull-to-refresh; keeps the currently selected code when possible.
  Future<void> refresh() async {
    emit(state.copyWith(isLoading: true, clearError: true));
    try {
      final dynamic_ = await _repo.fetchDynamic();
      final merged = _repo.merge(dynamic_);
      final stillPresent =
          merged.any((c) => c.code == state.selectedCode);
      emit(state.copyWith(
        countries: merged,
        isLoading: false,
        selectedCode: stillPresent ? state.selectedCode : 'all',
      ));
    } catch (e) {
      emit(state.copyWith(isLoading: false, errorMessage: e.toString()));
    }
  }

  void select(String code) {
    if (code == state.selectedCode) return;
    emit(state.copyWith(selectedCode: code));
  }
}
