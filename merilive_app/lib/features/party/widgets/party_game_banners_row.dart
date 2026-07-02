import 'package:flutter/material.dart';

/// G21 — Party game banners row.
///
/// Shows a scrollable strip of quick-launch game shortcuts inside the game
/// party area. Purely presentational — tap dispatches back to the caller
/// via [onPick] so the room can open the shared game selection sheet.
class PartyGameBannersRow extends StatelessWidget {
  const PartyGameBannersRow({
    super.key,
    required this.onPick,
    this.items = _defaultItems,
  });

  final void Function(String slug) onPick;
  final List<PartyGameBannerItem> items;

  static const _defaultItems = <PartyGameBannerItem>[
    PartyGameBannerItem(
        slug: 'ludo', label: 'Ludo', color: Color(0xFFEF4444), emoji: '🎲'),
    PartyGameBannerItem(
        slug: 'roulette',
        label: 'Roulette',
        color: Color(0xFFA855F7),
        emoji: '🎡'),
    PartyGameBannerItem(
        slug: 'cards', label: 'Cards', color: Color(0xFF3B82F6), emoji: '🃏'),
    PartyGameBannerItem(
        slug: 'racing', label: 'Race', color: Color(0xFF10B981), emoji: '🏁'),
    PartyGameBannerItem(
        slug: 'quiz', label: 'Quiz', color: Color(0xFFF59E0B), emoji: '❓'),
  ];

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 46,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        itemCount: items.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final it = items[i];
          return InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: () => onPick(it.slug),
            child: Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [
                  it.color.withValues(alpha: 0.85),
                  it.color.withValues(alpha: 0.55),
                ]),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white24),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(it.emoji, style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 6),
                  Text(it.label,
                      style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class PartyGameBannerItem {
  const PartyGameBannerItem({
    required this.slug,
    required this.label,
    required this.color,
    required this.emoji,
  });
  final String slug;
  final String label;
  final Color color;
  final String emoji;
}
