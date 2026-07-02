import 'dart:async';

import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/party_room_repository.dart';

/// M4 — Admin-managed party banners strip.
///
/// Web-truth reference: `party_room_banners` table + `PartyBannerCarousel`.
/// Auto-scrolls every 5 seconds when there are multiple banners.
class PartyBannersStrip extends StatefulWidget {
  const PartyBannersStrip({super.key});

  @override
  State<PartyBannersStrip> createState() => _PartyBannersStripState();
}

class _PartyBannersStripState extends State<PartyBannersStrip> {
  final _repo = PartyRoomRepository(Supabase.instance.client);
  final _ctrl = PageController();
  List<Map<String, dynamic>> _items = const [];
  Timer? _timer;
  int _idx = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = await _repo.loadPartyBanners();
      if (!mounted) return;
      setState(() => _items = rows);
      if (_items.length > 1) {
        _timer = Timer.periodic(const Duration(seconds: 5), (_) {
          if (!mounted || !_ctrl.hasClients) return;
          _idx = (_idx + 1) % _items.length;
          _ctrl.animateToPage(
            _idx,
            duration: const Duration(milliseconds: 400),
            curve: Curves.easeOut,
          );
        });
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _timer?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_items.isEmpty) return const SizedBox.shrink();
    return SizedBox(
      height: 56,
      child: PageView.builder(
        controller: _ctrl,
        itemCount: _items.length,
        itemBuilder: (_, i) {
          final b = _items[i];
          final img = b['image_url']?.toString();
          final title = b['title']?.toString() ?? '';
          return Container(
            margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              gradient: const LinearGradient(
                colors: [Color(0xFF4C1D95), Color(0xFF831843)],
              ),
              image: (img != null && img.isNotEmpty)
                  ? DecorationImage(
                      image: NetworkImage(img),
                      fit: BoxFit.cover,
                      colorFilter: ColorFilter.mode(
                        Colors.black.withOpacity(0.25),
                        BlendMode.darken,
                      ),
                    )
                  : null,
            ),
            alignment: Alignment.centerLeft,
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Text(
              title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.w700,
              ),
            ),
          );
        },
      ),
    );
  }
}
