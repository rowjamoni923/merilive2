import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// G6 — Background picker sheet.
///
/// Lists rows from `party_room_backgrounds` (admin-managed catalog) so the
/// host can swap the room background from a curated grid instead of pasting
/// a raw URL. Returns the picked `image_url` (or null on cancel).
class PartyBackgroundPickerSheet extends StatefulWidget {
  const PartyBackgroundPickerSheet({super.key});

  static Future<String?> show(BuildContext context) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const PartyBackgroundPickerSheet(),
    );
  }

  @override
  State<PartyBackgroundPickerSheet> createState() =>
      _PartyBackgroundPickerSheetState();
}

class _PartyBackgroundPickerSheetState
    extends State<PartyBackgroundPickerSheet> {
  bool _loading = true;
  List<_Bg> _items = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await Supabase.instance.client
          .from('party_room_backgrounds')
          .select(
              'id, name, image_url, thumbnail_url, gradient_css, is_free, price_coins')
          .eq('is_active', true)
          .order('display_order', ascending: true)
          .limit(60);
      final list = (rows as List)
          .cast<Map>()
          .map((r) => _Bg(
                id: r['id'].toString(),
                name: (r['name'] as String?) ?? '',
                imageUrl: (r['image_url'] as String?) ?? '',
                thumb: (r['thumbnail_url'] as String?) ?? '',
                gradientCss: (r['gradient_css'] as String?) ?? '',
                isFree: r['is_free'] == true,
                price: (r['price_coins'] as num?)?.toInt() ?? 0,
              ))
          // Accept rows that have EITHER a real image OR a gradient css.
          .where((b) => b.imageUrl.isNotEmpty || b.gradientCss.isNotEmpty)
          .toList();
      if (mounted) setState(() {
        _items = list;
        _loading = false;
      });
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }


  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.7,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, scroll) => Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0xFF1E1B4B), Color(0xFF0F172A)],
          ),
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                    color: Colors.white24,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 12),
            const Text('Choose background',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Expanded(
              child: _loading
                  ? const Center(
                      child: CircularProgressIndicator(color: Colors.white))
                  : _items.isEmpty
                      ? const Center(
                          child: Text('No backgrounds available',
                              style: TextStyle(color: Colors.white54)))
                      : GridView.builder(
                          controller: scroll,
                          gridDelegate:
                              const SliverGridDelegateWithFixedCrossAxisCount(
                            crossAxisCount: 3,
                            mainAxisSpacing: 8,
                            crossAxisSpacing: 8,
                            childAspectRatio: 0.66,
                          ),
                          itemCount: _items.length,
                          itemBuilder: (_, i) {
                            final b = _items[i];
                            return InkWell(
                              onTap: () =>
                                  Navigator.of(context).pop(b.imageUrl),
                              borderRadius: BorderRadius.circular(10),
                              child: Container(
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(10),
                                  color: Colors.white10,
                                  image: DecorationImage(
                                    image: NetworkImage(
                                        b.thumb.isNotEmpty ? b.thumb : b.imageUrl),
                                    fit: BoxFit.cover,
                                  ),
                                ),
                                child: Align(
                                  alignment: Alignment.bottomLeft,
                                  child: Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 6, vertical: 3),
                                    margin: const EdgeInsets.all(6),
                                    decoration: BoxDecoration(
                                      color: Colors.black.withValues(alpha: 0.55),
                                      borderRadius: BorderRadius.circular(6),
                                    ),
                                    child: Text(
                                      b.isFree ? 'FREE' : '${b.price}💰',
                                      style: const TextStyle(
                                          color: Colors.white,
                                          fontSize: 10,
                                          fontWeight: FontWeight.w700),
                                    ),
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Bg {
  _Bg({
    required this.id,
    required this.name,
    required this.imageUrl,
    required this.thumb,
    required this.isFree,
    required this.price,
  });
  final String id;
  final String name;
  final String imageUrl;
  final String thumb;
  final bool isFree;
  final int price;
}
