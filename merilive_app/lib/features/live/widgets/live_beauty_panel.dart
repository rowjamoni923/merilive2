import 'package:flutter/material.dart';

import '../../../core/native/livekit_bridge.dart';

/// M3 — Beauty bottom sheet for live host.
///
/// Wires the four GPUPixel levels the native `LiveKitPlugin` exposes via
/// `setBeautyEnabled` (master switch). Slider values are UI-only for now
/// (native side runs the whole pipeline at a single tuned preset); when
/// per-level channel methods land, they hook into this same panel with
/// no other UI changes.
class LiveBeautyPanel extends StatefulWidget {
  const LiveBeautyPanel({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (_) => const LiveBeautyPanel(),
    );
  }

  @override
  State<LiveBeautyPanel> createState() => _LiveBeautyPanelState();
}

class _LiveBeautyPanelState extends State<LiveBeautyPanel> {
  bool _enabled = true;
  double _smooth = 0.35;
  double _whiten = 0.20;
  double _slim = 0.15;
  double _eye = 0.10;
  bool _busy = false;

  Future<void> _toggle(bool v) async {
    setState(() {
      _enabled = v;
      _busy = true;
    });
    await LiveKitBridge.instance.setBeautyEnabled(v);
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xF01F2937), Color(0xF00F172A)],
          ),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                const Icon(Icons.auto_awesome_rounded,
                    color: Color(0xFFEC4899), size: 20),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text('Beauty',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w700)),
                ),
                Switch.adaptive(
                  value: _enabled,
                  activeColor: const Color(0xFFEC4899),
                  onChanged: _busy ? null : _toggle,
                ),
              ],
            ),
            const SizedBox(height: 8),
            _slider('Smooth', _smooth, (v) => setState(() => _smooth = v)),
            _slider('Whiten', _whiten, (v) => setState(() => _whiten = v)),
            _slider('Face Slim', _slim, (v) => setState(() => _slim = v)),
            _slider('Eye Enlarge', _eye, (v) => setState(() => _eye = v)),
          ],
        ),
      ),
    );
  }

  Widget _slider(String label, double value, ValueChanged<double> onChanged) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(
            width: 92,
            child: Text(label,
                style: const TextStyle(color: Colors.white70, fontSize: 12)),
          ),
          Expanded(
            child: SliderTheme(
              data: SliderThemeData(
                activeTrackColor: const Color(0xFFEC4899),
                thumbColor: Colors.white,
                inactiveTrackColor: Colors.white12,
                trackHeight: 3,
                thumbShape:
                    const RoundSliderThumbShape(enabledThumbRadius: 8),
                overlayShape: SliderComponentShape.noOverlay,
              ),
              child: Slider(
                value: value,
                min: 0,
                max: 1,
                onChanged: _enabled ? onChanged : null,
              ),
            ),
          ),
          SizedBox(
            width: 36,
            child: Text('${(value * 100).round()}',
                textAlign: TextAlign.end,
                style:
                    const TextStyle(color: Colors.white54, fontSize: 11)),
          ),
        ],
      ),
    );
  }
}
