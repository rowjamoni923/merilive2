import 'package:flutter/material.dart';

/// Flutter port of `PKBattleActive.tsx` — top-of-stream HUD during an active
/// PK battle. Shows both host avatars, live score tug-of-war bar, and
/// countdown timer. Server-authoritative state — this widget is presentation
/// only; upstream controller pushes score updates.
class PKBattleActiveState {
  final String hostName;
  final String? hostAvatarUrl;
  final int hostScore;
  final String opponentName;
  final String? opponentAvatarUrl;
  final int opponentScore;
  final int remainingSeconds; // server-driven
  final bool punishmentPhase; // if true, use punishment overlay

  const PKBattleActiveState({
    required this.hostName,
    required this.opponentName,
    this.hostAvatarUrl,
    this.opponentAvatarUrl,
    this.hostScore = 0,
    this.opponentScore = 0,
    this.remainingSeconds = 300,
    this.punishmentPhase = false,
  });
}

class PKBattleActive extends StatelessWidget {
  final PKBattleActiveState state;
  final VoidCallback? onTapHost;
  final VoidCallback? onTapOpponent;
  const PKBattleActive({
    super.key,
    required this.state,
    this.onTapHost,
    this.onTapOpponent,
  });

  String _fmt(int s) {
    final m = (s ~/ 60).toString().padLeft(2, '0');
    final r = (s % 60).toString().padLeft(2, '0');
    return '$m:$r';
  }

  @override
  Widget build(BuildContext context) {
    final total = state.hostScore + state.opponentScore;
    final hostPct = total == 0 ? 0.5 : state.hostScore / total;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.45),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: onTapHost,
                child: _avatar(state.hostAvatarUrl, state.hostName,
                    const Color(0xFFEC4899)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        _score(state.hostScore, const Color(0xFFEC4899)),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: state.punishmentPhase
                                ? const Color(0xFFEF4444)
                                : Colors.white.withOpacity(0.08),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                              state.punishmentPhase
                                  ? 'PUNISH ${_fmt(state.remainingSeconds)}'
                                  : _fmt(state.remainingSeconds),
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800)),
                        ),
                        _score(state.opponentScore, const Color(0xFF3B82F6)),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: SizedBox(
                        height: 8,
                        child: Row(
                          children: [
                            Expanded(
                              flex: (hostPct * 1000).round().clamp(1, 999),
                              child: Container(
                                decoration: const BoxDecoration(
                                  gradient: LinearGradient(colors: [
                                    Color(0xFFEC4899),
                                    Color(0xFFF59E0B),
                                  ]),
                                ),
                              ),
                            ),
                            Expanded(
                              flex: ((1 - hostPct) * 1000).round().clamp(1, 999),
                              child: Container(
                                decoration: const BoxDecoration(
                                  gradient: LinearGradient(colors: [
                                    Color(0xFF3B82F6),
                                    Color(0xFF06B6D4),
                                  ]),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: onTapOpponent,
                child: _avatar(state.opponentAvatarUrl, state.opponentName,
                    const Color(0xFF3B82F6)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _avatar(String? url, String name, Color ring) {
    return Container(
      padding: const EdgeInsets.all(2),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: ring, width: 2),
      ),
      child: CircleAvatar(
        radius: 18,
        backgroundColor: const Color(0xFF1E293B),
        backgroundImage:
            (url != null && url.isNotEmpty) ? NetworkImage(url) : null,
        child: (url == null || url.isEmpty)
            ? Text(
                name.isNotEmpty ? name.substring(0, 1).toUpperCase() : '?',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight: FontWeight.w800),
              )
            : null,
      ),
    );
  }

  Widget _score(int v, Color color) {
    return Text('$v',
        style: TextStyle(
            color: color, fontSize: 12, fontWeight: FontWeight.w800));
  }
}
