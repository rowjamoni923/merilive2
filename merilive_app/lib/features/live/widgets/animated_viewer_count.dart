// Pkg424 parity — animated live viewer count chip.
//
// Flutter port of `src/components/live/AnimatedViewerCount.tsx`. easeOutCubic
// count-up over `duration` (default 500ms), K/M compact formatting, and
// stale-state dim to 60% opacity when [connected] is false. Use inside the
// professional viewer count chip / top-bar.

import 'package:flutter/material.dart';

String formatCompactCount(int n) {
  if (n < 1000) return '$n';
  if (n < 1000000) {
    final k = n / 1000.0;
    final s = k < 10 ? k.toStringAsFixed(1) : k.toStringAsFixed(0);
    return '${s.replaceAll(RegExp(r'\.0$'), '')}K';
  }
  final m = n / 1000000.0;
  final s = m < 10 ? m.toStringAsFixed(1) : m.toStringAsFixed(0);
  return '${s.replaceAll(RegExp(r'\.0$'), '')}M';
}

class AnimatedViewerCount extends StatefulWidget {
  const AnimatedViewerCount({
    super.key,
    required this.value,
    this.connected = true,
    this.style,
    this.duration = const Duration(milliseconds: 500),
  });

  final int value;
  final bool connected;
  final TextStyle? style;
  final Duration duration;

  @override
  State<AnimatedViewerCount> createState() => _AnimatedViewerCountState();
}

class _AnimatedViewerCountState extends State<AnimatedViewerCount>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;
  int _from = 0;
  int _current = 0;

  @override
  void initState() {
    super.initState();
    _current = widget.value;
    _from = widget.value;
    _ctrl = AnimationController(vsync: this, duration: widget.duration)
      ..addListener(_onTick);
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic);
  }

  @override
  void didUpdateWidget(covariant AnimatedViewerCount oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.value != _current) {
      _from = _current;
      _ctrl.duration = widget.duration;
      _ctrl.forward(from: 0);
    }
  }

  void _onTick() {
    final t = _anim.value;
    setState(() {
      _current = (_from + (widget.value - _from) * t).round();
    });
  }

  @override
  void dispose() {
    _ctrl
      ..removeListener(_onTick)
      ..dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.style ??
        const TextStyle(
          color: Colors.white,
          fontSize: 10,
          fontWeight: FontWeight.bold,
          fontFeatures: [FontFeature.tabularFigures()],
        );
    return AnimatedOpacity(
      opacity: widget.connected ? 1.0 : 0.6,
      duration: const Duration(milliseconds: 220),
      child: Text(
        formatCompactCount(_current < 0 ? 0 : _current),
        style: base,
      ),
    );
  }
}
