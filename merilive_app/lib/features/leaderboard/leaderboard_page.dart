import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'bloc/leaderboard_cubit.dart';
import 'data/leaderboard_models.dart';
import 'data/leaderboard_repository.dart';

/// H8 — Leaderboard.
///
/// Pixel-parity target: `src/pages/Leaderboard.tsx`. Ports:
///   • 4 categories (Charm / Game / Wealth / PK) × 3 periods (D/W/M)
///   • Top-3 podium with gold/silver/bronze gradients
///   • Rank list (up to 50) with reward chip per row when configured
///   • Live countdown to next reset
///   • Self-rank sticky footer with gap-to-next
///
/// Realtime + custom podium frames + admin icons are intentionally deferred
/// — RPC data + `staleTime`-style pull refresh cover the launch surface.
@RoutePage()
class LeaderboardPage extends StatefulWidget {
  const LeaderboardPage({super.key});

  @override
  State<LeaderboardPage> createState() => _LeaderboardPageState();
}

class _LeaderboardPageState extends State<LeaderboardPage> {
  late final LeaderboardCubit _cubit;
  Timer? _countdownTimer;
  Duration _remaining = Duration.zero;
  String? _currentUserId;

  @override
  void initState() {
    super.initState();
    final client = Supabase.instance.client;
    _currentUserId = client.auth.currentUser?.id;
    _cubit = LeaderboardCubit(LeaderboardRepository(client))..start();
    _countdownTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _remaining = _computeRemaining());
    });
    _remaining = _computeRemaining();
  }

  Duration _computeRemaining() {
    final s = _cubit.state;
    final now = DateTime.now();
    DateTime end;
    if (s.category == LeaderboardCategory.pkCompetition && s.activePk != null) {
      end = s.activePk!.status == 'active'
          ? s.activePk!.endDate
          : s.activePk!.startDate;
    } else if (s.period == LeaderboardPeriod.daily) {
      var e = DateTime(now.year, now.month, now.day, 0, 30);
      if (now.isAfter(e)) e = e.add(const Duration(days: 1));
      end = e;
    } else if (s.period == LeaderboardPeriod.weekly) {
      final daysToMon = (8 - now.weekday) % 7 == 0 ? 7 : (8 - now.weekday) % 7;
      end = DateTime(now.year, now.month, now.day, 0, 30)
          .add(Duration(days: daysToMon));
    } else {
      end = DateTime(now.year, now.month + 1, 1, 0, 30);
    }
    final diff = end.difference(now);
    return diff.isNegative ? Duration.zero : diff;
  }

  @override
  void dispose() {
    _countdownTimer?.cancel();
    _cubit.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return BlocProvider.value(
      value: _cubit,
      child: Scaffold(
        backgroundColor: const Color(0xFFF7F8FA),
        body: SafeArea(
          child: BlocBuilder<LeaderboardCubit, LeaderboardState>(
            builder: (context, state) {
              return Column(
                children: [
                  _Header(
                    onBack: () => context.router.maybePop(),
                    countdown: _remaining,
                  ),
                  _CategoryTabs(
                    active: state.category,
                    onChange: _cubit.selectCategory,
                  ),
                  if (state.category != LeaderboardCategory.pkCompetition)
                    _PeriodTabs(
                      active: state.period,
                      onChange: _cubit.selectPeriod,
                    ),
                  Expanded(
                    child: RefreshIndicator(
                      onRefresh: _cubit.load,
                      child: _buildBody(state),
                    ),
                  ),
                  if (_currentUserId != null)
                    _SelfRankFooter(
                      userId: _currentUserId!,
                      rankings: state.rankings,
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }

  Widget _buildBody(LeaderboardState state) {
    if (state.isLoading && state.rankings.isEmpty) {
      return const Center(child: CircularProgressIndicator(strokeWidth: 2));
    }
    if (state.error != null && state.rankings.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: [
          Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              children: [
                const Icon(Icons.wifi_off_rounded,
                    size: 48, color: Color(0xFFEF4444)),
                const SizedBox(height: 10),
                Text(state.error!,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                        fontSize: 12, color: Color(0xFF64748B))),
              ],
            ),
          ),
        ],
      );
    }
    if (state.rankings.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          Padding(
            padding: EdgeInsets.all(48),
            child: Column(
              children: [
                Icon(Icons.emoji_events_outlined,
                    size: 56, color: Color(0xFF94A3B8)),
                SizedBox(height: 12),
                Text('No rankings yet',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF0F172A))),
                SizedBox(height: 4),
                Text('Pull to refresh.',
                    style:
                        TextStyle(fontSize: 12, color: Color(0xFF64748B))),
              ],
            ),
          ),
        ],
      );
    }
    final top3 = state.rankings.take(3).toList();
    final rest = state.rankings.length > 3
        ? state.rankings.sublist(3)
        : const <RankingEntry>[];
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.only(bottom: 100),
      children: [
        if (top3.isNotEmpty) _Podium(top3: top3, state: state),
        const SizedBox(height: 8),
        for (var i = 0; i < rest.length; i++)
          _RankRow(
            rank: i + 4,
            entry: rest[i],
            reward: state.rewardForRank(i + 4),
          ),
      ],
    );
  }
}

