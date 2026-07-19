import 'package:flutter/material.dart';

/// Flutter port of `GiftPanel.tsx` + `GiftSwipeableGrid.tsx` — bottom sheet
/// gift picker. Tabs across categories, swipeable 8-per-page grid, Diamond
/// balance chip, quick "Send" with optional 1/10/99 combo count.
class GiftPanelItem {
  final String id;
  final String name;
  final String iconUrl;
  final int diamonds;
  final String category;
  final bool premium;
  const GiftPanelItem({
    required this.id,
    required this.name,
    required this.iconUrl,
    required this.diamonds,
    required this.category,
    this.premium = false,
  });
}

class GiftPanel extends StatefulWidget {
  final List<GiftPanelItem> gifts;
  final int diamondBalance;
  final void Function(GiftPanelItem gift, int count) onSend;
  final VoidCallback onRecharge;

  const GiftPanel({
    super.key,
    required this.gifts,
    required this.diamondBalance,
    required this.onSend,
    required this.onRecharge,
  });

  static Future<void> show(
    BuildContext context, {
    required List<GiftPanelItem> gifts,
    required int diamondBalance,
    required void Function(GiftPanelItem, int) onSend,
    required VoidCallback onRecharge,
  }) {
    return showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF0F172A),
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => GiftPanel(
        gifts: gifts,
        diamondBalance: diamondBalance,
        onSend: onSend,
        onRecharge: onRecharge,
      ),
    );
  }

  @override
  State<GiftPanel> createState() => _GiftPanelState();
}

class _GiftPanelState extends State<GiftPanel> {
  int _tab = 0;
  int _selected = -1;
  int _count = 1;
  late final List<String> _categories;

  @override
  void initState() {
    super.initState();
    _categories = _uniqueCategories();
  }

  List<String> _uniqueCategories() {
    final s = <String>{};
    for (final g in widget.gifts) {
      s.add(g.category);
    }
    return s.toList();
  }

  List<GiftPanelItem> get _visible =>
      widget.gifts.where((g) => g.category == _categories[_tab]).toList();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              margin: const EdgeInsets.only(top: 8, bottom: 8),
              decoration: BoxDecoration(
                color: Colors.white24,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            // tabs
            SizedBox(
              height: 34,
              child: ListView.separated(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                scrollDirection: Axis.horizontal,
                itemBuilder: (_, i) {
                  final active = _tab == i;
                  return GestureDetector(
                    onTap: () => setState(() {
                      _tab = i;
                      _selected = -1;
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: active
                            ? const Color(0xFFEC4899)
                            : Colors.white.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(_categories[i],
                          style: TextStyle(
                              color: active
                                  ? Colors.white
                                  : Colors.white70,
                              fontSize: 12,
                              fontWeight: FontWeight.w700)),
                    ),
                  );
                },
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemCount: _categories.length,
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 320,
              child: GridView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 12),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 4,
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 0.82,
                ),
                itemCount: _visible.length,
                itemBuilder: (_, i) {
                  final g = _visible[i];
                  final active = _selected == i;
                  return GestureDetector(
                    onTap: () => setState(() => _selected = i),
                    child: Container(
                      decoration: BoxDecoration(
                        color: active
                            ? const Color(0xFF1E293B)
                            : Colors.transparent,
                        border: Border.all(
                          color: active
                              ? const Color(0xFFEC4899)
                              : Colors.transparent,
                          width: 1.4,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      padding: const EdgeInsets.all(6),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Expanded(
                            child: Image.network(
                              g.iconUrl,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => const Icon(
                                  Icons.card_giftcard,
                                  color: Colors.white54),
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(g.name,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600)),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.monetization_on,
                                  color: Color(0xFFFDE68A), size: 10),
                              const SizedBox(width: 2),
                              Text('${g.diamonds}',
                                  style: const TextStyle(
                                      color: Color(0xFFFDE68A),
                                      fontSize: 10,
                                      fontWeight: FontWeight.w700)),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            const Divider(height: 1, color: Colors.white10),
            Padding(
              padding: const EdgeInsets.symmetric(
                  horizontal: 12, vertical: 10),
              child: Row(
                children: [
                  GestureDetector(
                    onTap: widget.onRecharge,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.monetization_on,
                              color: Color(0xFFFDE68A), size: 14),
                          const SizedBox(width: 4),
                          Text('${widget.diamondBalance}',
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 12)),
                          const SizedBox(width: 6),
                          const Icon(Icons.add,
                              color: Colors.white70, size: 14),
                        ],
                      ),
                    ),
                  ),
                  const Spacer(),
                  _comboBtn(1),
                  _comboBtn(10),
                  _comboBtn(99),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: _selected < 0
                        ? null
                        : () {
                            final g = _visible[_selected];
                            widget.onSend(g, _count);
                            Navigator.of(context).maybePop();
                          },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFEC4899),
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(999)),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 18, vertical: 10),
                    ),
                    child: const Text('Send',
                        style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _comboBtn(int c) {
    final active = _count == c;
    return Padding(
      padding: const EdgeInsets.only(right: 4),
      child: GestureDetector(
        onTap: () => setState(() => _count = c),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: active
                ? const Color(0xFFEC4899)
                : Colors.white.withOpacity(0.08),
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text('x$c',
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w800)),
        ),
      ),
    );
  }
}
