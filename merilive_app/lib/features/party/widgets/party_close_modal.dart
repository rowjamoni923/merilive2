import 'package:flutter/material.dart';

/// G16 — Chamet-style close modal.
///
/// Host sees "End room" (destroys the room for everyone) or "Minimize"
/// (leave silently). Guests get a single "Leave" confirmation.
enum PartyCloseChoice { end, leave, cancel }

Future<PartyCloseChoice> showPartyCloseModal(
  BuildContext context, {
  required bool isHost,
}) async {
  final res = await showModalBottomSheet<PartyCloseChoice>(
    context: context,
    backgroundColor: const Color(0xFF1F1B36),
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
    ),
    builder: (ctx) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 10),
          Container(
            width: 40, height: 4,
            decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2)),
          ),
          const SizedBox(height: 12),
          if (isHost) ...[
            ListTile(
              leading: const Icon(Icons.stop_circle_rounded,
                  color: Colors.redAccent),
              title: const Text('End room for everyone',
                  style: TextStyle(color: Colors.redAccent)),
              subtitle: const Text(
                  'All guests will be disconnected and the room will close.',
                  style: TextStyle(color: Colors.white38, fontSize: 11)),
              onTap: () => Navigator.of(ctx).pop(PartyCloseChoice.end),
            ),
            ListTile(
              leading: const Icon(Icons.exit_to_app_rounded,
                  color: Colors.white70),
              title: const Text('Leave (keep room open)',
                  style: TextStyle(color: Colors.white)),
              subtitle: const Text('Guests keep chatting without you.',
                  style: TextStyle(color: Colors.white38, fontSize: 11)),
              onTap: () => Navigator.of(ctx).pop(PartyCloseChoice.leave),
            ),
          ] else
            ListTile(
              leading:
                  const Icon(Icons.exit_to_app_rounded, color: Colors.white70),
              title: const Text('Leave room',
                  style: TextStyle(color: Colors.white)),
              onTap: () => Navigator.of(ctx).pop(PartyCloseChoice.leave),
            ),
          ListTile(
            leading: const Icon(Icons.close_rounded, color: Colors.white54),
            title: const Text('Cancel',
                style: TextStyle(color: Colors.white54)),
            onTap: () => Navigator.of(ctx).pop(PartyCloseChoice.cancel),
          ),
          const SizedBox(height: 6),
        ],
      ),
    ),
  );
  return res ?? PartyCloseChoice.cancel;
}
