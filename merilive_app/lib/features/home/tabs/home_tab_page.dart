import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/router/app_router.gr.dart';
import '../../../core/theme/design_tokens.dart';
import '../bloc/country_filter_cubit.dart';
import '../bloc/home_feed_cubit.dart';
import '../data/country_repository.dart';
import '../data/home_feed_repository.dart';
import '../data/home_host.dart';
import '../widgets/host_card.dart';

/// Home tab — H1 header + H2 dynamic countries + H3 feed data layer.
///
/// H3 wires the live feed (`get_public_home_hosts_v2` + realtime invalidations
/// on live_streams/party_rooms/private_calls). Rendering here is intentionally
/// minimal — H4 replaces the temporary tile list with the real HostCard grid,
/// tap-routing matrix and thumbnail pipeline.
class HomeTabPage extends StatefulWidget {
  const HomeTabPage({super.key});

  @override
  State<HomeTabPage> createState() => _HomeTabPageState();
}

// Re-exported enum lives in bloc/home_feed_cubit.dart to keep RPC parity
// (popular/live/new/following) in a single place.
typedef _SubTab = HomeSubTab;

class _HomeTabPageState extends State<HomeTabPage>
    with AutomaticKeepAliveClientMixin {
  late final CountryFilterCubit _countryCubit;
  late final HomeFeedCubit _feedCubit;

  @override
  void initState() {
    super.initState();
    final client = Supabase.instance.client;
    _countryCubit = CountryFilterCubit(CountryRepository(client))..refresh();
    _feedCubit = HomeFeedCubit(
      HomeFeedRepository(client),
      currentUserId: client.auth.currentUser?.id,
    )..start();
  }

  @override
  void dispose() {
    _countryCubit.close();
    _feedCubit.close();
    super.dispose();
  }

  @override
  bool get wantKeepAlive => true;

  void _toast(String msg) {
    HapticFeedback.selectionClick();
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(msg),
          duration: const Duration(seconds: 2),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return MultiBlocProvider(
      providers: [
        BlocProvider.value(value: _countryCubit),
        BlocProvider.value(value: _feedCubit),
      ],
      child: Container(
        color: DT.homeBg,
        child: SafeArea(
          bottom: false,
          child: Column(
            children: [
              BlocBuilder<CountryFilterCubit, CountryFilterState>(
                builder: (context, countryState) =>
                    BlocBuilder<HomeFeedCubit, HomeFeedState>(
                  buildWhen: (p, n) => p.subTab != n.subTab,
                  builder: (context, feedState) => _HomeHeader(
                    subTab: feedState.subTab,
                    onSubTab: (t) => _feedCubit.selectSubTab(t),
                    onSearchTap: () =>
                        _toast('Search — lands in a later sector'),
                    onTrophyTap: () =>
                        _toast('Leaderboard — lands in a later sector'),
                    countries: countryState.countries,
                    selectedCountry: countryState.selectedCode,
                    onCountry: (c) {
                      _countryCubit.select(c);
                      _feedCubit.selectCountry(c);
                    },
                  ),
                ),
              ),
              Expanded(
                child: BlocBuilder<HomeFeedCubit, HomeFeedState>(
                  builder: (context, state) {
                    if (state.isLoading && state.hosts.isEmpty) {
                      return const Center(
                        child: CircularProgressIndicator(strokeWidth: 2),
                      );
                    }
                    if (state.errorMessage != null && state.hosts.isEmpty) {
                      return _FeedErrorView(
                        message: state.errorMessage!,
                        onRetry: () => _feedCubit.refresh(),
                      );
                    }
                    if (state.hosts.isEmpty) {
                      return const _FeedEmptyView();
                    }
                    return RefreshIndicator(
                      onRefresh: () => _feedCubit.refresh(),
                      child: _HostGrid(
                        hosts: state.hosts,
                        onTapHost: _handleHostTap,
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  /// Tap-routing matrix — parity with `src/pages/Index.tsx#handleUserClick`:
  ///   • LIVE   → /live/:liveStreamId  (viewer)
  ///   • BUSY / ONLINE / OFFLINE → /profile-detail/:userId
  void _handleHostTap(HomeHost host) {
    HapticFeedback.selectionClick();
    if (host.isLive && (host.liveStreamId?.isNotEmpty ?? false)) {
      context.router.push(LiveStreamPlaceholderRoute(streamId: host.liveStreamId!));
    } else {
      context.router.push(ProfileDetailPlaceholderRoute(userId: host.id));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// H4 — HostCard grid (2-column, aspect 3:4, edge-to-edge photo)
// ─────────────────────────────────────────────────────────────────────────────

class _HostGrid extends StatelessWidget {
  const _HostGrid({required this.hosts, required this.onTapHost});
  final List<HomeHost> hosts;
  final ValueChanged<HomeHost> onTapHost;

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 24),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 3 / 4,
      ),
      itemCount: hosts.length,
      itemBuilder: (_, i) {
        final h = hosts[i];
        return HostCard(host: h, onTap: () => onTapHost(h));
      },
    );
  }
}

class _FeedEmptyView extends StatelessWidget {
  const _FeedEmptyView();
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: const [
            Icon(Icons.people_alt_outlined,
                size: 48, color: DT.homeMutedInk),
            SizedBox(height: 10),
            Text(
              'No hosts here yet',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: DT.homeHeading,
              ),
            ),
            SizedBox(height: 4),
            Text(
              'Pull to refresh or switch country / tab.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: DT.homeMutedInk),
            ),
          ],
        ),
      ),
    );
  }
}

class _FeedErrorView extends StatelessWidget {
  const _FeedErrorView({required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.wifi_off_rounded,
                size: 48, color: DT.statusLive),
            const SizedBox(height: 10),
            const Text(
              'Failed to load feed',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: DT.homeHeading,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              message,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 11, color: DT.homeMutedInk),
            ),
            const SizedBox(height: 12),
            FilledButton.tonal(
              onPressed: onRetry,
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Header
// ─────────────────────────────────────────────────────────────────────────────

class _HomeHeader extends StatelessWidget {
  const _HomeHeader({
    required this.subTab,
    required this.onSubTab,
    required this.onSearchTap,
    required this.onTrophyTap,
    required this.countries,
    required this.selectedCountry,
    required this.onCountry,
  });

  final _SubTab subTab;
  final ValueChanged<_SubTab> onSubTab;
  final VoidCallback onSearchTap;
  final VoidCallback onTrophyTap;
  final List<HomeCountry> countries;
  final String selectedCountry;
  final ValueChanged<String> onCountry;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: const BoxDecoration(
        color: DT.homeHeaderCard,
        border: Border(bottom: BorderSide(color: DT.homeHeaderBorder)),
        boxShadow: [
          BoxShadow(
            color: Color(0x1F0F172A),
            blurRadius: 12,
            offset: Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 8, 8, 8),
            child: Row(
              children: [
                _CircleIconButton(
                  icon: Icons.search_rounded,
                  onTap: onSearchTap,
                  semantic: 'Search',
                ),
                const SizedBox(width: 8),
                Expanded(child: _SubTabBar(active: subTab, onChange: onSubTab)),
                const SizedBox(width: 8),
                _TrophyButton(onTap: onTrophyTap),
              ],
            ),
          ),
          _CountryStrip(
            countries: countries,
            selected: selectedCountry,
            onSelect: onCountry,
          ),
          const SizedBox(height: 8),
        ],
      ),
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({
    required this.icon,
    required this.onTap,
    required this.semantic,
  });
  final IconData icon;
  final VoidCallback onTap;
  final String semantic;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: semantic,
      child: Material(
        color: Colors.transparent,
        child: InkResponse(
          onTap: onTap,
          radius: 26,
          child: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
              color: DT.homeChipBg,
              shape: BoxShape.circle,
              border: Border.all(color: DT.homeChipBorder),
              boxShadow: const [
                BoxShadow(
                  color: Color(0x1F0F172A),
                  blurRadius: 10,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Icon(icon, size: 20, color: DT.homeHeading),
          ),
        ),
      ),
    );
  }
}

class _SubTabBar extends StatelessWidget {
  const _SubTabBar({required this.active, required this.onChange});
  final _SubTab active;
  final ValueChanged<_SubTab> onChange;

  static const _labels = <_SubTab, String>{
    _SubTab.popular: 'Popular',
    _SubTab.live: 'Live',
    _SubTab.newHosts: 'New',
    _SubTab.follow: 'Follow',
  };

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 34,
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        color: DT.subTabTrack,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: DT.subTabTrackBorder),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0F0F172A),
            blurRadius: 4,
            offset: Offset(0, 2),
            spreadRadius: -1,
          ),
        ],
      ),
      child: Row(
        children: _SubTab.values.map((tab) {
          final isActive = tab == active;
          return Expanded(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () {
                HapticFeedback.selectionClick();
                onChange(tab);
              },
              child: Container(
                margin: const EdgeInsets.symmetric(horizontal: 1),
                alignment: Alignment.center,
                decoration: isActive
                    ? BoxDecoration(
                        gradient: const LinearGradient(
                          colors: DT.subTabActive,
                          begin: Alignment.centerLeft,
                          end: Alignment.centerRight,
                        ),
                        borderRadius: BorderRadius.circular(999),
                        boxShadow: const [
                          BoxShadow(
                            color: Color(0x66EC4899),
                            blurRadius: 10,
                            offset: Offset(0, 4),
                            spreadRadius: -2,
                          ),
                        ],
                      )
                    : null,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (tab == _SubTab.live)
                      _PulsingDot(
                        color: isActive ? Colors.white : DT.statusLive,
                      ),
                    if (tab == _SubTab.live) const SizedBox(width: 4),
                    Text(
                      _labels[tab]!,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        letterSpacing: 0.2,
                        color: isActive ? Colors.white : DT.homeMutedInk,
                      ),
                    ),
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

class _PulsingDot extends StatefulWidget {
  const _PulsingDot({required this.color});
  final Color color;

  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween(begin: 0.45, end: 1.0).animate(_c),
      child: Container(
        width: 6,
        height: 6,
        decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
      ),
    );
  }
}

class _TrophyButton extends StatelessWidget {
  const _TrophyButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      label: 'Leaderboard',
      child: GestureDetector(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        child: Container(
          width: 42,
          height: 42,
          alignment: Alignment.center,
          decoration: const BoxDecoration(shape: BoxShape.circle),
          child: ShaderMask(
            shaderCallback: (rect) => const LinearGradient(
              colors: [
                Color(0xFFFDE68A),
                Color(0xFFF59E0B),
                Color(0xFFB45309),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ).createShader(rect),
            child: const Icon(
              Icons.emoji_events_rounded,
              size: 30,
              color: Colors.white,
            ),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Country strip
// ─────────────────────────────────────────────────────────────────────────────

class _CountryStrip extends StatelessWidget {
  const _CountryStrip({
    required this.countries,
    required this.selected,
    required this.onSelect,
  });
  final List<HomeCountry> countries;
  final String selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 32,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        itemCount: countries.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final c = countries[i];
          final isActive = c.code == selected;
          return GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: () {
              HapticFeedback.selectionClick();
              onSelect(c.code);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
              decoration: BoxDecoration(
                gradient: isActive
                    ? const LinearGradient(
                        colors: DT.countryChipActive,
                        begin: Alignment.centerLeft,
                        end: Alignment.centerRight,
                      )
                    : null,
                color: isActive ? null : DT.homeChipBg,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(
                  color: isActive
                      ? Colors.transparent
                      : DT.homeChipBorder,
                ),
                boxShadow: [
                  BoxShadow(
                    color: isActive
                        ? const Color(0x66EC4899)
                        : const Color(0x140F172A),
                    blurRadius: isActive ? 10 : 4,
                    offset: const Offset(0, 2),
                    spreadRadius: -1,
                  ),
                ],
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(c.flag, style: const TextStyle(fontSize: 14)),
                  const SizedBox(width: 4),
                  Text(
                    c.name,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: isActive ? Colors.white : DT.homeHeading,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
