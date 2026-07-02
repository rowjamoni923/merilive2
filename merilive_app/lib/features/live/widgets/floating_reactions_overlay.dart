import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../data/live_reactions_bus.dart';

/// Phase G-25 — Floating emoji column over the live view.
///
/// Parity with `src/components/livekit/FloatingReactionsOverlay.tsx`:
///   • Emojis rise from the right side (~65–90% X).
///   • Random lateral drift ±30px, scale 0.9–1.4, 2.8–3.6 s duration.
///   • Fully pointer-events-none — never blocks taps beneath.
class FloatingReactionsOverlay extends StatefulWidget {
  const FloatingReactionsOverlay({
    super.key,
    this.bottomOffset = 96,
  });

  final double bottomOffset;

  @override
  State<FloatingReactionsOverlay> createState() =>
      _FloatingReactionsOverlayState();
}

class _FloatingReactionsOverlayState extends State<FloatingReactionsOverlay>
    with TickerProviderStateMixin {
  final List<_FloatingItem> _items = [];
  StreamSubscription<LiveReaction>? _sub;
  final _rand = math.Random();

  @override
  void initState() {
    super.initState();
    _sub = LiveReactionsBus.instance.stream$.listen(_add);
  }

  void _add(LiveReaction r) {
    if (!mounted) return;
    final durationMs = 2800 + _rand.nextInt(800);
    final controller = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: durationMs),
    );
    final item = _FloatingItem(
      reaction: r,
      xPct: 0.65 + _rand.nextDouble() * 0.25,
      drift: (_rand.nextDouble() - 0.5) * 60,
      scale: 0.9 + _rand.nextDouble() * 0.5,
      controller: controller,
    );
    controller.addStatusListener((s) {
      if (s == AnimationStatus.completed && mounted) {
        setState(() => _items.remove(item));
        controller.dispose();
      }
    });
    setState(() => _items.add(item));
    controller.forward();
  }

  @override
  void dispose() {
    _sub?.cancel();
    for (final i in _items) {
      i.controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: LayoutBuilder(builder: (context, cs) {
        final w = cs.maxWidth;
        final h = cs.maxHeight;
        return Stack(
          clipBehavior: Clip.hardEdge,
          children: _items.map((it) {
            return AnimatedBuilder(
              animation: it.controller,
              builder: (context, _) {
                final t = it.controller.value;
                // Opacity envelope: fade in 0-15%, out 80-100%.
                final opacity = t < 0.15
                    ? t / 0.15
                    : (t > 0.8 ? (1 - (t - 0.8) / 0.2) : 1.0);
                final y = h - widget.bottomOffset - t * (h * 0.7);
                final x = it.xPct * w + it.drift * t;
                return Positioned(
                  left: x,
                  top: y,
                  child: Opacity(
                    opacity: opacity.clamp(0.0, 1.0),
                    child: Transform.scale(
                      scale: 0.6 + (it.scale - 0.6) * t,
                      child: Text(
                        it.reaction.emoji,
                        style: const TextStyle(fontSize: 36),
                      ),
                    ),
                  ),
                );
              },
            );
          }).toList(),
        );
      }),
    );
  }
}

class _FloatingItem {
  _FloatingItem({
    required this.reaction,
    required this.xPct,
    required this.drift,
    required this.scale,
    required this.controller,
  });
  final LiveReaction reaction;
  final double xPct;
  final double drift;
  final double scale;
  final AnimationController controller;
}
