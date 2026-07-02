// Bigo Duke/King/Marquis cinematic entrance — Flutter port of
// `src/components/live/CinematicEntranceOverlay.tsx`.
//
// Cadence (identical to web):
//   0.0s – 0.8s : cinematic sweep + darken
//   0.8s – 4.5s : text display + shine sweep
//   4.5s – 5.5s : fade out
//   5.5s        : onComplete()
//
// Callers queue high-tier VIP joins here; low-tier joins go to the stacking
// notifications widget instead (identical policy to web `LiveStream.tsx`).

import 'dart:math' as math;
import 'package:flutter/material.dart';

enum CinematicRank { king, duke, marquis }

CinematicRank cinematicRankFromCode(String? code) {
  switch ((code ?? '').toLowerCase()) {
    case 'king':
      return CinematicRank.king;
    case 'marquis':
      return CinematicRank.marquis;
    case 'duke':
    default:
      return CinematicRank.duke;
  }
}

class LiveCinematicEntranceOverlay extends StatefulWidget {
  const LiveCinematicEntranceOverlay({
    super.key,
    required this.displayName,
    this.avatarUrl,
    this.rank = CinematicRank.duke,
    required this.onComplete,
  });

  final String displayName;
  final String? avatarUrl;
  final CinematicRank rank;
  final VoidCallback onComplete;

  @override
  State<LiveCinematicEntranceOverlay> createState() =>
      _LiveCinematicEntranceOverlayState();
}

