import 'dart:async';
import 'package:flutter/material.dart';

/// Flutter port of `LocalMicVuMeter.tsx` — 5-bar vertical VU meter driven by
/// input audio level (0..1). Host mic monitor. Consumer pushes levels from
/// LiveKit local audio track stats.
class LocalMicVuMeter extends StatefulWidget {
  final Stream<double> levelStream; // 0..1
  final bool muted;
  final double height;
  const LocalMicVuMeter({
    super.key,
    required this.levelStream,
    this.muted = false,
    this.height = 22,
  });

  @override
  State<LocalMicVuMeter> createState() => _LocalMicVuMeterState();
}

class _LocalMicVuMeterState extends State<LocalMicVuMeter> {
  double _level = 0;
  StreamSubscription<double>? _sub;

  @override
  void initState() {
    super.initState();
    _sub = widget.levelStream.listen((v) {
      if (!mounted) return;
      setState(() => _level = v.clamp(0, 1));
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final active = widget.muted ? 0 : (_level * 5).round();
    return Row(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: List.generate(5, (i) {
        final on = i < active;
        final h = widget.height * (0.35 + i * 0.15);
        Color c;
        if (i >= 4) {
          c = const Color(0xFFEF4444);
        } else if (i >= 3) {
          c = const Color(0xFFF59E0B);
        } else {
          c = const Color(0xFF22C55E);
        }
        return AnimatedContainer(
          duration: const Duration(milliseconds: 90),
          width: 3,
          height: h,
          margin: EdgeInsets.only(right: i == 4 ? 0 : 2),
          decoration: BoxDecoration(
            color: on ? c : Colors.white.withOpacity(0.15),
            borderRadius: BorderRadius.circular(2),
          ),
        );
      }),
    );
  }
}
