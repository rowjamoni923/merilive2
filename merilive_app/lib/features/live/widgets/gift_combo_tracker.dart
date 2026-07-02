import 'package:flutter/material.dart';

/// Flutter port of `GiftComboTracker.tsx` (host-side) — bottom-right stack
/// showing top gifters in the current session. Auto-updates when new gift
/// arrives. Max 5 rows, sorted by total coins descending.
class GiftComboTrackerEntry {
  final String userId;
  final String name;
  final String? avatarUrl;
  final int totalCoins;
  final DateTime lastAt;
  const GiftComboTrackerEntry({
    required this.userId,
    required this.name,
    required this.totalCoins,
    required this.lastAt,
    this.avatarUrl,
  });
}

class GiftComboTracker extends StatelessWidget {
  final List<GiftComboTrackerEntry> entries;
  final void Function(GiftComboTrackerEntry e)? onTapEntry;

  const GiftComboTracker({
    super.key,
    required this.entries,
    this.onTapEntry,
  });

  @override
  Widget build(BuildContext context) {
    if (entries.isEmpty) return const SizedBox.shrink();
    final sorted = [...entries]
      ..sort((a, b) => b.totalCoins.compareTo(a.totalCoins));
    final visible = sorted.take(5).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      mainAxisSize: MainAxisSize.min,
      children: visible.asMap().entries.map((e) {
        final rank = e.key + 1;
        return Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: GestureDetector(
            onTap: () => onTapEntry?.call(e.value),
            child: _row(rank, e.value),
          ),
        );
      }).toList(),
    );
  }

  Widget _row(int rank, GiftComboTrackerEntry e) {
    Color rankColor;
    if (rank == 1) {
      rankColor = const Color(0xFFF59E0B);
    } else if (rank == 2) {
      rankColor = const Color(0xFF94A3B8);
    } else if (rank == 3) {
      rankColor = const Color(0xFFEA580C);
    } else {
      rankColor = Colors.white24;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.5),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: rankColor.withOpacity(0.5), width: 1),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 16,
            height: 16,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: rankColor,
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text('$rank',
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.w900)),
          ),
          const SizedBox(width: 6),
          CircleAvatar(
            radius: 9,
            backgroundColor: Colors.white24,
            backgroundImage:
                (e.avatarUrl != null && e.avatarUrl!.isNotEmpty)
                    ? NetworkImage(e.avatarUrl!)
                    : null,
          ),
          const SizedBox(width: 5),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 80),
            child: Text(e.name,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 4),
          const Icon(Icons.monetization_on,
              color: Color(0xFFFDE68A), size: 10),
          const SizedBox(width: 2),
          Text('${e.totalCoins}',
              style: const TextStyle(
                  color: Color(0xFFFDE68A),
                  fontSize: 11,
                  fontWeight: FontWeight.w800)),
        ],
      ),
    );
  }
}