class _LiveCinematicEntranceOverlayState
    extends State<LiveCinematicEntranceOverlay>
    with TickerProviderStateMixin {
  late final AnimationController _sweep; // 0..800ms bg
  late final AnimationController _emblem; // 400ms delay spring
  late final AnimationController _pulse; // continuous glow pulse
  late final AnimationController _rotate; // dashed ring rotate
  late final AnimationController _shine; // text shine sweep (starts @1.5s)
  late final AnimationController _text; // text reveal @800ms
  late final AnimationController _exit; // fade out 4.5s..5.5s
  bool _completed = false;

  @override
  void initState() {
    super.initState();
    _sweep = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..forward();
    _emblem = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 3000),
    )..repeat(reverse: true);
    _rotate = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 10),
    )..repeat();
    _shine = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _text = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 600),
    );
    _exit = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    );

    Future.delayed(const Duration(milliseconds: 400), () {
      if (mounted) _emblem.forward();
    });
    Future.delayed(const Duration(milliseconds: 800), () {
      if (mounted) _text.forward();
    });
    Future.delayed(const Duration(milliseconds: 1500), () {
      if (mounted) _shine.repeat(period: const Duration(milliseconds: 3800));
    });
    Future.delayed(const Duration(milliseconds: 4500), () {
      if (mounted) _exit.forward();
    });
    Future.delayed(const Duration(milliseconds: 5500), () {
      if (!_completed && mounted) {
        _completed = true;
        widget.onComplete();
      }
    });
  }

  @override
  void dispose() {
    _sweep.dispose();
    _emblem.dispose();
    _pulse.dispose();
    _rotate.dispose();
    _shine.dispose();
    _text.dispose();
    _exit.dispose();
    super.dispose();
  }

  ({Color primary, List<Color> bgGradient, Color badgeStart, Color badgeEnd, String label, Color glow}) _theme() {
    switch (widget.rank) {
      case CinematicRank.king:
        return (
          primary: const Color(0xFFFBBF24),
          bgGradient: [
            const Color(0x99FBBF24),
            const Color(0x66F59E0B),
            Colors.transparent,
          ],
          badgeStart: const Color(0xFFB45309),
          badgeEnd: const Color(0xFFF59E0B),
          label: 'KING',
          glow: const Color(0xFFFBBF24),
        );
      case CinematicRank.marquis:
        return (
          primary: const Color(0xFFD8B4FE),
          bgGradient: [
            const Color(0x66A855F7),
            const Color(0x4D9333EA),
            Colors.transparent,
          ],
          badgeStart: const Color(0xFF7C3AED),
          badgeEnd: const Color(0xFFA855F7),
          label: 'MARQUIS',
          glow: const Color(0xFFC084FC),
        );
      case CinematicRank.duke:
        return (
          primary: const Color(0xFFFDE047),
          bgGradient: [
            const Color(0x66CA8A04),
            const Color(0x4DA16207),
            Colors.transparent,
          ],
          badgeStart: const Color(0xFFCA8A04),
          badgeEnd: const Color(0xFFF59E0B),
          label: 'DUKE',
          glow: const Color(0xFFFDE047),
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = _theme();

    return IgnorePointer(
      child: AnimatedBuilder(
        animation: Listenable.merge([_sweep, _emblem, _pulse, _rotate, _shine, _text, _exit]),
        builder: (context, _) {
          final exitOpacity = 1 - _exit.value;
          if (exitOpacity <= 0) return const SizedBox.shrink();

          final sweepP = Curves.easeOutCirc.transform(_sweep.value);
          final emblemP = Curves.easeOutBack.transform(_emblem.value);
          final textP = Curves.easeOut.transform(_text.value);
          final pulseP = _pulse.value;

          return Opacity(
            opacity: exitOpacity,
            child: Stack(
              fit: StackFit.expand,
              children: [
                // Background cinematic sweep
                Transform.scale(
                  scaleY: sweepP,
                  alignment: Alignment.center,
                  child: Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: t.bgGradient,
                      ),
                    ),
                  ),
                ),
                // Flash
                Opacity(
                  opacity: _sweep.value < 0.5
                      ? _sweep.value * 0.8
                      : (1 - _sweep.value) * 0.8,
                  child: Container(color: Colors.white.withOpacity(0.4)),
                ),
                // Particles
                ..._buildParticles(t.glow),
                // Center
                Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Transform.scale(
                        scale: emblemP,
                        child: Transform.rotate(
                          angle: (1 - emblemP) * -math.pi,
                          child: SizedBox(
                            width: 200,
                            height: 200,
                            child: Stack(
                              alignment: Alignment.center,
                              children: [
                                // Outer pulsing blur glow
                                Transform.scale(
                                  scale: 1 + pulseP * 0.4,
                                  child: Container(
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: t.glow.withOpacity(0.3 + pulseP * 0.3),
                                      boxShadow: [
                                        BoxShadow(
                                          color: t.glow.withOpacity(0.5),
                                          blurRadius: 60,
                                          spreadRadius: 8,
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                                // Dashed rotating ring
                                Transform.rotate(
                                  angle: _rotate.value * 2 * math.pi,
                                  child: CustomPaint(
                                    size: const Size(150, 150),
                                    painter: _DashedRingPainter(
                                      color: t.primary.withOpacity(0.3),
                                    ),
                                  ),
                                ),
                                // Avatar
                                Container(
                                  width: 128,
                                  height: 128,
                                  padding: const EdgeInsets.all(4),
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Colors.black,
                                    border: Border.all(
                                      color: t.primary,
                                      width: 4,
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: t.glow.withOpacity(0.7),
                                        blurRadius: 40,
                                      ),
                                    ],
                                  ),
                                  child: ClipOval(
                                    child: widget.avatarUrl != null &&
                                            widget.avatarUrl!.isNotEmpty
                                        ? Image.network(
                                            widget.avatarUrl!,
                                            fit: BoxFit.cover,
                                            errorBuilder: (_, __, ___) =>
                                                _bigAvatarFallback(t.badgeEnd),
                                          )
                                        : _bigAvatarFallback(t.badgeEnd),
                                  ),
                                ),
                                // Rank badge
                                Positioned(
                                  bottom: 12,
                                  child: Opacity(
                                    opacity: emblemP.clamp(0, 1),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(
                                        horizontal: 12,
                                        vertical: 4,
                                      ),
                                      decoration: BoxDecoration(
                                        borderRadius: BorderRadius.circular(999),
                                        gradient: LinearGradient(
                                          colors: [t.badgeStart, t.badgeEnd],
                                        ),
                                        border: Border.all(
                                          color: const Color(0xFFFEF3C7),
                                        ),
                                        boxShadow: const [
                                          BoxShadow(
                                            color: Colors.black45,
                                            blurRadius: 8,
                                          ),
                                        ],
                                      ),
                                      child: Row(
                                        mainAxisSize: MainAxisSize.min,
                                        children: [
                                          const Text('👑',
                                              style: TextStyle(fontSize: 12)),
                                          const SizedBox(width: 4),
                                          Text(
                                            t.label,
                                            style: const TextStyle(
                                              color: Colors.white,
                                              fontSize: 10,
                                              fontWeight: FontWeight.w900,
                                              letterSpacing: 2,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(height: 24),
                      Transform.translate(
                        offset: Offset(0, (1 - textP) * 30),
                        child: Opacity(
                          opacity: textP.clamp(0, 1),
                          child: Column(
                            children: [
                              // Text with shine sweep
                              ShaderMask(
                                blendMode: BlendMode.srcATop,
                                shaderCallback: (rect) {
                                  final x = _shine.isAnimating
                                      ? _shine.value * 3 - 1
                                      : -1.0;
                                  return LinearGradient(
                                    begin: Alignment(x - 0.3, 0),
                                    end: Alignment(x + 0.3, 0),
                                    colors: const [
                                      Colors.transparent,
                                      Color(0x66FFFFFF),
                                      Colors.transparent,
                                    ],
                                  ).createShader(rect);
                                },
                                child: Text(
                                  widget.displayName.toUpperCase(),
                                  style: TextStyle(
                                    color: t.primary,
                                    fontSize: 44,
                                    fontWeight: FontWeight.w900,
                                    letterSpacing: -1.5,
                                    shadows: const [
                                      Shadow(
                                        color: Colors.black87,
                                        blurRadius: 15,
                                        offset: Offset(0, 5),
                                      ),
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Container(
                                height: 2,
                                width: 240,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [
                                      Colors.transparent,
                                      t.primary,
                                      Colors.transparent,
                                    ],
                                  ),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Text(
                                'THE ${t.label} HAS ARRIVED',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 18,
                                  fontStyle: FontStyle.italic,
                                  fontWeight: FontWeight.bold,
                                  letterSpacing: 2,
                                  shadows: [
                                    Shadow(color: Colors.black54, blurRadius: 6),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _bigAvatarFallback(Color bg) {
    return Container(
      color: bg,
      alignment: Alignment.center,
      child: Text(
        widget.displayName.isEmpty
            ? '?'
            : widget.displayName.characters.first.toUpperCase(),
        style: const TextStyle(
          color: Colors.white,
          fontSize: 40,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  List<Widget> _buildParticles(Color color) {
    final rand = math.Random(widget.displayName.hashCode);
    return List.generate(20, (i) {
      final phase = (_pulse.value + i / 20) % 1;
      final left = rand.nextDouble();
      final drift = rand.nextDouble() * 0.1 - 0.05;
      return Positioned(
        left: MediaQuery.of(context).size.width * (left + drift * phase),
        top: MediaQuery.of(context).size.height * (1.1 - phase * 1.2),
        child: Opacity(
          opacity: (math.sin(phase * math.pi) * 1).clamp(0, 1),
          child: Container(
            width: 4,
            height: 4,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color,
              boxShadow: [BoxShadow(color: color, blurRadius: 4)],
            ),
          ),
        ),
      );
    });
  }
}

class _DashedRingPainter extends CustomPainter {
  _DashedRingPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    const dashCount = 24;
    final radius = size.width / 2;
    final center = Offset(radius, radius);
    for (var i = 0; i < dashCount; i++) {
      final start = (i / dashCount) * 2 * math.pi;
      final end = start + (math.pi / dashCount) * 0.6;
      final rect = Rect.fromCircle(center: center, radius: radius);
      canvas.drawArc(rect, start, end - start, false, paint);
    }
  }

  @override
  bool shouldRepaint(covariant _DashedRingPainter oldDelegate) =>
      oldDelegate.color != color;
}
