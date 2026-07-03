import 'package:flutter/material.dart';

/// G28 — Standalone `PartyRoomBottomBar` component.
///
/// Web has a dedicated `PartyRoomBottomBar.tsx` split from the room page.
/// The Flutter room page currently uses a private `_BottomBar` for tight
/// state coupling; this public wrapper allows other party surfaces
/// (preview sheets, mini-player) to embed the same visual bar without
/// duplicating the circle-button styling.
class PartyRoomBottomBar extends StatelessWidget {
  const PartyRoomBottomBar({
    super.key,
    required this.actions,
    this.leading,
    this.background,
  });

  final List<Widget> actions;
  final Widget? leading;
  final Color? background;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        left: 10,
        right: 10,
        top: 6,
        bottom: 6 + MediaQuery.of(context).viewInsets.bottom,
      ),
      color: background ?? Colors.black.withValues(alpha: 0.35),
      child: Row(
        children: [
          if (leading != null) leading!,
          const Spacer(),
          for (final a in actions)
            Padding(
              padding: const EdgeInsets.only(left: 4),
              child: a,
            ),
        ],
      ),
    );
  }
}

/// Small circular action button used by [PartyRoomBottomBar].
class PartyBottomBarButton extends StatelessWidget {
  const PartyBottomBarButton({
    super.key,
    required this.icon,
    required this.color,
    required this.onTap,
    this.size = 40,
  });

  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final double size;

  @override
  Widget build(BuildContext context) {
    return InkResponse(
      onTap: onTap,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.45),
          shape: BoxShape.circle,
          border: Border.all(color: color.withValues(alpha: 0.5)),
        ),
        child: Icon(icon, color: color, size: 22),
      ),
    );
  }
}
