import 'package:flutter/material.dart';

/// Flutter port of `PKBattleResult.tsx` — post-battle result modal. Shows
/// winner banner, 70/30 Diamond split, MVP contributor. Auto-dismiss after 6s.
class PKBattleResultData {
  final String hostName;
  final String? hostAvatarUrl;
  final int hostScore;
  final String opponentName;
  final String? opponentAvatarUrl;
  final int opponentScore;
  final int winnerDiamonds; // 70%
  final int loserDiamonds; // 30%
  final String? mvpName;
  final String? mvpAvatarUrl;
  final int? mvpContribution;

  const PKBattleResultData({
    required this.hostName,
    required this.opponentName,
    required this.hostScore,
    required this.opponentScore,
    required this.winnerDiamonds,
    required this.loserDiamonds,
    this.hostAvatarUrl,
    this.opponentAvatarUrl,
    this.mvpName,
    this.mvpAvatarUrl,
    this.mvpContribution,
  });

  bool get hostWon => hostScore > opponentScore;
  bool get draw => hostScore == opponentScore;
}

class PKBattleResult extends StatefulWidget {
  final PKBattleResultData data;
  final VoidCallback onClose;
  final int autoCloseSeconds;
  const PKBattleResult({
    super.key,
    required this.data,
    required this.onClose,
    this.autoCloseSeconds = 6,
  });

  static Future<void> show(BuildContext context, PKBattleResultData data,
      {int autoCloseSeconds = 6}) {
    return showDialog(
      context: context,
      barrierDismissible: false,
      builder: (_) => PKBattleResult(
        data: data,
        onClose: () => Navigator.of(context).pop(),
        autoCloseSeconds: autoCloseSeconds,
      ),
    );
  }

  @override
  State<PKBattleResult> createState() => _PKBattleResultState();
}

class _PKBattleResultState extends State<PKBattleResult> {
  @override
  void initState() {
    super.initState();
    Future.delayed(Duration(seconds: widget.autoCloseSeconds), () {
      if (mounted) widget.onClose();
    });
  }

  @override
  Widget build(BuildContext context) {
    final d = widget.data;
    final title = d.draw
        ? 'DRAW'
        : (d.hostWon ? 'YOU WIN!' : '${d.opponentName} WINS');
    final titleGrad = d.draw
        ? const [Color(0xFF94A3B8), Color(0xFF64748B)]
        : (d.hostWon
            ? const [Color(0xFFF59E0B), Color(0xFFEF4444)]
            : const [Color(0xFF3B82F6), Color(0xFF06B6D4)]);
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 20),
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
            ShaderMask(
              shaderCallback: (r) =>
                  LinearGradient(colors: titleGrad).createShader(r),
              child: Text(title,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 28,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1.5)),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                    child: _side(d.hostName, d.hostAvatarUrl, d.hostScore,
                        d.hostWon, const Color(0xFFEC4899))),
                const SizedBox(width: 8),
                const Text('VS',
                    style: TextStyle(
                        color: Colors.white54,
                        fontSize: 16,
                        fontWeight: FontWeight.w900)),
                const SizedBox(width: 8),
                Expanded(
                    child: _side(d.opponentName, d.opponentAvatarUrl,
                        d.opponentScore, !d.hostWon && !d.draw,
                        const Color(0xFF3B82F6))),
              ],
            ),
            const SizedBox(height: 20),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Winner reward',
                          style: TextStyle(color: Colors.white70)),
                      Row(children: [
                        const Icon(Icons.monetization_on,
                            color: Color(0xFFFDE68A), size: 14),
                        const SizedBox(width: 4),
                        Text('${d.winnerDiamonds}',
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800)),
                      ]),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Loser share',
                          style: TextStyle(color: Colors.white70)),
                      Row(children: [
                        const Icon(Icons.monetization_on,
                            color: Color(0xFFFDE68A), size: 14),
                        const SizedBox(width: 4),
                        Text('${d.loserDiamonds}',
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800)),
                      ]),
                    ],
                  ),
                ],
              ),
            ),
            if (d.mvpName != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  gradient: const LinearGradient(colors: [
                    Color(0xFFF59E0B),
                    Color(0xFFEF4444),
                  ]),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('MVP  ',
                        style: TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 1)),
                    CircleAvatar(
                        radius: 10,
                        backgroundColor: Colors.white24,
                        backgroundImage: (d.mvpAvatarUrl != null &&
                                d.mvpAvatarUrl!.isNotEmpty)
                            ? NetworkImage(d.mvpAvatarUrl!)
                            : null),
                    const SizedBox(width: 6),
                    Text(d.mvpName!,
                        style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize: 12)),
                    if (d.mvpContribution != null) ...[
                      const SizedBox(width: 6),
                      Text('${d.mvpContribution} Diamonds',
                          style: const TextStyle(
                              color: Color(0xFFFEF9C3), fontSize: 11)),
                    ],
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: widget.onClose,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFEC4899),
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: const Text('Continue',
                    style: TextStyle(fontWeight: FontWeight.w800)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _side(String name, String? url, int score, bool winner, Color ring) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(3),
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(
                color: winner ? const Color(0xFFF59E0B) : ring, width: 2.5),
          ),
          child: CircleAvatar(
            radius: 30,
            backgroundColor: const Color(0xFF1E293B),
            backgroundImage:
                (url != null && url.isNotEmpty) ? NetworkImage(url) : null,
            child: (url == null || url.isEmpty)
                ? Text(
                    name.isNotEmpty ? name.substring(0, 1).toUpperCase() : '?',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.w800),
                  )
                : null,
          ),
        ),
        const SizedBox(height: 6),
        Text(name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.w800, fontSize: 12)),
        const SizedBox(height: 2),
        Text('$score',
            style: TextStyle(
                color: winner ? const Color(0xFFF59E0B) : Colors.white70,
                fontSize: 16,
                fontWeight: FontWeight.w900)),
      ],
    );
  }
}