// ── Header ──────────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  const _Header({required this.onBack, required this.countdown});
  final VoidCallback onBack;
  final Duration countdown;

  @override
  Widget build(BuildContext context) {
    final d = countdown.inDays;
    final h = countdown.inHours % 24;
    final m = countdown.inMinutes % 60;
    final s = countdown.inSeconds % 60;
    final label = d > 0
        ? '${d}d ${h.toString().padLeft(2, '0')}h ${m.toString().padLeft(2, '0')}m'
        : '${h.toString().padLeft(2, '0')}:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(bottom: BorderSide(color: Color(0x14000000))),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back_rounded,
                color: Color(0xFF334155)),
            onPressed: onBack,
          ),
          const Expanded(
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.emoji_events_rounded,
                    color: Color(0xFFF59E0B), size: 20),
                SizedBox(width: 6),
                Text('Leaderboard',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF0F172A),
                    )),
              ],
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: const Color(0xFFFDE68A)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.schedule_rounded,
                    size: 12, color: Color(0xFF92400E)),
                const SizedBox(width: 4),
                Text(label,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF92400E),
                      fontFeatures: [FontFeature.tabularFigures()],
                    )),
              ],
            ),
          ),
          const SizedBox(width: 4),
        ],
      ),
    );
  }
}

// ── Category tabs ───────────────────────────────────────────────────────────
class _CategoryTabs extends StatelessWidget {
  const _CategoryTabs({required this.active, required this.onChange});
  final LeaderboardCategory active;
  final ValueChanged<LeaderboardCategory> onChange;

  static const _gradients = <LeaderboardCategory, List<Color>>{
    LeaderboardCategory.hostEarning: [Color(0xFFBE185D), Color(0xFFEC4899)],
    LeaderboardCategory.gameRanking: [Color(0xFF8B0000), Color(0xFFCD5C5C)],
    LeaderboardCategory.topGifter: [Color(0xFFB45309), Color(0xFFF59E0B)],
    LeaderboardCategory.pkCompetition: [Color(0xFF7C3AED), Color(0xFFA855F7)],
  };
  static const _icons = <LeaderboardCategory, IconData>{
    LeaderboardCategory.hostEarning: Icons.card_giftcard_rounded,
    LeaderboardCategory.gameRanking: Icons.sports_esports_rounded,
    LeaderboardCategory.topGifter: Icons.diamond_rounded,
    LeaderboardCategory.pkCompetition: Icons.bolt_rounded,
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
      child: Row(
        children: LeaderboardCategory.values.map((c) {
          final isActive = c == active;
          return Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                HapticFeedback.selectionClick();
                onChange(c);
              },
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 3),
                height: 40,
                decoration: BoxDecoration(
                  gradient: isActive
                      ? LinearGradient(colors: _gradients[c]!)
                      : null,
                  color: isActive ? null : const Color(0xFFF1F5F9),
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: isActive
                      ? [
                          BoxShadow(
                            color: _gradients[c]!.last.withOpacity(0.35),
                            blurRadius: 12,
                            offset: const Offset(0, 4),
                          )
                        ]
                      : null,
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(_icons[c],
                        size: 14,
                        color: isActive
                            ? Colors.white
                            : const Color(0xFF64748B)),
                    const SizedBox(width: 4),
                    Text(c.label,
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: isActive
                              ? Colors.white
                              : const Color(0xFF334155),
                        )),
                  ],
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ── Period tabs ─────────────────────────────────────────────────────────────
class _PeriodTabs extends StatelessWidget {
  const _PeriodTabs({required this.active, required this.onChange});
  final LeaderboardPeriod active;
  final ValueChanged<LeaderboardPeriod> onChange;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 10),
      child: Container(
        height: 32,
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(
          color: const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: const Color(0x14000000)),
        ),
        child: Row(
          children: LeaderboardPeriod.values.map((p) {
            final isActive = p == active;
            return Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  HapticFeedback.selectionClick();
                  onChange(p);
                },
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 1),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: isActive ? Colors.white : Colors.transparent,
                    borderRadius: BorderRadius.circular(999),
                    boxShadow: isActive
                        ? const [
                            BoxShadow(
                              color: Color(0x1F0F172A),
                              blurRadius: 6,
                              offset: Offset(0, 2),
                            ),
                          ]
                        : null,
                  ),
                  child: Text(p.label,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: isActive
                            ? const Color(0xFF0F172A)
                            : const Color(0xFF64748B),
                      )),
                ),
              ),
            );
          }).toList(),
        ),
      ),
    );
  }
}

