import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/native/livekit_bridge.dart';

/// M3 + B2 — Beauty bottom sheet for live host.
///
/// Sliders are debounced and forwarded to `LiveKitBridge.setBeautyParams`
/// which routes into the native GPUPixel filter chain on Android.
/// On surfaces without the plugin (web / old APK) the calls no-op.
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
  double _rosy = 0.05;
  bool _busy = false;
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    super.dispose();
  }

  void _pushParams() {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 90), () {
      LiveKitBridge.instance.setBeautyParams(
        smooth: _enabled ? _smooth : 0,
        whiten: _enabled ? _whiten : 0,
        slim: _enabled ? _slim : 0,
        eye: _enabled ? _eye : 0,
        rosy: _enabled ? _rosy : 0,
      );
    });
  }

  Future<void> _toggle(bool v) async {
    setState(() {
      _enabled = v;
      _busy = true;
    });
    await LiveKitBridge.instance.setBeautyEnabled(v);
    _pushParams();
    if (mounted) setState(() => _busy = false);
  }

  void _reset() {
    setState(() {
      _smooth = 0;
      _whiten = 0;
      _slim = 0;
      _eye = 0;
      _rosy = 0;
    });
    _pushParams();
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
              width: 40,
              height: 4,
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
                TextButton(
                  onPressed: _busy ? null : _reset,
                  style: TextButton.styleFrom(
                    foregroundColor: Colors.white70,
                    minimumSize: const Size(0, 32),
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                  ),
                  child: const Text('Reset', style: TextStyle(fontSize: 12)),
                ),
                Switch.adaptive(
                  value: _enabled,
                  activeThumbColor: const Color(0xFFEC4899),
                  onChanged: _busy ? null : _toggle,
                ),
              ],
            ),
            const SizedBox(height: 8),
            _slider('Smooth', _smooth, (v) {
              setState(() => _smooth = v);
              _pushParams();
            }),
            _slider('Whiten', _whiten, (v) {
              setState(() => _whiten = v);
              _pushParams();
            }),
            _slider('Face Slim', _slim, (v) {
              setState(() => _slim = v);
              _pushParams();
            }),
            _slider('Eye Enlarge', _eye, (v) {
              setState(() => _eye = v);
              _pushParams();
            }),
            _slider('Rosy', _rosy, (v) {
              setState(() => _rosy = v);
              _pushParams();
            }),
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
