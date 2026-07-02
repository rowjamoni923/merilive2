import 'dart:async';

import 'package:flutter/material.dart';

import '../data/party_seat_invitation_bridge.dart';

/// Phase A P0 #2 — Invitee-side response sheet.
///
/// Shown when a viewer receives a pending `seat_invitations` row. Offers
/// Accept / Decline with a countdown against `expires_at`.
class SeatInviteResponseSheet extends StatefulWidget {
  const SeatInviteResponseSheet({
    super.key,
    required this.invitation,
  });

  final PartySeatInvitation invitation;

  /// Returns `true` for accept, `false` for decline, `null` when dismissed
  /// (either via barrier tap or timeout — treat as decline).
  static Future<bool?> show(
    BuildContext context, {
    required PartySeatInvitation invitation,
  }) {
    return showModalBottomSheet<bool>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      backgroundColor: const Color(0xFF1F1B36),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
      ),
      builder: (_) => SeatInviteResponseSheet(invitation: invitation),
    );
  }

  @override
  State<SeatInviteResponseSheet> createState() =>
      _SeatInviteResponseSheetState();
}

class _SeatInviteResponseSheetState extends State<SeatInviteResponseSheet> {
  Timer? _ticker;
  Duration _remaining = const Duration(seconds: 30);

  @override
  void initState() {
    super.initState();
    final exp = widget.invitation.expiresAt;
    if (exp != null) {
      final diff = exp.difference(DateTime.now());
      if (diff.isNegative) {
        _remaining = Duration.zero;
      } else if (diff.inSeconds < 120) {
        _remaining = diff;
      }
    }
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      final next = _remaining - const Duration(seconds: 1);
      if (next.isNegative || next == Duration.zero) {
        _ticker?.cancel();
        setState(() => _remaining = Duration.zero);
        Navigator.of(context).maybePop(null);
        return;
      }
      setState(() => _remaining = next);
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inv = widget.invitation;
    final secs = _remaining.inSeconds;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 52,
              height: 52,
              decoration: const BoxDecoration(
                color: Color(0x33F59E0B),
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.pan_tool_alt_rounded,
                  color: Color(0xFFF59E0B), size: 26),
            ),
            const SizedBox(height: 14),
            Text(
              '${inv.inviterName} invited you',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Text(
              'Join seat ${inv.seatNumber} in this room',
              style: const TextStyle(color: Colors.white70, fontSize: 13),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 14),
            if (secs > 0)
              Text(
                'Auto-declines in ${secs}s',
                style: const TextStyle(color: Colors.white38, fontSize: 11),
              ),
            const SizedBox(height: 18),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => Navigator.of(context).pop(false),
                    style: OutlinedButton.styleFrom(
                      side: const BorderSide(color: Colors.white24),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Decline',
                        style: TextStyle(
                            color: Colors.white70,
                            fontSize: 14,
                            fontWeight: FontWeight.w600)),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFF59E0B),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                    child: const Text('Accept & Join',
                        style: TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w700)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
