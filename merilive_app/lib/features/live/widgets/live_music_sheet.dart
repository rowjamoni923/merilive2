import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/native/livekit_bridge.dart';

/// Phase G-25 — Host background-music sheet (parity with web
/// `MusicPlayerPanel`, minimal build).
///
/// Host pastes/keeps a music URL (mp3/aac/m4a). Play / Pause / Volume
/// route into `LiveKitBridge.setBackgroundMusic*` — dormant no-op on
/// APKs where the native mixer handler isn't shipped yet. Volume + URL
/// persist in `SharedPreferences`.
class LiveMusicSheet extends StatefulWidget {
  const LiveMusicSheet({super.key});

  static const _prefUrl = 'live_bg_music_url_v1';
  static const _prefVol = 'live_bg_music_volume_v1';
  static const _prefPlaying = 'live_bg_music_playing_v1';

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      backgroundColor: const Color(0xF01F2937),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (_) => Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: const LiveMusicSheet(),
      ),
    );
  }

  @override
  State<LiveMusicSheet> createState() => _LiveMusicSheetState();
}

class _LiveMusicSheetState extends State<LiveMusicSheet> {
  final _urlCtrl = TextEditingController();
  double _volume = 0.6;
  bool _playing = false;
  bool _busy = false;
  String? _dormantHint;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _urlCtrl.text = prefs.getString(LiveMusicSheet._prefUrl) ?? '';
      _volume = prefs.getDouble(LiveMusicSheet._prefVol) ?? 0.6;
      _playing = prefs.getBool(LiveMusicSheet._prefPlaying) ?? false;
    });
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(LiveMusicSheet._prefUrl, _urlCtrl.text.trim());
    await prefs.setDouble(LiveMusicSheet._prefVol, _volume);
    await prefs.setBool(LiveMusicSheet._prefPlaying, _playing);
  }

  Future<void> _apply({required bool play}) async {
    final url = _urlCtrl.text.trim();
    if (url.isEmpty) return;
    setState(() => _busy = true);
    final res = await LiveKitBridge.instance.setBackgroundMusic(
      url: url,
      play: play,
      volume: _volume,
    );
    if (!mounted) return;
    setState(() {
      _busy = false;
      _playing = play;
      _dormantHint = (res['success'] == false && res['reason'] == 'unimplemented')
          ? 'Music mixer will activate after the next app update.'
          : null;
    });
    await _persist();
  }

  Future<void> _stop() async {
    await LiveKitBridge.instance.setBackgroundMusic(url: null, play: false);
    setState(() => _playing = false);
    await _persist();
  }

  @override
  void dispose() {
    _urlCtrl.dispose();
    super.dispose();
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
            const Row(
              children: [
                Icon(Icons.music_note_rounded, color: Colors.white70),
                SizedBox(width: 8),
                Text(
                  'Background music',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            TextField(
              controller: _urlCtrl,
              style: const TextStyle(color: Colors.white),
              keyboardType: TextInputType.url,
              decoration: InputDecoration(
                hintText: 'Paste mp3 / m4a URL',
                hintStyle: TextStyle(color: Colors.white38),
                filled: true,
                fillColor: Colors.white.withOpacity(0.06),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                const Icon(Icons.volume_up_rounded,
                    color: Colors.white70, size: 20),
                Expanded(
                  child: Slider(
                    value: _volume,
                    onChanged: (v) => setState(() => _volume = v),
                    onChangeEnd: (v) async {
                      await LiveKitBridge.instance.setBackgroundMusicVolume(v);
                      await _persist();
                    },
                  ),
                ),
                SizedBox(
                  width: 32,
                  child: Text(
                    '${(_volume * 100).round()}',
                    textAlign: TextAlign.right,
                    style: const TextStyle(color: Colors.white70),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy || _urlCtrl.text.trim().isEmpty
                        ? null
                        : () => _apply(play: !_playing),
                    icon: Icon(_playing
                        ? Icons.pause_rounded
                        : Icons.play_arrow_rounded),
                    label: Text(_playing ? 'Pause' : 'Play'),
                  ),
                ),
                const SizedBox(width: 10),
                OutlinedButton.icon(
                  onPressed: _busy ? null : _stop,
                  icon: const Icon(Icons.stop_rounded),
                  label: const Text('Stop'),
                ),
              ],
            ),
            if (_dormantHint != null) ...[
              const SizedBox(height: 10),
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
}
