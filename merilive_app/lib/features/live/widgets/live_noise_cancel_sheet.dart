import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/native/livekit_bridge.dart';

/// Phase G-25 — Noise cancellation toggle sheet.
///
/// Toggles native WebRTC-NS / RNNoise on the local audio track via
/// `LiveKitBridge.setNoiseCancellation`. State persists in prefs and
/// re-applies on the next open. Dormant no-op if the native handler
/// isn't shipped yet.
class LiveNoiseCancelSheet extends StatefulWidget {
  const LiveNoiseCancelSheet({super.key});

  static const _prefKey = 'live_noise_cancel_v1';

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xF01F2937),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => const LiveNoiseCancelSheet(),
    );
  }

  static Future<bool> applyOnStart() async {
    final prefs = await SharedPreferences.getInstance();
    final on = prefs.getBool(_prefKey) ?? false;
    if (on) await LiveKitBridge.instance.setNoiseCancellation(true);
    return on;
  }

  @override
  State<LiveNoiseCancelSheet> createState() => _LiveNoiseCancelSheetState();
}

class _LiveNoiseCancelSheetState extends State<LiveNoiseCancelSheet> {
  bool _enabled = false;
  bool _busy = false;
  String? _hint;

  @override
  void initState() {
    super.initState();
    SharedPreferences.getInstance().then((p) {
      if (!mounted) return;
      setState(() =>
          _enabled = p.getBool(LiveNoiseCancelSheet._prefKey) ?? false);
    });
  }

  Future<void> _toggle(bool on) async {
    setState(() => _busy = true);
    final res = await LiveKitBridge.instance.setNoiseCancellation(on);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(LiveNoiseCancelSheet._prefKey, on);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _enabled = on;
      _hint = (res['success'] == false && res['reason'] == 'unimplemented')
          ? 'Noise cancellation will activate after the next app update.'
          : null;
    });
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                const Icon(Icons.graphic_eq_rounded, color: Colors.white70),
                const SizedBox(width: 10),
                const Expanded(
                  child: Text(
                    'Noise cancellation',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                Switch.adaptive(
                  value: _enabled,
                  onChanged: _busy ? null : _toggle,
                ),
              ],
            ),
            const SizedBox(height: 6),
            const Text(
              'Suppresses background noise from your mic in real time. '
              'Recommended for indoor streaming.',
              style: TextStyle(color: Colors.white70, fontSize: 12),
            ),
            if (_hint != null) ...[
              const SizedBox(height: 10),
              Text(
                _hint!,
                style:
                    const TextStyle(color: Colors.amberAccent, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
