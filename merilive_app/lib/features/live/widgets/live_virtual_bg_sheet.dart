import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/native/livekit_bridge.dart';

/// Phase G-25 — Virtual background picker.
///
/// 6 curated preset URLs + an "Off" tile. Tap → `setVirtualBackground`
/// bridge (native GPUPixel segmentation). Dormant no-op if the native
/// handler isn't shipped — the pick still persists locally so it takes
/// effect on the next APK.
class LiveVirtualBgSheet extends StatefulWidget {
  const LiveVirtualBgSheet({super.key});

  static const _prefKey = 'live_virtual_bg_url_v1';

  static const List<_BgPreset> presets = [
    _BgPreset('Beach',
        'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800'),
    _BgPreset('City',
        'https://images.unsplash.com/photo-1519501025264-65ba15a82390?w=800'),
    _BgPreset('Studio',
        'https://images.unsplash.com/photo-1520975916090-3105956dac38?w=800'),
    _BgPreset('Forest',
        'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800'),
    _BgPreset('Neon',
        'https://images.unsplash.com/photo-1500462918059-b1a0cb512f1d?w=800'),
    _BgPreset('Cafe',
        'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800'),
  ];

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xF01F2937),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => const LiveVirtualBgSheet(),
    );
  }

  @override
  State<LiveVirtualBgSheet> createState() => _LiveVirtualBgSheetState();
}

class _LiveVirtualBgSheetState extends State<LiveVirtualBgSheet> {
  String? _activeUrl;
  String? _dormantHint;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() => _activeUrl = prefs.getString(LiveVirtualBgSheet._prefKey));
  }

  Future<void> _pick(String? url) async {
    setState(() => _busy = true);
    final res = await LiveKitBridge.instance.setVirtualBackground(url: url);
    final prefs = await SharedPreferences.getInstance();
    if (url == null) {
      await prefs.remove(LiveVirtualBgSheet._prefKey);
    } else {
      await prefs.setString(LiveVirtualBgSheet._prefKey, url);
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _activeUrl = url;
      _dormantHint =
          (res['success'] == false && res['reason'] == 'unimplemented')
              ? 'Virtual background will activate after the next app update.'
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
            const Text(
              'Virtual background',
              style: TextStyle(
                color: Colors.white,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 14),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _tile(
                  label: 'Off',
                  isActive: _activeUrl == null,
                  onTap: _busy ? null : () => _pick(null),
                  child: const Icon(Icons.block_rounded,
                      color: Colors.white70, size: 28),
                ),
                ...LiveVirtualBgSheet.presets.map((p) => _tile(
                      label: p.label,
                      isActive: _activeUrl == p.url,
                      onTap: _busy ? null : () => _pick(p.url),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(10),
                        child: Image.network(
                          p.url,
                          fit: BoxFit.cover,
                          width: double.infinity,
                          height: double.infinity,
                        ),
                      ),
                    )),
              ],
            ),
            if (_dormantHint != null) ...[
              const SizedBox(height: 12),
              Text(
                _dormantHint!,
                style:
                    const TextStyle(color: Colors.amberAccent, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _tile({
    required String label,
    required bool isActive,
    required Widget child,
    VoidCallback? onTap,
  }) {
    return InkResponse(
      radius: 40,
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.06),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isActive
                ? const Color(0xFF60A5FA)
                : Colors.white.withOpacity(0.12),
            width: isActive ? 2 : 1,
          ),
        ),
        padding: const EdgeInsets.all(4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(child: Center(child: child)),
            const SizedBox(height: 4),
            Text(
              label,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, fontSize: 11),
            ),
          ],
        ),
      ),
    );
  }
}

class _BgPreset {
  const _BgPreset(this.label, this.url);
  final String label;
  final String url;
}
