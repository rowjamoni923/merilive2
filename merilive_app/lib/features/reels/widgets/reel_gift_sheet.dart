// R7 — Reels gift sheet (Chamet/Bigo-class quick send).
//
// Reads the live `gifts` catalog + user coin balance, groups by category,
// lets the sender pick a gift + quantity chip (1/10/49/99/199/999) and fires
// the atomic `gift-service` edge function via ReelsGiftRepository.sendGift so
// billing, host-percent split and realtime dispatch stay identical to the web
// GiftingService. Optimistic cached gift bump keeps the sheet snappy.

import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../data/reels_gift_repository.dart';
import '../data/reels_models.dart';

Future<void> showReelGiftSheet({
  required BuildContext context,
  required Reel reel,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black54,
    builder: (_) => _ReelGiftSheet(reel: reel),
  );
}

const List<int> _quantityPresets = [1, 10, 49, 99, 199, 999];

class _ReelGiftSheet extends StatefulWidget {
  const _ReelGiftSheet({required this.reel});
  final Reel reel;

  @override
  State<_ReelGiftSheet> createState() => _ReelGiftSheetState();
}

class _ReelGiftSheetState extends State<_ReelGiftSheet> {
  late final ReelsGiftRepository _repo;
  late final String? _uid;

  List<ReelGift> _all = const [];
  List<String> _categories = const ['all'];
  String _activeCategory = 'all';
  ReelGift? _selected;
  int _quantity = 1;
  int _balance = 0;
  bool _loading = true;
  bool _sending = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _repo = ReelsGiftRepository(Supabase.instance.client);
    _uid = Supabase.instance.client.auth.currentUser?.id;
    _load();
  }

  Future<void> _load() async {
    try {
      final results = await Future.wait([
        _repo.fetchGifts(),
        _uid == null ? Future.value(0) : _repo.fetchBalance(_uid!),
      ]);
      final gifts = results[0] as List<ReelGift>;
      final bal = results[1] as int;
      final cats = <String>{'all'};
      for (final g in gifts) {
        if (g.category.isNotEmpty) cats.add(g.category);
      }
      if (!mounted) return;
      setState(() {
        _all = gifts;
        _categories = cats.toList(growable: false);
        _selected = gifts.isNotEmpty ? gifts.first : null;
        _balance = bal;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  List<ReelGift> get _visibleGifts => _activeCategory == 'all'
      ? _all
      : _all.where((g) => g.category == _activeCategory).toList(growable: false);

  int get _totalCost => (_selected?.coins ?? 0) * _quantity;

  Future<void> _send() async {
    final gift = _selected;
    if (gift == null || _uid == null || _sending) return;
    if (_totalCost > _balance) {
      _showToast('Not enough coins');
      return;
    }
    setState(() => _sending = true);
    final res = await _repo.sendGift(
      reelId: widget.reel.id,
      receiverId: widget.reel.userId,
      giftId: gift.id,
      quantity: _quantity,
    );
    if (!mounted) return;
    setState(() {
      _sending = false;
      if (res.success) {
        _balance = res.newBalance ?? (_balance - (res.coinsSpent ?? _totalCost));
      }
    });
    if (res.success) {
      _showToast('Sent ${gift.name} × $_quantity');
    } else {
      _showToast(res.error ?? 'Gift failed');
    }
  }

  void _showToast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg),
        duration: const Duration(milliseconds: 1400),
        behavior: SnackBarBehavior.floating,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return SafeArea(
      top: false,
      child: Container(
        height: size.height * 0.62,
        decoration: const BoxDecoration(
          color: Color(0xFF12131A),
          borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        ),
        child: Column(
          children: [
            const SizedBox(height: 8),
            Container(
              width: 42,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 10),
            _header(),
            const SizedBox(height: 8),
            _categoryTabs(),
            const Divider(height: 1, color: Colors.white10),
            Expanded(child: _body()),
            const Divider(height: 1, color: Colors.white10),
            _sendBar(),
          ],
        ),
      ),
    );
  }

  Widget _header() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          const Text(
            'Send a Gift',
            style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w600),
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: Colors.white10,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.diamond, size: 14, color: Color(0xFF7CC0FF)),
                const SizedBox(width: 6),
                Text(
                  _formatCount(_balance),
                  style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _categoryTabs() {
    return SizedBox(
      height: 36,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 12),
        itemCount: _categories.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, i) {
          final c = _categories[i];
          final active = c == _activeCategory;
          return GestureDetector(
            onTap: () => setState(() => _activeCategory = c),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: active ? Colors.white : Colors.white10,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                _titleize(c),
                style: TextStyle(
                  color: active ? Colors.black : Colors.white70,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(color: Colors.white70, strokeWidth: 2));
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Text('Failed to load gifts\n$_error',
              textAlign: TextAlign.center, style: const TextStyle(color: Colors.white54)),
        ),
      );
    }
    final gifts = _visibleGifts;
    if (gifts.isEmpty) {
      return const Center(
        child: Text('No gifts in this category', style: TextStyle(color: Colors.white54)),
      );
    }
    return GridView.builder(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,
        mainAxisSpacing: 10,
        crossAxisSpacing: 8,
        childAspectRatio: 0.78,
      ),
      itemCount: gifts.length,
      itemBuilder: (_, i) {
        final g = gifts[i];
        final selected = _selected?.id == g.id;
        return GestureDetector(
          onTap: () => setState(() => _selected = g),
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 140),
            decoration: BoxDecoration(
              color: selected ? Colors.white12 : Colors.transparent,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: selected ? const Color(0xFF7CC0FF) : Colors.transparent,
                width: 1.5,
              ),
            ),
            padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 4),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Expanded(
                  child: (g.iconUrl != null && g.iconUrl!.isNotEmpty)
                      ? CachedNetworkImage(
                          imageUrl: g.iconUrl!,
                          fit: BoxFit.contain,
                          errorWidget: (_, __, ___) =>
                              const Icon(Icons.card_giftcard, color: Colors.white54, size: 28),
                        )
                      : const Icon(Icons.card_giftcard, color: Colors.white54, size: 28),
                ),
                const SizedBox(height: 4),
                Text(
                  g.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white, fontSize: 11),
                ),
                const SizedBox(height: 2),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.diamond, size: 10, color: Color(0xFF7CC0FF)),
                    const SizedBox(width: 3),
                    Text(
                      _formatCount(g.coins),
                      style: const TextStyle(
                          color: Color(0xFF7CC0FF), fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _sendBar() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
      child: Row(
        children: [
          Expanded(
            child: SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: _quantityPresets.length,
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemBuilder: (_, i) {
                  final q = _quantityPresets[i];
                  final active = q == _quantity;
                  return GestureDetector(
                    onTap: () => setState(() => _quantity = q),
                    child: Container(
                      alignment: Alignment.center,
                      width: 46,
                      decoration: BoxDecoration(
                        color: active ? const Color(0xFF7CC0FF) : Colors.white10,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        '×$q',
                        style: TextStyle(
                          color: active ? Colors.black : Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ),
          const SizedBox(width: 10),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFFF3D6E),
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
            ),
            onPressed: (_selected == null || _sending) ? null : _send,
            child: _sending
                ? const SizedBox(
                    width: 16, height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : Text(
                    _totalCost > 0 ? 'Send · ${_formatCount(_totalCost)}' : 'Send',
                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                  ),
          ),
        ],
      ),
    );
  }

  String _titleize(String v) {
    if (v.isEmpty) return v;
    return v[0].toUpperCase() + v.substring(1);
  }

  String _formatCount(int v) {
    if (v >= 1000000) return '${(v / 1000000).toStringAsFixed(1)}M';
    if (v >= 1000) return '${(v / 1000).toStringAsFixed(1)}K';
    return '$v';
  }
}
