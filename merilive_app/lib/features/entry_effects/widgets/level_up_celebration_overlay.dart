import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../data/level_up_bridge.dart';

/// M9 — In-room celebration when the signed-in user's `user_level`
/// strictly increases. Renders a full-width confetti burst + a
/// centered "Level Up! Lv N" chip for ~3.2s.
///
/// Drop this widget anywhere inside a room screen (Live, Party,
/// Active Call). It self-attaches to [LevelUpBridge] and shows the
/// overlay on top of its (typically transparent) parent.
class LevelUpCelebrationOverlay extends StatefulWidget {
  const LevelUpCelebrationOverlay({super.key});

  @override
  State<LevelUpCelebrationOverlay> createState() =>
      _LevelUpCelebrationOverlayState();
}

class _LevelUpCelebrationOverlayState extends State<LevelUpCelebrationOverlay>
    with SingleTickerProviderStateMixin {
  StreamSubscription<LevelUpEvent>? _sub;
  late final AnimationController _ctrl;
  LevelUpEvent? _active;
  final _rng = math.Random();
  late List<_Confetti> _pieces;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3200),
    );
    _pieces = _spawn();
    LevelUpBridge.instance.attach();
    _sub = LevelUpBridge.instance.events$.listen(_onLevelUp);
  }

  List<_Confetti> _spawn() => List.generate(
        60,
        (_) => _Confetti(
          x: _rng.nextDouble(),
          delay: _rng.nextDouble() * 0.3,
          duration: 0.6 + _rng.nextDouble() * 0.4,
          hue: _rng.nextDouble(),
          size: 6 + _rng.nextDouble() * 8,
          spin: (_rng.nextDouble() - 0.5) * 8,
        ),
      );

  void _onLevelUp(LevelUpEvent e) {
    if (!mounted) return;
    setState(() {
      _active = e;
      _pieces = _spawn();
    });
    _ctrl.forward(from: 0);
  }

  @override
  void dispose() {
    _sub?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (context, _) {
          if (_active == null || _ctrl.value == 0 || _ctrl.value == 1) {
            return const SizedBox.shrink();
          }
          return Stack(
            fit: StackFit.expand,
            children: [
              CustomPaint(
                painter: _ConfettiPainter(_pieces, _ctrl.value),
              ),
              Center(
                child: Opacity(
                  opacity: (1.0 - (_ctrl.value - 0.5).abs() * 2).clamp(0.0, 1.0),
                  child: Transform.scale(
                    scale: 0.9 + 0.2 * math.sin(_ctrl.value * math.pi),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 22, vertical: 12),
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [Color(0xFFFFC542), Color(0xFFFF7A45)],
                        ),
                        borderRadius: BorderRadius.circular(999),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.orange.withOpacity(0.5),
                            blurRadius: 24,
                            spreadRadius: 2,
                          ),
                        ],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.auto_awesome,
                              color: Colors.white, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            'Level Up!  Lv ${_active!.newLevel}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 16,
                              letterSpacing: 0.3,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Confetti {
  _Confetti({
    required this.x,
    required this.delay,
    required this.duration,
    required this.hue,
    required this.size,
    required this.spin,
  });
  final double x;
  final double delay;
  final double duration;
  final double hue;
  final double size;
  final double spin;
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter(this.pieces, this.t);
  final List<_Confetti> pieces;
  final double t;

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in pieces) {
      final local = ((t - p.delay) / p.duration).clamp(0.0, 1.0);
      if (local <= 0 || local >= 1) continue;
      final dx = size.width * p.x;
      final dy = -20 + (size.height * 0.7) * local;
      final paint = Paint()
        ..color = HSVColor.fromAHSV(
                (1 - local).clamp(0.0, 1.0), p.hue * 360, 0.85, 1.0)
            .toColor();
      canvas.save();
      canvas.translate(dx, dy);
      canvas.rotate(p.spin * local);
      canvas.drawRect(
        Rect.fromCenter(center: Offset.zero, width: p.size, height: p.size * 0.5),
        paint,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _ConfettiPainter old) => old.t != t;
}
