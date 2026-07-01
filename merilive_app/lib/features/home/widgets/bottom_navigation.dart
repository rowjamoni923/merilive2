import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/design_tokens.dart';

/// Pearl-cream glass bottom bar — pixel-parity with `BottomNavigation.tsx`.
class HomeBottomNavigation extends StatelessWidget {
  const HomeBottomNavigation({
    super.key,
    required this.currentIndex,
    required this.onTabSelected,
    required this.onCreatePressed,
  });

  final int currentIndex;
  final ValueChanged<int> onTabSelected;
  final VoidCallback onCreatePressed;

  static const _items = <_NavItem>[
    _NavItem(Icons.home_rounded, 'Home', DT.tabHome),
    _NavItem(Icons.groups_2_rounded, 'Party', DT.tabParty),
    _NavItem(Icons.play_circle_fill_rounded, 'Reels', DT.tabReels),
    _NavItem(Icons.person_rounded, 'Me', DT.tabProfile),
  ];

  @override
  Widget build(BuildContext context) {
    final bottomInset = MediaQuery.of(context).padding.bottom;
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [DT.navCreamTop, DT.navCreamBottom],
        ),
        border: Border(top: BorderSide(color: Color(0x2EC9A84C))), // 0.18 alpha
        boxShadow: [
          BoxShadow(
            color: Color(0x2E785014),
            blurRadius: 28,
            offset: Offset(0, -10),
          ),
        ],
      ),
      padding: EdgeInsets.only(bottom: bottomInset),
      child: SizedBox(
        height: 64,
        child: Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            // Champagne sheen line
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              child: Container(
                height: 1,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    colors: [
                      Color(0x00C9A84C),
                      Color(0x73C9A84C),
                      Color(0x00C9A84C),
                    ],
                  ),
                ),
              ),
            ),
            Row(
              children: [
                Expanded(child: _tab(0)),
                Expanded(child: _tab(1)),
                const SizedBox(width: 64), // slot for center FAB
                Expanded(child: _tab(2)),
                Expanded(child: _tab(3)),
              ],
            ),
            Positioned(
              top: -22,
              child: _CenterFab(onPressed: () {
                HapticFeedback.mediumImpact();
                onCreatePressed();
              }),
            ),
          ],
        ),
      ),
    );
  }

  Widget _tab(int i) {
    final item = _items[i];
    final active = i == currentIndex;
    return _TabButton(
      icon: item.icon,
      label: item.label,
      gradient: item.gradient,
      active: active,
      onTap: () {
        HapticFeedback.selectionClick();
        onTabSelected(i);
      },
    );
  }
}

class _NavItem {
  final IconData icon;
  final String label;
  final List<Color> gradient;
  const _NavItem(this.icon, this.label, this.gradient);
}

class _TabButton extends StatelessWidget {
  const _TabButton({
    required this.icon,
    required this.label,
    required this.gradient,
    required this.active,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final List<Color> gradient;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      onTap: onTap,
      splashFactory: NoSplash.splashFactory,
      highlightColor: Colors.transparent,
      radius: 40,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 10),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: active
              ? const LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xF2FFF0FA), Color(0xD9FDE4F3)],
                )
              : null,
          border: active
              ? Border.all(color: gradient.first.withOpacity(0.18), width: 1)
              : null,
          boxShadow: active
              ? [
                  BoxShadow(
                    color: gradient.first.withOpacity(0.30),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ShaderMask(
              blendMode: BlendMode.srcIn,
              shaderCallback: (r) => active
                  ? LinearGradient(colors: gradient).createShader(r)
                  : const LinearGradient(
                      colors: [DT.navInkMuted, DT.navInkMuted],
                    ).createShader(r),
              child: Icon(
                icon,
                size: 22,
                color: Colors.white,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              label,
              style: TextStyle(
                fontSize: 10,
                fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                color: active ? gradient.first : DT.navInkMuted,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CenterFab extends StatelessWidget {
  const _CenterFab({required this.onPressed});
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 58,
        height: 58,
        decoration: const BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(
            center: Alignment(-0.4, -0.5),
            radius: 0.9,
            colors: DT.createFabRadial,
            stops: [0.0, 0.35, 0.7, 1.0],
          ),
          boxShadow: [
            BoxShadow(
              color: Color(0x8CA855F7),
              blurRadius: 26,
              offset: Offset(0, 10),
            ),
            BoxShadow(
              color: Color(0x59EC4899),
              blurRadius: 10,
              offset: Offset(0, 4),
            ),
            BoxShadow(color: Color(0xFFFFFDF8), blurRadius: 0, spreadRadius: 5),
            BoxShadow(color: Color(0x66C9A84C), blurRadius: 0, spreadRadius: 6),
          ],
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Top gloss highlight
            Positioned(
              top: 4,
              left: 6,
              right: 6,
              child: Container(
                height: 22,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.white.withOpacity(0.55),
                      Colors.white.withOpacity(0.0),
                    ],
                  ),
                ),
              ),
            ),
            const Icon(Icons.add_rounded, color: Colors.white, size: 28),
          ],
        ),
      ),
    );
  }
}
