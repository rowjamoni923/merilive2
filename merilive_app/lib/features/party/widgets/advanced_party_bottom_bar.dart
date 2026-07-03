import 'package:flutter/material.dart';

import 'party_room_bottom_bar.dart';

/// G27 — Advanced party bottom-bar variant.
///
/// Mirrors the web `AdvancedPartyBottomBar` layout: two rows — a top pill
/// row for host quick-actions (mute-all, kick, lock) and the standard
/// [PartyRoomBottomBar] underneath. Consumers pass the pill row + the
/// core action buttons.
class AdvancedPartyBottomBar extends StatelessWidget {
  const AdvancedPartyBottomBar({
    super.key,
    required this.pillRow,
    required this.actions,
    this.leading,
  });

  final Widget pillRow;
  final List<Widget> actions;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          color: Colors.black.withValues(alpha: 0.25),
          child: pillRow,
        ),
        PartyRoomBottomBar(
          actions: actions,
          leading: leading,
        ),
      ],
    );
  }
}
