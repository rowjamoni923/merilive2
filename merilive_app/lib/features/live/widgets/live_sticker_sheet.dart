import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../../../core/env/env.dart';
import '../../../core/native/livekit_bridge.dart';

/// Phase C-15 — Sticker overlay picker (Chamet/Bigo AR stickers).
///
/// Reads from the admin-managed `ar_stickers` table (single source of
/// truth) and wires taps to `LiveKitBridge.setStickerOverlay`. Empty /
/// deprecated rows (no `preview_url`) are filtered out. On tap the
/// sticker mounts on the native camera renderer; on tap-again or the
/// "Clear" tile the overlay is removed.
class LiveStickerSheet extends StatefulWidget {
  const LiveStickerSheet({
    super.key,
    required this.activeStickerId,
    required this.onChanged,
  });

  final String? activeStickerId;

  /// Called after the native call resolves so the caller can update UI.
  final ValueChanged<StickerItem?> onChanged;

  static Future<void> show(
    BuildContext context, {
    required String? activeStickerId,
    required ValueChanged<StickerItem?> onChanged,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => LiveStickerSheet(
        activeStickerId: activeStickerId,
        onChanged: onChanged,
      ),
    );
  }

  @override
  State<LiveStickerSheet> createState() => _LiveStickerSheetState();
}

class StickerItem {
  StickerItem({
    required this.id,
    required this.name,
    required this.category,
    required this.previewUrl,
    required this.assetUrl,
  });
  final String id;
  final String name;
  final String category;
  final String previewUrl;
  final String assetUrl;
}

class _LiveStickerSheetState extends State<LiveStickerSheet> {
  bool _loading = true;
  String? _error;
  List<StickerItem> _stickers = const [];
  String _category = 'all';
  bool _applying = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await Supabase.instance.client
          .from('ar_stickers')
          .select('id,name,category,preview_url,asset_url')
          .eq('is_active', true)
          .order('display_order');
      final list = <StickerItem>[];
      for (final r in rows as List) {
        final preview = (r['preview_url'] ?? '').toString();
        final asset = (r['asset_url'] ?? r['file_url'] ?? preview).toString();
        if (preview.isEmpty || asset.isEmpty) continue;
        list.add(StickerItem(
          id: r['id'].toString(),
          name: (r['name'] ?? '').toString(),
          category: (r['category'] ?? 'other').toString(),
          previewUrl: _absolute(preview),
          assetUrl: _absolute(asset),
        ));
      }
      if (!mounted) return;
      setState(() {
        _stickers = list;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Failed to load stickers';
      });
    }
  }

  String _absolute(String url) {
    if (url.startsWith('http')) return url;
    final base = Env.webAppOrigin.replaceAll(RegExp(r'/$'), '');
    return '$base${url.startsWith('/') ? '' : '/'}$url';
  }

  List<String> get _categories {
    final set = <String>{'all', for (final s in _stickers) s.category};
    return set.toList();
  }

  List<StickerItem> get _filtered => _category == 'all'
      ? _stickers
      : _stickers.where((s) => s.category == _category).toList();

  Future<void> _apply(StickerItem? item) async {
    if (_applying) return;
    setState(() => _applying = true);
    try {
      final res = await LiveKitBridge.instance.setStickerOverlay(
        stickerId: item?.id,
        assetUrl: item?.assetUrl,
        x: 0.5,
        y: 0.4,
        scale: 1.0,
      );
      final ok = res['success'] == true || res['pending'] == true;
      if (!mounted) return;
      if (ok) {
        widget.onChanged(item);
        Navigator.of(context).maybePop();
      } else {
        final reason = (res['reason'] ?? 'Sticker unavailable').toString();
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(reason)));
      }
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Sticker failed: $e')));
    } finally {
      if (mounted) setState(() => _applying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final maxH = MediaQuery.of(context).size.height * 0.72;
    return SafeArea(
      top: false,
      child: Container(
        constraints: BoxConstraints(maxHeight: maxH),
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xF01A1226), Color(0xF006040C)],
          ),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 44,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.emoji_emotions_rounded,
                    color: Color(0xFFEC4899), size: 20),
                const SizedBox(width: 8),
                const Expanded(
                  child: Text('Stickers',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800)),
                ),
                if (widget.activeStickerId != null)
                  TextButton.icon(
                    onPressed: _applying ? null : () => _apply(null),
                    icon: const Icon(Icons.close_rounded,
                        color: Colors.white70, size: 16),
                    label: const Text('Clear',
                        style:
                            TextStyle(color: Colors.white70, fontSize: 12)),
                    style: TextButton.styleFrom(
                      minimumSize: const Size(0, 32),
                      padding: const EdgeInsets.symmetric(horizontal: 8),
                    ),
                  ),
                IconButton(
                  onPressed: () => Navigator.of(context).maybePop(),
                  icon: const Icon(Icons.close, color: Colors.white70),
                ),
              ],
            ),
            const SizedBox(height: 8),
            if (_loading)
              const Padding(
                padding: EdgeInsets.all(40),
                child: CircularProgressIndicator(color: Colors.white),
              )
            else if (_error != null)
              Padding(
                padding: const EdgeInsets.all(24),
                child: Text(_error!,
                    style: const TextStyle(color: Colors.white70)),
              )
            else if (_stickers.isEmpty)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Text(
                  'No stickers configured by admin.',
                  style: TextStyle(color: Colors.white54, fontSize: 13),
                ),
              )
            else ...[
              SizedBox(
                height: 36,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  children: [
                    for (final c in _categories)
                      Padding(
                        padding: const EdgeInsets.only(right: 8),
                        child: ChoiceChip(
                          label: Text(
                            c == 'all' ? 'All' : c[0].toUpperCase() + c.substring(1),
                            style: TextStyle(
                              color: _category == c
                                  ? Colors.white
                                  : Colors.white70,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          selected: _category == c,
                          selectedColor: const Color(0xFFEC4899),
                          backgroundColor: Colors.white.withValues(alpha: 0.08),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(999),
                            side: BorderSide(
                              color: Colors.white.withValues(alpha: 0.12),
                            ),
                          ),
                          onSelected: (_) => setState(() => _category = c),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              Flexible(
                child: GridView.builder(
                  padding: EdgeInsets.zero,
                  gridDelegate:
                      const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 4,
                    mainAxisSpacing: 10,
                    crossAxisSpacing: 10,
                    childAspectRatio: 0.82,
                  ),
                  itemCount: _filtered.length,
                  itemBuilder: (context, i) {
                    final s = _filtered[i];
                    final active = s.id == widget.activeStickerId;
                    return _StickerTile(
                      item: s,
                      active: active,
                      onTap: () => _apply(active ? null : s),
                    );
                  },
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _StickerTile extends StatelessWidget {
  const _StickerTile({
    required this.item,
    required this.active,
    required this.onTap,
  });

  final StickerItem item;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Container(
        padding: const EdgeInsets.all(6),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: active ? 0.16 : 0.06),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: active
                ? const Color(0xFFEC4899)
                : Colors.white.withValues(alpha: 0.1),
            width: active ? 2 : 1,
          ),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Expanded(
              child: Image.network(
                item.previewUrl,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Icon(
                  Icons.image_not_supported_outlined,
                  color: Colors.white30,
                  size: 26,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              item.name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: active ? Colors.white : Colors.white70,
                fontSize: 10.5,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
