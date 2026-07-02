import 'dart:async';

import 'package:flutter/material.dart';

/// Phase F-23 — PK Punishment Overlay (Flutter port of
/// `src/components/live/PKPunishmentOverlay.tsx`).
///
/// Renders a red-tinted skull banner + dim wash + warning stripes over
/// the LOSING host's video tile for the server-anchored `punishment_end_ts`
/// window. Server-authoritative: [punishmentEndTs] and [winnerUserId] come
/// from the shared PkBattleSnapshot stream; the widget just draws + ticks.
///
/// Guards mirrored from the web build:
///   * HARD_CAP  — 180 s absolute ceiling (server-bug / clock-skew safety).
///   * SEED_TIMEOUT — 12 s: if the row never delivers an end-ts, self-clear.
///   * Draws / forfeits → never shows (`finalStatus == 'draw'`).
class PkPunishmentOverlay extends StatefulWidget {
  const PkPunishmentOverlay({
    super.key,
    required this.battleId,
    required this.currentUserId,
    required this.winnerUserId,
    required this.finalStatus,
    required this.punishmentEndTs,
    required this.onComplete,
  });

  final String battleId;
  final String currentUserId;
  final String? winnerUserId;
  final String? finalStatus;
  final DateTime? punishmentEndTs;
  final VoidCallback onComplete;

  @override
  State<PkPunishmentOverlay> createState() => _PkPunishmentOverlayState();
}

class _PkPunishmentOverlayState extends State<PkPunishmentOverlay>
    with SingleTickerProviderStateMixin {
  static const _hardCap = Duration(minutes: 3);
  static const _seedTimeout = Duration(seconds: 12);

  Timer? _tick;
  Timer? _seedGuard;
  int _secsLeft = 0;
  DateTime? _clampedEnd;
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat(reverse: true);
    _applyEnd(widget.punishmentEndTs);
    _seedGuard = Timer(_seedTimeout, () {
      if (_clampedEnd == null) widget.onComplete();
    });
  }

  @override
  void didUpdateWidget(covariant PkPunishmentOverlay old) {
    super.didUpdateWidget(old);
    if (widget.punishmentEndTs != old.punishmentEndTs) {
      _applyEnd(widget.punishmentEndTs);
    }
  }

  void _applyEnd(DateTime? end) {
    _tick?.cancel();
    if (end == null) {
      setState(() {
        _clampedEnd = null;
        _secsLeft = 0;
      });
      return;
    }
    final ceiling = DateTime.now().add(_hardCap);
    final clamped = end.isAfter(ceiling) ? ceiling : end;
    _clampedEnd = clamped;
    _updateRemaining();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) => _updateRemaining());
  }

  void _updateRemaining() {
    final end = _clampedEnd;
    if (end == null) return;
    final ms = end.difference(DateTime.now()).inMilliseconds;
    final s = ms <= 0 ? 0 : (ms / 1000).ceil();
    if (mounted && s != _secsLeft) setState(() => _secsLeft = s);
    if (s <= 0) {
      _tick?.cancel();
      widget.onComplete();
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    _seedGuard?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final winner = widget.winnerUserId;
    final isLoser = winner != null &&
        winner.isNotEmpty &&
        winner != widget.currentUserId &&
        widget.finalStatus != 'draw';
    if (!isLoser || _secsLeft <= 0) return const SizedBox.shrink();

    return IgnorePointer(
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Dim wash + red radial gradient over loser tile.
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(0, -1),
                radius: 1.2,
                colors: [
                  const Color(0xFF7F1D1D).withOpacity(0.35),
                  Colors.black.withOpacity(0.55),
                  Colors.black.withOpacity(0.7),
                ],
                stops: const [0.0, 0.6, 1.0],
              ),
            ),
          ),
          // Diagonal warning stripes.
          Opacity(
            opacity: 0.25,
            child: CustomPaint(painter: _StripesPainter()),
          ),
          // Pulsing punishment badge, top-center.
          Align(
            alignment: const Alignment(0, -0.88),
            child: ScaleTransition(
              scale: Tween<double>(begin: 1.0, end: 1.04).animate(
                CurvedAnimation(parent: _pulse, curve: Curves.easeInOut),
              ),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(999),
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xE87F1D1D), Color(0xE84C0519)],
                  ),
                  border: Border.all(color: const Color(0xFFFCA5A5).withOpacity(0.55)),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFFEF4444).withOpacity(0.45),
                      blurRadius: 22,
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.warning_amber_rounded,
                        color: Color(0xFFFECACA), size: 16),
                    const SizedBox(width: 6),
                    const Text(
                      'PUNISHMENT',
                      style: TextStyle(
                        color: Color(0xFFFECDD3),
                        fontSize: 11,
                        fontWeight: FontWeight.w900,
                        letterSpacing: 2.4,
                      ),
                    ),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.35),
                        borderRadius: BorderRadius.circular(999),
                        border: Border.all(color: Colors.white.withOpacity(0.12)),
                      ),
                      child: Text(
                        _fmt(_secsLeft),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 13,
                          fontWeight: FontWeight.w900,
                          fontFeatures: [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    const Icon(Icons.sentiment_very_dissatisfied,
                        color: Color(0xFFFECACA), size: 16),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _fmt(int s) =>
      '${(s ~/ 60)}:${(s % 60).toString().padLeft(2, '0')}';
}

class _StripesPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..color = const Color(0xFFEF4444).withOpacity(0.45);
    const stripeW = 14.0;
    const gap = 22.0;
    final diag = size.width + size.height;
    for (double x = -diag; x < diag; x += stripeW + gap) {
      final path = Path()
        ..moveTo(x, 0)
        ..lineTo(x + stripeW, 0)
        ..lineTo(x + stripeW + size.height, size.height)
        ..lineTo(x + size.height, size.height)
        ..close();
      canvas.drawPath(path, paint);
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
