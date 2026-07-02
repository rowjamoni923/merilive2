import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/native/livekit_bridge.dart';

/// M5 — Compact call quality HUD.
///
/// Polls the native `LiveKitBridge.getStats()` bridge every 2s and renders
/// a pill with RTT / packet-loss / quality color. On older APKs (no native
/// implementation) the bridge returns `unimplemented` and the pill hides
/// itself — no fake "great connection" placeholder is drawn.
class CallQualityHud extends StatefulWidget {
  const CallQualityHud({super.key});

  @override
  State<CallQualityHud> createState() => _CallQualityHudState();
}

class _CallQualityHudState extends State<CallQualityHud> {
  Timer? _timer;
  int? _rttMs;
  double? _lossPct;
  String _quality = 'unknown';
  bool _available = true;

  @override
  void initState() {
    super.initState();
    _tick();
    _timer = Timer.periodic(const Duration(seconds: 2), (_) => _tick());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _tick() async {
    final r = await LiveKitBridge.instance.getStats();
    if (!mounted) return;
    if (r['success'] == false && r['reason'] == 'unimplemented') {
      setState(() => _available = false);
      _timer?.cancel();
      return;
    }
    setState(() {
      _rttMs = (r['rttMs'] as num?)?.toInt();
      _lossPct = (r['lossPct'] as num?)?.toDouble();
      _quality = (r['quality'] as String?) ?? _deriveQuality();
    });
  }

  String _deriveQuality() {
    final rtt = _rttMs ?? 0;
    final loss = _lossPct ?? 0;
    if (loss >= 10 || rtt >= 500) return 'poor';
    if (loss >= 3 || rtt >= 250) return 'good';
    return 'excellent';
  }

  Color _dotColor() {
    switch (_quality) {
      case 'excellent':
        return const Color(0xFF22C55E);
      case 'good':
        return const Color(0xFFFBBF24);
      case 'poor':
        return const Color(0xFFF97316);
      case 'lost':
        return const Color(0xFFEF4444);
      default:
        return Colors.white54;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_available) return const SizedBox.shrink();
    final rttLabel = _rttMs == null ? '—' : '${_rttMs}ms';
    final lossLabel =
        _lossPct == null ? '' : ' · ${_lossPct!.toStringAsFixed(1)}%';
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.55),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withOpacity(0.15)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 8,
            height: 8,
            decoration: BoxDecoration(
              color: _dotColor(),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(color: _dotColor().withOpacity(0.6), blurRadius: 6),
              ],
            ),
          ),
          const SizedBox(width: 6),
          Text(
            '$rttLabel$lossLabel',
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}
