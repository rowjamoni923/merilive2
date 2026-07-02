import 'package:flutter/material.dart';

/// Flutter port of `LocalMicVuMeter`'s companion — connection quality pill.
/// Ports `ConnectionQualityIndicator` used inside `LiveStream.tsx`. Reads a
/// 0..3 quality bucket from LiveKit stats and renders as bars + label.
enum LiveConnectionQuality { unknown, poor, good, excellent }

class ConnectionQualityIndicator extends StatelessWidget {
  final LiveConnectionQuality quality;
  final bool showLabel;
  const ConnectionQualityIndicator({
    super.key,
    required this.quality,
    this.showLabel = false,
  });

  int get _active {
    switch (quality) {
      case LiveConnectionQuality.excellent:
        return 3;
      case LiveConnectionQuality.good:
        return 2;
      case LiveConnectionQuality.poor:
        return 1;
      case LiveConnectionQuality.unknown:
        return 0;
    }
  }

  Color get _color {
    switch (quality) {
      case LiveConnectionQuality.excellent:
        return const Color(0xFF22C55E);
      case LiveConnectionQuality.good:
        return const Color(0xFFF59E0B);
      case LiveConnectionQuality.poor:
        return const Color(0xFFEF4444);
      case LiveConnectionQuality.unknown:
        return Colors.white38;
    }
  }

  String get _label {
    switch (quality) {
      case LiveConnectionQuality.excellent:
        return 'Excellent';
      case LiveConnectionQuality.good:
        return 'Good';
      case LiveConnectionQuality.poor:
        return 'Poor';
      case LiveConnectionQuality.unknown:
        return '—';
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.4),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          for (var i = 0; i < 3; i++) ...[
            Container(
              width: 3,
              height: 5.0 + i * 3.5,
              margin: EdgeInsets.only(right: i == 2 ? 0 : 2),
              decoration: BoxDecoration(
                color: i < _active ? _color : Colors.white.withOpacity(0.2),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ],
          if (showLabel) ...[
            const SizedBox(width: 6),
            Text(_label,
                style: TextStyle(
                    color: _color,
                    fontSize: 10,
                    fontWeight: FontWeight.w800)),
          ],
        ],
      ),
    );
  }
}
