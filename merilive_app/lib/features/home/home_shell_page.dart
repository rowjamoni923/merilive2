import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

import '../../core/theme/design_tokens.dart';
import 'tabs/home_tab_page.dart';
import 'tabs/party_tab_page.dart';
import 'tabs/profile_tab_page.dart';
import 'tabs/reels_tab_page.dart';
import 'widgets/bottom_navigation.dart';
import 'widgets/create_action_sheet.dart';

/// Home shell — 4 tabs + center "Create" FAB (Go Live / Party / Random Call).
///
/// Parity with `BottomNavigation.tsx`. Uses an `IndexedStack` so each tab
/// keeps its scroll position and BLoC state when the user switches — same
/// behavior as web's `TabKeepAliveHost`. Tab content itself is scaffolded in
/// this step; feed / party list / reels / profile bodies fill in Steps H-K.
@RoutePage()
class HomeShellPage extends StatefulWidget {
  const HomeShellPage({super.key});

  @override
  State<HomeShellPage> createState() => _HomeShellPageState();
}

class _HomeShellPageState extends State<HomeShellPage> {
  int _index = 0;

  static const _tabs = <Widget>[
    HomeTabPage(),
    PartyTabPage(),
    ReelsTabPage(),
    ProfileTabPage(),
  ];

  void _openCreateSheet() {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withOpacity(0.35),
      isScrollControlled: true,
      builder: (_) => const CreateActionSheet(),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFFFFDF8),
      extendBody: true,
      body: IndexedStack(index: _index, children: _tabs),
      bottomNavigationBar: HomeBottomNavigation(
        currentIndex: _index,
        onTabSelected: (i) => setState(() => _index = i),
        onCreatePressed: _openCreateSheet,
      ),
    );
  }
}
