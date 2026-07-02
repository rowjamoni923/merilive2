import 'package:flutter/material.dart';

/// Phase A P0 #2 — Host picker sheet mirroring web `SeatInvitePickerSheet`.
///
/// Presents the list of currently empty (non-locked) seats and returns the
/// chosen seat number; the caller then writes into `seat_invitations`.
class SeatInvitePickerSheet extends StatelessWidget {
  const SeatInvitePickerSheet({
    super.key,
    required this.inviteeName,
    required this.emptySeats,
  });

  final String inviteeName;
  final List<int> emptySeats;

  static Future<int?> show(
    BuildContext context, {
    required String inviteeName,
    required List<int> emptySeats,
  }) {
    return showModalBottomSheet<int>(
      context: context,
      backgroundColor: const Color(0xFF1F1B36),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => SeatInvitePickerSheet(
        inviteeName: inviteeName,
        emptySeats: emptySeats,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 14, 18, 18),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.chair_alt_rounded,
                    size: 20, color: Color(0xFFF59E0B)),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Invite $inviteeName to a seat',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            if (emptySeats.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: Text(
                    'All seats are taken right now.',
                    style: TextStyle(color: Colors.white54, fontSize: 13),
                  ),
                ),
              )
            else
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: [
                  for (final n in emptySeats)
                    InkWell(
                      onTap: () => Navigator.of(context).pop(n),
                      borderRadius: BorderRadius.circular(12),
                      child: Container(
                        width: 62,
                        height: 62,
                        decoration: BoxDecoration(
                          color: const Color(0x336D28D9),
                          border: Border.all(
                              color: const Color(0xFFA855F7), width: 1.2),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Center(
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.chair_alt_rounded,
                                  color: Color(0xFFE9D5FF), size: 22),
                              const SizedBox(height: 2),
                              Text(
                                'Seat $n',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            const SizedBox(height: 6),
          ],
        ),
      ),
    );
  }
}
