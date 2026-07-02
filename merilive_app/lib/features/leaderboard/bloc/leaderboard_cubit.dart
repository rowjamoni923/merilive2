import 'package:flutter_bloc/flutter_bloc.dart';

import '../data/leaderboard_models.dart';
import '../data/leaderboard_repository.dart';

class LeaderboardState {
  final LeaderboardCategory category;
  final LeaderboardPeriod period;
  final bool isLoading;
  final String? error;
  final List<RankingEntry> rankings;
  final List<RewardTier> rewardTiers;
  final List<PkCompetitionRow> pkCompetitions;
  final PkCompetitionRow? activePk;

  const LeaderboardState({
    this.category = LeaderboardCategory.hostEarning,
    this.period = LeaderboardPeriod.weekly,
    this.isLoading = false,
    this.error,
    this.rankings = const [],
    this.rewardTiers = const [],
    this.pkCompetitions = const [],
    this.activePk,
  });

  LeaderboardState copyWith({
    LeaderboardCategory? category,
    LeaderboardPeriod? period,
    bool? isLoading,
    String? error,
    List<RankingEntry>? rankings,
    List<RewardTier>? rewardTiers,
    List<PkCompetitionRow>? pkCompetitions,
    PkCompetitionRow? activePk,
    bool clearError = false,
    bool clearActivePk = false,
  }) =>
      LeaderboardState(
        category: category ?? this.category,
        period: period ?? this.period,
        isLoading: isLoading ?? this.isLoading,
        error: clearError ? null : (error ?? this.error),
        rankings: rankings ?? this.rankings,
        rewardTiers: rewardTiers ?? this.rewardTiers,
        pkCompetitions: pkCompetitions ?? this.pkCompetitions,
        activePk: clearActivePk ? null : (activePk ?? this.activePk),
      );

  RewardTier? rewardForRank(int rank) {
    for (final t in rewardTiers) {
      if (t.covers(rank)) return t;
    }
    return null;
  }
}

class LeaderboardCubit extends Cubit<LeaderboardState> {
  LeaderboardCubit(this._repo) : super(const LeaderboardState());
  final LeaderboardRepository _repo;
  int _reqSeq = 0;

  Future<void> start() => load();

  Future<void> selectCategory(LeaderboardCategory c) async {
    if (c == state.category) return;
    emit(state.copyWith(category: c, rankings: const [], rewardTiers: const []));
    await load();
  }

  Future<void> selectPeriod(LeaderboardPeriod p) async {
    if (p == state.period) return;
    emit(state.copyWith(period: p, rankings: const [], rewardTiers: const []));
    await load();
  }

  /// Switch the active PK competition (chip strip). Reloads only the
  /// participants + reward tiers for that competition — the competitions list
  /// itself isn't refetched, which keeps the strip stable while data loads.
  Future<void> selectPkCompetition(String competitionId) async {
    if (state.category != LeaderboardCategory.pkCompetition) return;
    if (state.activePk?.id == competitionId) return;
    final target = state.pkCompetitions.firstWhere(
      (c) => c.id == competitionId,
      orElse: () => _empty,
    );
    if (target == _empty) return;
    final myReq = ++_reqSeq;
    emit(state.copyWith(
      activePk: target,
      isLoading: true,
      rankings: const [],
      rewardTiers: const [],
      clearError: true,
    ));
    try {
      final parts = await _repo.fetchPkParticipants(target);
      final rewards = await _repo.fetchPkRewardTiers(target.id);
      if (myReq != _reqSeq) return;
      emit(state.copyWith(
        isLoading: false,
        rankings: parts,
        rewardTiers: rewards,
      ));
    } catch (e) {
      if (myReq != _reqSeq) return;
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }

  Future<void> load() async {
    final myReq = ++_reqSeq;
    emit(state.copyWith(isLoading: true, clearError: true));
    try {
      if (state.category == LeaderboardCategory.pkCompetition) {
        final comps = await _repo.fetchPkCompetitions();
        if (myReq != _reqSeq) return;
        final active =
            comps.firstWhere((c) => c.status == 'active', orElse: () => comps.isNotEmpty ? comps.first : _empty);
        if (active == _empty) {
          emit(state.copyWith(
            isLoading: false,
            pkCompetitions: comps,
            clearActivePk: true,
            rankings: const [],
            rewardTiers: const [],
          ));
          return;
        }
        final parts = await _repo.fetchPkParticipants(active);
        final rewards = await _repo.fetchPkRewardTiers(active.id);
        if (myReq != _reqSeq) return;
        emit(state.copyWith(
          isLoading: false,
          pkCompetitions: comps,
          activePk: active,
          rankings: parts,
          rewardTiers: rewards,
        ));
      } else {
        final res = await Future.wait([
          _repo.fetchRankings(category: state.category, period: state.period),
          _repo.fetchRewardTiers(category: state.category, period: state.period),
        ]);
        if (myReq != _reqSeq) return;
        emit(state.copyWith(
          isLoading: false,
          rankings: res[0] as List<RankingEntry>,
          rewardTiers: res[1] as List<RewardTier>,
        ));
      }
    } catch (e) {
      if (myReq != _reqSeq) return;
      emit(state.copyWith(isLoading: false, error: e.toString()));
    }
  }
}

// Sentinel used to signal "no competition" without nullable acrobatics inside
// firstWhere.
final PkCompetitionRow _empty = PkCompetitionRow(
  id: '',
  title: '',
  startDate: DateTime.fromMillisecondsSinceEpoch(0),
  endDate: DateTime.fromMillisecondsSinceEpoch(0),
  status: '',
  competitionType: '',
);
