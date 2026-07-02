import 'dart:async';

import 'package:flutter/material.dart';

import '../data/pk_battle_bridge.dart';

/// A6 — PK Battle overlay (Web parity: `PKBattleActive` + `PKPunishmentOverlay`).
///
/// Renders the split VS scoreboard + countdown timer at the top of the stream,
/// and a semi-transparent punishment mask over the losing side when the server
/// sets `punishment_end_ts`.
class PkBattleOverlay extends StatefulWidget {
  const PkBattleOverlay({
    super.key,
    required this.snapshot,
    required this.currentUserId,
    required this.currentStreamId,
    this.onEnded,
  });

  final PkBattleSnapshot snapshot;
  final String? currentUserId;
  final String currentStreamId;
  final VoidCallback? onEnded;

  @override
  State<PkBattleOverlay> createState() => _PkBattleOverlayState();
}

class _PkBattleOverlayState extends State<PkBattleOverlay> {
  Timer? _ticker;
  int _timeLeft = 0;
  int _punishLeft = 0;

  @override
  void initState() {
    super.initState();
    _recompute();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) => _recompute());
  }

  @override
  void didUpdateWidget(covariant PkBattleOverlay old) {
    super.didUpdateWidget(old);
    _recompute();
  }

  void _recompute() {
    final s = widget.snapshot;
    int battleLeft = 0;
    if (s.startedAt != null && !s.isEnded) {
      final end = s.startedAt!.add(Duration(seconds: s.durationSeconds));
      battleLeft = end.difference(DateTime.now()).inSeconds.clamp(0, s.durationSeconds).toInt();
    }
    int punLeft = 0;
    if (s.punishmentEndTs != null) {
      punLeft = s.punishmentEndTs!.difference(DateTime.now()).inSeconds.clamp(0, 300).toInt();
    }
    if (mounted && (battleLeft != _timeLeft || punLeft != _punishLeft)) {
      setState(() {
        _timeLeft = battleLeft;
        _punishLeft = punLeft;
      });
    }
    if (s.isEnded && punLeft == 0) {
      widget.onEnded?.call();
    }
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  String _fmt(int s) {
    final m = (s ~/ 60).toString().padLeft(2, '0');
    final r = (s % 60).toString().padLeft(2, '0');
    return '$m:$r';
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.snapshot;
    final total = (s.challengerScore + s.opponentScore).clamp(1, 1 << 31);
    final challengerRatio = s.challengerScore / total;
    final leading = s.challengerScore == s.opponentScore
        ? null
        : (s.challengerScore > s.opponentScore ? 'challenger' : 'opponent');

    // Punishment side (loser)
    String? loserSide;
    if (s.punishmentEndTs != null && s.winnerUserId != null) {
      if (s.winnerUserId == s.challengerId) loserSide = 'opponent';
      if (s.winnerUserId == s.opponentId) loserSide = 'challenger';
    }

    return Positioned.fill(
      child: IgnorePointer(
        ignoring: false,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 64, 12, 0),
                child: _ScoreBar(
                  challengerName: s.challengerName,
                  challengerAvatar: s.challengerAvatar,
                  challengerLevel: s.challengerLevel,
                  challengerScore: s.challengerScore,
                  opponentName: s.opponentName,
                  opponentAvatar: s.opponentAvatar,
                  opponentLevel: s.opponentLevel,
                  opponentScore: s.opponentScore,
                  challengerRatio: challengerRatio,
                  leading: leading,
                  timerText: s.isEnded
                      ? (s.finalStatus ?? 'ENDED').toUpperCase()
                      : _fmt(_timeLeft),
                  ended: s.isEnded,
                ),
              ),
            ),
            if (loserSide != null && _punishLeft > 0)
              Expanded(
                child: Row(
                  children: [
                    Expanded(
                      child: loserSide == 'challenger'
                          ? _PunishmentMask(secondsLeft: _punishLeft)
                          : const SizedBox.shrink(),
                    ),
                    Expanded(
                      child: loserSide == 'opponent'
                          ? _PunishmentMask(secondsLeft: _punishLeft)
                          : const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _ScoreBar extends StatelessWidget {
  const _ScoreBar({
    required this.challengerName,
    required this.challengerAvatar,
    required this.challengerLevel,
    required this.challengerScore,
    required this.opponentName,
    required this.opponentAvatar,
    required this.opponentLevel,
    required this.opponentScore,
    required this.challengerRatio,
    required this.leading,
    required this.timerText,
    required this.ended,
  });

  final String challengerName;
  final String challengerAvatar;
  final int challengerLevel;
  final int challengerScore;
  final String opponentName;
  final String opponentAvatar;
  final int opponentLevel;
  final int opponentScore;
  final double challengerRatio;
  final String? leading;
  final String timerText;
  final bool ended;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white.withOpacity(0.12)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.35),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Row(
            children: [
              _Side(
                name: challengerName,
                avatar: challengerAvatar,
                level: challengerLevel,
                score: challengerScore,
                color: const Color(0xFFEF4444),
                isWinning: leading == 'challenger',
                alignRight: false,
              ),
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: ended
                        ? [Colors.grey.shade600, Colors.grey.shade800]
                        : const [Color(0xFFF59E0B), Color(0xFFDC2626)],
                  ),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.timer, color: Colors.white, size: 12),
                    const SizedBox(width: 4),
                    Text(
                      timerText,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w800,
                        fontSize: 11,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              _Side(
                name: opponentName,
                avatar: opponentAvatar,
                level: opponentLevel,
                score: opponentScore,
                color: const Color(0xFF3B82F6),
                isWinning: leading == 'opponent',
                alignRight: true,
              ),
            ],
          ),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: SizedBox(
              height: 8,
              child: Row(
                children: [
                  Expanded(
                    flex: (challengerRatio * 1000).round().clamp(1, 999),
                    child: Container(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          colors: [Color(0xFFF87171), Color(0xFFDC2626)],
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    flex: ((1 - challengerRatio) * 1000).round().clamp(1, 999),
                    child: Container(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          colors: [Color(0xFF60A5FA), Color(0xFF2563EB)],
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Side extends StatelessWidget {
  const _Side({
    required this.name,
    required this.avatar,
    required this.level,
    required this.score,
    required this.color,
    required this.isWinning,
    required this.alignRight,
  });

  final String name;
  final String avatar;
  final int level;
  final int score;
  final Color color;
  final bool isWinning;
  final bool alignRight;

  @override
  Widget build(BuildContext context) {
    final avatarWidget = Container(
      width: 30,
      height: 30,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        border: Border.all(color: color, width: 2),
        boxShadow: isWinning
            ? [BoxShadow(color: color.withOpacity(0.6), blurRadius: 10)]
            : null,
      ),
      child: ClipOval(
        child: avatar.isEmpty
            ? Container(color: Colors.white24)
            : Image.network(
                avatar,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => Container(color: Colors.white24),
              ),
      ),
    );

    final texts = Column(
      crossAxisAlignment:
          alignRight ? CrossAxisAlignment.end : CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
            fontSize: 11,
          ),
        ),
        Text(
          '$score 💎',
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w800,
            fontSize: 12,
          ),
        ),
      ],
    );

    return Expanded(
      child: Row(
        mainAxisAlignment:
            alignRight ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: alignRight
            ? [Flexible(child: texts), const SizedBox(width: 6), avatarWidget]
            : [avatarWidget, const SizedBox(width: 6), Flexible(child: texts)],
      ),
    );
  }
}

class _PunishmentMask extends StatelessWidget {
  const _PunishmentMask({required this.secondsLeft});

  final int secondsLeft;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.black.withOpacity(0.55),
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.sentiment_very_dissatisfied,
              color: Colors.white, size: 42),
          const SizedBox(height: 8),
          const Text(
            'PUNISHMENT',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${secondsLeft}s',
            style: const TextStyle(
              color: Colors.amber,
              fontSize: 20,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}
