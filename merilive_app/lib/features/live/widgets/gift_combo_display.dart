import 'package:flutter/material.dart';

/// Flutter port of `GiftComboDisplay.tsx` — floating counter for sequential
/// same-gift sends by a single sender. Auto-increments while combo window is
/// open (3s from last send), then fades. Number scales with each increment.
class GiftComboEntry {
  final String key; // sender+gift id
  final String senderName;
  final String? senderAvatarUrl;
  final String giftName;
  final String? giftImageUrl;
  int count;
  DateTime lastAt;

  GiftComboEntry({
    required this.key,
    required this.senderName,
    required this.giftName,
    required this.count,
    required this.lastAt,
    this.senderAvatarUrl,
    this.giftImageUrl,
  });
}

class GiftComboController extends ChangeNotifier {
  final Map<String, GiftComboEntry> entries = {};

  void increment({
    required String senderId,
    required String giftId,
    required String senderName,
    String? senderAvatarUrl,
    required String giftName,
    String? giftImageUrl,
    int by = 1,
  }) {
    final key = '$senderId::$giftId';
    final e = entries[key];
    final now = DateTime.now();
    if (e == null) {
      entries[key] = GiftComboEntry(
        key: key,
        senderName: senderName,
        senderAvatarUrl: senderAvatarUrl,
        giftName: giftName,
        giftImageUrl: giftImageUrl,
        count: by,
        lastAt: now,
      );
    } else {
      e.count += by;
      e.lastAt = now;
    }
    notifyListeners();
    _scheduleSweep();
  }

  bool _sweeping = false;
  Future<void> _scheduleSweep() async {
    if (_sweeping) return;
    _sweeping = true;
    while (entries.isNotEmpty) {
      await Future.delayed(const Duration(milliseconds: 500));
      final now = DateTime.now();
      final removed = <String>[];
      entries.forEach((k, v) {
        if (now.difference(v.lastAt).inMilliseconds > 3000) removed.add(k);
      });
      for (final k in removed) {
        entries.remove(k);
      }
      if (removed.isNotEmpty) notifyListeners();
    }
    _sweeping = false;
  }
}

class GiftComboDisplay extends StatelessWidget {
  final GiftComboController controller;
  const GiftComboDisplay({super.key, required this.controller});

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (_, __) {
        final list = controller.entries.values.toList()
          ..sort((a, b) => b.lastAt.compareTo(a.lastAt));
        if (list.isEmpty) return const SizedBox.shrink();
        return Positioned(
          left: 12,
          bottom: 220,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: list.take(3).map(_row).toList(),
          ),
        );
      },
    );
  }

  Widget _row(GiftComboEntry e) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [
            Color(0xFFEC4899),
            Color(0xFFF59E0B),
          ]),
          borderRadius: BorderRadius.circular(999),
          boxShadow: [
            BoxShadow(
                color: const Color(0xFFEC4899).withOpacity(0.5),
                blurRadius: 16,
                spreadRadius: 1),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
                radius: 12,
                backgroundColor: Colors.white24,
                backgroundImage: (e.senderAvatarUrl != null &&
                        e.senderAvatarUrl!.isNotEmpty)
                    ? NetworkImage(e.senderAvatarUrl!)
                    : null),
            const SizedBox(width: 6),
            if (e.giftImageUrl != null)
              Image.network(e.giftImageUrl!,
                  width: 22,
                  height: 22,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink()),
            const SizedBox(width: 6),
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 1.4, end: 1.0),
              duration: const Duration(milliseconds: 260),
              curve: Curves.easeOutBack,
              builder: (_, s, child) =>
                  Transform.scale(scale: s, child: child),
              child: Text('x${e.count}',
                  style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w900,
                      fontSize: 16,
                      shadows: [
                        Shadow(color: Colors.black26, blurRadius: 4)
                      ])),
            ),
          ],
        ),
      ),
    );
  }
}