// ── Podium ──────────────────────────────────────────────────────────────────
class _Podium extends StatelessWidget {
  const _Podium({required this.top3, required this.state});
  final List<RankingEntry> top3;
  final LeaderboardState state;

  @override
  Widget build(BuildContext context) {
    // Show 2 – 1 – 3 arrangement (silver, gold, bronze).
    final gold = top3.isNotEmpty ? top3[0] : null;
    final silver = top3.length > 1 ? top3[1] : null;
    final bronze = top3.length > 2 ? top3[2] : null;
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 14, 12, 6),
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 8),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFFFFFBEB), Color(0xFFFFF7ED)],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFFDE68A)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x14D97706),
            blurRadius: 20,
            offset: Offset(0, 6),
          ),
        ],
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
              child: _PodiumTile(
                  rank: 2,
                  entry: silver,
                  reward: state.rewardForRank(2))),
          Expanded(
              child: _PodiumTile(
                  rank: 1,
                  entry: gold,
                  reward: state.rewardForRank(1),
                  bigger: true)),
          Expanded(
              child: _PodiumTile(
                  rank: 3,
                  entry: bronze,
                  reward: state.rewardForRank(3))),
        ],
      ),
    );
  }
}

class _PodiumTile extends StatelessWidget {
  const _PodiumTile({
    required this.rank,
    required this.entry,
    this.reward,
    this.bigger = false,
  });
  final int rank;
  final RankingEntry? entry;
  final RewardTier? reward;
  final bool bigger;

  static const _ringColors = <int, List<Color>>{
    1: [Color(0xFFFBBF24), Color(0xFFD97706)],
    2: [Color(0xFFCBD5E1), Color(0xFF94A3B8)],
    3: [Color(0xFFF59E0B), Color(0xFF92400E)],
  };

  @override
  Widget build(BuildContext context) {
    final size = bigger ? 76.0 : 60.0;
    if (entry == null) return SizedBox(height: size + 60);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: size + 8,
              height: size + 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: _ringColors[rank]!),
                boxShadow: [
                  BoxShadow(
                    color: _ringColors[rank]!.last.withOpacity(0.45),
                    blurRadius: 16,
                  )
                ],
              ),
              padding: const EdgeInsets.all(3),
              child: CircleAvatar(
                radius: size / 2,
                backgroundColor: Colors.white,
                backgroundImage: (entry!.avatarUrl != null &&
                        entry!.avatarUrl!.isNotEmpty)
                    ? NetworkImage(entry!.avatarUrl!)
                    : null,
                child: (entry!.avatarUrl == null ||
                        entry!.avatarUrl!.isEmpty)
                    ? Text(entry!.display.substring(0, 1).toUpperCase(),
                        style: TextStyle(
                          fontSize: size / 3,
                          fontWeight: FontWeight.w800,
                          color: const Color(0xFF94A3B8),
                        ))
                    : null,
              ),
            ),
            Positioned(
              top: -2,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: _ringColors[rank]!),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(color: Colors.white, width: 1.5),
                ),
                child: Text('$rank',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                    )),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        SizedBox(
          width: double.infinity,
          child: Text(
            entry!.display,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: bigger ? 13 : 12,
              fontWeight: FontWeight.w800,
              color: const Color(0xFF0F172A),
            ),
          ),
        ),
        const SizedBox(height: 2),
        Text(
          formatStat(entry!.statValue),
          style: TextStyle(
            fontSize: bigger ? 13 : 11,
            fontWeight: FontWeight.w800,
            color: const Color(0xFFB45309),
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        if (reward != null && reward!.shortLabel.isNotEmpty) ...[
          const SizedBox(height: 4),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(reward!.shortLabel,
                style: const TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF92400E),
                )),
          ),
        ],
      ],
    );
  }
}

