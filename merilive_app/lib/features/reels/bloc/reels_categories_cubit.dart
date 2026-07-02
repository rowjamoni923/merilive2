// R2 — Categories cubit.
//
// Fetches `reel_categories` once at tab-open and exposes the strip that feeds
// the sticky chip row. The 'All' sentinel is inserted by the repository so
// the widget layer stays presentational.

import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:meta/meta.dart';

import '../data/reels_models.dart';
import '../data/reels_repository.dart';

@immutable
class ReelsCategoriesState {
  const ReelsCategoriesState({
    this.categories = const [ReelCategory.all],
    this.selectedSlug = 'all',
    this.isLoading = false,
    this.error,
  });

  final List<ReelCategory> categories;
  final String selectedSlug;
  final bool isLoading;
  final Object? error;

  ReelsCategoriesState copyWith({
    List<ReelCategory>? categories,
    String? selectedSlug,
    bool? isLoading,
    Object? error,
    bool clearError = false,
  }) {
    return ReelsCategoriesState(
      categories: categories ?? this.categories,
      selectedSlug: selectedSlug ?? this.selectedSlug,
      isLoading: isLoading ?? this.isLoading,
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class ReelsCategoriesCubit extends Cubit<ReelsCategoriesState> {
  ReelsCategoriesCubit(this._repo) : super(const ReelsCategoriesState());

  final ReelsRepository _repo;

  Future<void> load() async {
    if (state.isLoading) return;
    emit(state.copyWith(isLoading: true, clearError: true));
    try {
      final cats = await _repo.fetchCategories();
      emit(state.copyWith(categories: cats, isLoading: false));
    } catch (e) {
      emit(state.copyWith(isLoading: false, error: e));
    }
  }

  void select(String slug) {
    if (slug == state.selectedSlug) return;
    emit(state.copyWith(selectedSlug: slug));
  }
}
