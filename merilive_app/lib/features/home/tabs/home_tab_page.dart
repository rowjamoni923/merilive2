import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/design_tokens.dart';

/// Home tab — Step H1 scaffold.
///
/// Locked pieces:
///   • Sticky glass header (safe-area, shadow, border).
///   • Left: circular Search button → /search (Sector deferred → toast).
///   • Center: Popular / Live / New / Follow pill tab-bar (gradient active,
///     red pulsing dot on Live, matches web `Index.tsx` header exactly).
///   • Right: 3D trophy Leaderboard button → /leaderboard (deferred → toast).
///   • Country chip strip (horizontal scroll) — static seed only in H1.
///
/// Deferred to next H-steps:
///   H2 → dynamic country merge from `get_public_host_countries_v1`
///   H3 → real feed via `get_public_home_hosts_v2` + realtime
///   H4 → HostCard widget + tap routing matrix
///   H5 → DynamicBanner top/middle
///   H6 → Daily reward + event popup overlays
///   H7 → Floating random-match pill + pull-to-refresh
///   H8 → Empty state + polish + analytics
///
/// Honesty rule: any tap whose destination lands in a later sector shows a
/// real toast. No fake screens.
class HomeTabPage extends StatefulWidget {
  const HomeTabPage({super.key});

  @override
  State<HomeTabPage> createState() => _HomeTabPageState();
}

enum _SubTab { popular, live, newHosts, follow }

class _HomeTabPageState extends State<HomeTabPage>
    with AutomaticKeepAliveClientMixin {
  _SubTab _subTab = _SubTab.popular;
  String _selectedCountry = 'all';

  // H1 static seed — H2 will merge dynamic countries from RPC.
  static const List<_Country> _seedCountries = [
    _Country(code: 'all', name: 'All', flag: '🌍'),
    _Country(code: 'BD', name: 'Bangladesh', flag: '🇧🇩'),
    _Country(code: 'IN', name: 'India', flag: '🇮🇳'),
    _Country(code: 'PK', name: 'Pakistan', flag: '🇵🇰'),
    _Country(code: 'NP', name: 'Nepal', flag: '🇳🇵'),
    _Country(code: 'PH', name: 'Philippines', flag: '🇵🇭'),
    _Country(code: 'ID', name: 'Indonesia', flag: '🇮🇩'),
  ];

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
    return Container(
      color: DT.homeBg,
      child: SafeArea(
        bottom: false,
        child: Column(
          children: [
            _HomeHeader(
              subTab: _subTab,
              onSubTab: (t) => setState(() => _subTab = t),
              onSearchTap: () => _toast('Search — lands in a later sector'),
              onTrophyTap: () => _toast('Leaderboard — lands in a later sector'),
              countries: _seedCountries,
              selectedCountry: _selectedCountry,
              onCountry: (c) => setState(() => _selectedCountry = c),
            ),
            Expanded(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      Icon(Icons.dynamic_feed_rounded,
                          size: 48, color: DT.homeMutedInk),
                      SizedBox(height: 10),
                      Text(
                        'Feed lands in Step H3',
                        style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: DT.homeHeading,
                        ),
                      ),
                      SizedBox(height: 4),
                      Text(
                        'Header, sub-tabs and country strip are wired.',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            fontSize: 12, color: DT.homeMutedInk),
                      ),
                    ],
                  ),
                ),
              ),
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
  final List<_Country> countries;
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

class _Country {
  final String code;
  final String name;
  final String flag;
  const _Country({required this.code, required this.name, required this.flag});
}

class _CountryStrip extends StatelessWidget {
  const _CountryStrip({
    required this.countries,
    required this.selected,
    required this.onSelect,
  });
  final List<_Country> countries;
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
