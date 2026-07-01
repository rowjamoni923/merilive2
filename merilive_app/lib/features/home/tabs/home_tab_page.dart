import 'package:flutter/material.dart';

import '../../../core/theme/design_tokens.dart';

/// Home tab — feed of live hosts + banners.
///
/// Step G scaffold only. The real feed (Supabase realtime, live cards, banners,
/// pull-to-refresh, native list) lands in Step H after research phase.
class HomeTabPage extends StatelessWidget {
  const HomeTabPage({super.key});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      bottom: false,
      child: Column(
        children: [
          const _HomeHeader(),
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: const [
                    Icon(Icons.stream_rounded,
                        size: 56, color: DT.champagne),
                    SizedBox(height: 12),
                    Text(
                      'Live host feed lands in Step H',
                      style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF334155),
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Bottom navigation and center Create are wired.',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 12, color: DT.navInkMuted),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HomeHeader extends StatelessWidget {
  const _HomeHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      child: Row(
        children: [
          Expanded(
            child: Container(
              height: 42,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: const Color(0x33C9A84C)),
                boxShadow: const [
                  BoxShadow(
                    color: Color(0x14000000),
                    blurRadius: 12,
                    offset: Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: const [
                  Icon(Icons.search_rounded,
                      size: 20, color: DT.navInkMuted),
                  SizedBox(width: 8),
                  Text(
                    'Search hosts, countries',
                    style: TextStyle(
                        fontSize: 13, color: DT.navInkMuted),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          _CircleAction(icon: Icons.public_rounded, onTap: () {}),
          const SizedBox(width: 8),
          _CircleAction(icon: Icons.notifications_none_rounded, onTap: () {}),
        ],
      ),
    );
  }
}

class _CircleAction extends StatelessWidget {
  const _CircleAction({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      onTap: onTap,
      radius: 22,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: const Color(0x33C9A84C)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x14000000),
              blurRadius: 10,
              offset: Offset(0, 3),
            ),
          ],
        ),
        child: Icon(icon, size: 20, color: const Color(0xFF334155)),
      ),
    );
  }
}