// ── Rank list row ───────────────────────────────────────────────────────────
class _RankRow extends StatelessWidget {
  const _RankRow({required this.rank, required this.entry, this.reward});
  final int rank;
  final RankingEntry entry;
  final RewardTier? reward;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(12, 6, 12, 0),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0x11000000)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A0F172A),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          SizedBox(
            width: 26,
            child: Text('$rank',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: Color(0xFF64748B),
                  fontFeatures: [FontFeature.tabularFigures()],
                )),
          ),
          const SizedBox(width: 8),
          CircleAvatar(
            radius: 20,
            backgroundColor: const Color(0xFFE2E8F0),
            backgroundImage:
                (entry.avatarUrl != null && entry.avatarUrl!.isNotEmpty)
                    ? NetworkImage(entry.avatarUrl!)
                    : null,
            child: (entry.avatarUrl == null || entry.avatarUrl!.isEmpty)
                ? Text(entry.display.substring(0, 1).toUpperCase(),
                    style: const TextStyle(
                        color: Color(0xFF64748B),
                        fontWeight: FontWeight.w700))
                : null,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        entry.display,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFF0F172A),
                        ),
                      ),
                    ),
                    if (entry.countryFlag != null) ...[
                      const SizedBox(width: 6),
                      Text(entry.countryFlag!,
                          style: const TextStyle(fontSize: 12)),
                    ],
                  ],
                ),
                const SizedBox(height: 2),
                Text('Lv.${entry.displayLevel}',
                    style: const TextStyle(
                      fontSize: 10,
                      color: Color(0xFF94A3B8),
                      fontWeight: FontWeight.w600,
                    )),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(formatStat(entry.statValue),
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFFB45309),
                    fontFeatures: [FontFeature.tabularFigures()],
                  )),
              if (reward != null && reward!.shortLabel.isNotEmpty) ...[
                const SizedBox(height: 2),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 6, vertical: 1.5),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(reward!.shortLabel,
                      style: const TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: Color(0xFF92400E),
                      )),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }
}

// ── Self-rank footer (industry-standard "challenge the top" CTA anchor) ────
class _SelfRankFooter extends StatelessWidget {
  const _SelfRankFooter({required this.userId, required this.rankings});
  final String userId;
  final List<RankingEntry> rankings;

  @override
  Widget build(BuildContext context) {
    final idx = rankings.indexWhere((r) => r.id == userId);
    final myRank = idx >= 0 ? idx + 1 : null;
    final me = idx >= 0 ? rankings[idx] : null;
    final next = idx > 0 ? rankings[idx - 1] : null;
    final gap = (next != null && me != null)
        ? (next.statValue - me.statValue).clamp(0, double.infinity)
        : 0;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 14),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: Color(0x14000000))),
        boxShadow: [
          BoxShadow(
              color: Color(0x140F172A),
              blurRadius: 12,
              offset: Offset(0, -3))
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 34,
            height: 34,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                  colors: [Color(0xFF9333EA), Color(0xFFEC4899)]),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Text(
              myRank != null ? '$myRank' : '—',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w900,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  myRank != null ? 'Your rank #$myRank' : 'Not ranked yet',
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: Color(0xFF0F172A),
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  next != null
                      ? '${formatStat(gap)} to reach #${(myRank ?? 0) - 1}'
                      : (myRank == 1
                          ? 'You are #1 🏆'
                          : 'Send a gift or go live to enter'),
                  style: const TextStyle(
                    fontSize: 11,
                    color: Color(0xFF64748B),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
