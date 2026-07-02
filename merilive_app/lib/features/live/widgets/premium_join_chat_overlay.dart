import 'package:flutter/material.dart';

/// Flutter port of `PremiumJoinChatOverlay.tsx` — inline chat-strip join
/// notification (below stacking notifications) for mid-tier viewers (Lv10-39).
/// Slides in from left, holds ~2.8s, fades out. Renders inside chat area.
class PremiumJoinChatEntry {
  final String id;
  final String userName;
  final int level;
  final String? avatarUrl;
  const PremiumJoinChatEntry({
    required this.id,
    required this.userName,
    required this.level,
    this.avatarUrl,
  });
}

class PremiumJoinChatController extends ChangeNotifier {
  final List<PremiumJoinChatEntry> visible = [];

  void push(PremiumJoinChatEntry e) {
    visible.insert(0, e);
    if (visible.length > 4) visible.removeLast();
    notifyListeners();
    Future.delayed(const Duration(milliseconds: 2800), () {
      visible.removeWhere((x) => x.id == e.id);
      notifyListeners();
    });
  }
}

class PremiumJoinChatOverlay extends StatelessWidget {
  final PremiumJoinChatController controller;
  const PremiumJoinChatOverlay({super.key, required this.controller});

  List<Color> _grad(int lv) {
    if (lv >= 30) return const [Color(0xFF8B5CF6), Color(0xFFEC4899)];
    if (lv >= 20) return const [Color(0xFF3B82F6), Color(0xFF06B6D4)];
    return const [Color(0xFF10B981), Color(0xFF06B6D4)];
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (_, __) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: controller.visible.map((e) {
            final grad = _grad(e.level);
            return Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: TweenAnimationBuilder<double>(
                key: ValueKey(e.id),
                tween: Tween(begin: 0, end: 1),
                duration: const Duration(milliseconds: 260),
                curve: Curves.easeOutCubic,
                builder: (_, v, child) => Opacity(
                  opacity: v,
                  child: Transform.translate(
                      offset: Offset(-30 * (1 - v), 0), child: child),
                ),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: grad),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircleAvatar(
                        radius: 9,
                        backgroundColor: Colors.white24,
                        backgroundImage:
                            (e.avatarUrl != null && e.avatarUrl!.isNotEmpty)
                                ? NetworkImage(e.avatarUrl!)
                                : null,
                      ),
                      const SizedBox(width: 6),
                      Text('Lv${e.level}',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 9,
                              fontWeight: FontWeight.w800)),
                      const SizedBox(width: 4),
                      ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 110),
                        child: Text(e.userName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 11,
                                fontWeight: FontWeight.w700)),
                      ),
                      const SizedBox(width: 4),
                      const Text('joined',
                          style: TextStyle(
                              color: Colors.white70, fontSize: 10)),
                    ],
                  ),
                ),
              ),
            );
          }).toList(),
        );
      },
    );
  }
}
