import 'package:flutter/material.dart';

/// Phase A P0 #4 — Empty-seat host actions sheet.
///
/// Mirrors web `EmptySeatHostActionsSheet`:
///   • Move here (host jumps to this seat).
///   • Lock / Unlock (calls `set_seat_lock` RPC via cubit).
///   • Invite viewer (opens the seat invite picker against a viewer list).
class EmptySeatHostActionsSheet extends StatelessWidget {
  const EmptySeatHostActionsSheet({
    super.key,
    required this.seatNumber,
    required this.isLocked,
    required this.onMoveHere,
    required this.onToggleLock,
    required this.onInvite,
  });

  final int seatNumber;
  final bool isLocked;
  final VoidCallback onMoveHere;
  final VoidCallback onToggleLock;
  final VoidCallback onInvite;

  static Future<void> show(
    BuildContext context, {
    required int seatNumber,
    required bool isLocked,
    required VoidCallback onMoveHere,
    required VoidCallback onToggleLock,
    required VoidCallback onInvite,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xFF1F1B36),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => EmptySeatHostActionsSheet(
        seatNumber: seatNumber,
        isLocked: isLocked,
        onMoveHere: onMoveHere,
        onToggleLock: onToggleLock,
        onInvite: onInvite,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(6, 8, 6, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: Row(
                children: [
                  const Icon(Icons.chair_alt_rounded,
                      color: Color(0xFFE9D5FF), size: 20),
                  const SizedBox(width: 8),
                  Text('Seat $seatNumber',
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 15,
                          fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            if (!isLocked)
              _tile(
                icon: Icons.swap_vert_rounded,
                color: const Color(0xFFA855F7),
                title: 'Move here',
                subtitle: 'Take this seat yourself',
                onTap: () {
                  Navigator.pop(context);
                  onMoveHere();
                },
              ),
            _tile(
              icon: Icons.person_add_rounded,
              color: const Color(0xFF10B981),
              title: 'Invite viewer',
              subtitle: 'Pick a viewer to fill this seat',
              onTap: () {
                Navigator.pop(context);
                onInvite();
              },
            ),
            _tile(
              icon: isLocked ? Icons.lock_open_rounded : Icons.lock_rounded,
              color: const Color(0xFFF59E0B),
              title: isLocked ? 'Unlock seat' : 'Lock seat',
              subtitle: isLocked
                  ? 'Anyone can request this seat again'
                  : 'No one can request or take this seat',
              onTap: () {
                Navigator.pop(context);
                onToggleLock();
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _tile({
    required IconData icon,
    required Color color,
    required String title,
    required String subtitle,
    required VoidCallback onTap,
  }) =>
      ListTile(
        leading: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.18),
            shape: BoxShape.circle,
            border: Border.all(color: color, width: 1),
          ),
          child: Icon(icon, color: color, size: 18),
        ),
        title: Text(title,
            style: const TextStyle(
                color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
        subtitle: Text(subtitle,
            style: const TextStyle(color: Colors.white54, fontSize: 11)),
        onTap: onTap,
      );
}
