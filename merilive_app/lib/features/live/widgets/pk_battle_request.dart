import 'package:flutter/material.dart';

/// Flutter port of `PKBattleRequest.tsx` — invite modal shown when another
/// host sends a PK invite. 30s countdown, Accept / Decline.
class PKBattleRequest extends StatefulWidget {
  final String opponentName;
  final String? opponentAvatarUrl;
  final int opponentLevel;
  final int durationSeconds; // battle length (default 300)
  final int inviteTtlSeconds; // default 30
  final VoidCallback onAccept;
  final VoidCallback onDecline;

  const PKBattleRequest({
    super.key,
    required this.opponentName,
    required this.opponentLevel,
    required this.onAccept,
    required this.onDecline,
    this.opponentAvatarUrl,
    this.durationSeconds = 300,
    this.inviteTtlSeconds = 30,
  });

  static Future<void> show(
    BuildContext context, {
    required String opponentName,
    required int opponentLevel,
    String? opponentAvatarUrl,
    int durationSeconds = 300,
    int inviteTtlSeconds = 30,
    required VoidCallback onAccept,
    required VoidCallback onDecline,
  }) {
    return showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => PKBattleRequest(
        opponentName: opponentName,
        opponentAvatarUrl: opponentAvatarUrl,
        opponentLevel: opponentLevel,
        durationSeconds: durationSeconds,
        inviteTtlSeconds: inviteTtlSeconds,
        onAccept: onAccept,
        onDecline: onDecline,
      ),
    );
  }

  @override
  State<PKBattleRequest> createState() => _PKBattleRequestState();
}

class _PKBattleRequestState extends State<PKBattleRequest> {
  late int _left;

  @override
  void initState() {
    super.initState();
    _left = widget.inviteTtlSeconds;
    _tick();
  }

  void _tick() {
    Future.delayed(const Duration(seconds: 1), () {
      if (!mounted) return;
      if (_left <= 1) {
        Navigator.of(context).pop();
        widget.onDecline();
        return;
      }
      setState(() => _left--);
      _tick();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 24),
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF0F172A),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white.withOpacity(0.06)),
        ),
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 12, vertical: 4),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [
                  Color(0xFFEF4444),
                  Color(0xFFEC4899),
                ]),
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Text('PK BATTLE INVITE',
                  style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1)),
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(3),
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                gradient: LinearGradient(colors: [
                  Color(0xFFEF4444),
                  Color(0xFFF59E0B),
                ]),
              ),
              child: CircleAvatar(
                radius: 34,
                backgroundColor: const Color(0xFF1E293B),
                backgroundImage: (widget.opponentAvatarUrl != null &&
                        widget.opponentAvatarUrl!.isNotEmpty)
                    ? NetworkImage(widget.opponentAvatarUrl!)
                    : null,
                child: (widget.opponentAvatarUrl == null ||
                        widget.opponentAvatarUrl!.isEmpty)
                    ? Text(
                        widget.opponentName.isNotEmpty
                            ? widget.opponentName.substring(0, 1).toUpperCase()
                            : '?',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 22,
                            fontWeight: FontWeight.w800),
                      )
                    : null,
              ),
            ),
            const SizedBox(height: 10),
            Text(widget.opponentName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text('Lv ${widget.opponentLevel} · ${widget.durationSeconds ~/ 60} min battle',
                style: const TextStyle(
                    color: Colors.white54, fontSize: 12)),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: () {
                      Navigator.of(context).pop();
                      widget.onDecline();
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: BorderSide(color: Colors.white.withOpacity(0.2)),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                    child: const Text('Decline'),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.of(context).pop();
                      widget.onAccept();
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEF4444),
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text('Accept ($_left)'),
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
