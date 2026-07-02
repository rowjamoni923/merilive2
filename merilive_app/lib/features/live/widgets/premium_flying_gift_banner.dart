import 'package:flutter/material.dart';

/// Flutter port of `PremiumFlyingGiftBanner.tsx` — top-of-screen flying banner
/// that celebrates high-value gift sends (>=100 coins). Slides in from right,
/// pauses 2.4s, slides out to left. Colors tier by gift value.
class PremiumFlyingGift {
  final String senderName;
  final String? senderAvatarUrl;
  final String giftName;
  final String? giftImageUrl;
  final int giftValue;
  final int count;

  const PremiumFlyingGift({
    required this.senderName,
    required this.giftName,
    required this.giftValue,
    this.senderAvatarUrl,
    this.giftImageUrl,
    this.count = 1,
  });
}

class PremiumFlyingGiftBannerController extends ChangeNotifier {
  final List<PremiumFlyingGift> _q = [];
  PremiumFlyingGift? current;

  void push(PremiumFlyingGift g) {
    _q.add(g);
    if (current == null) _pop();
  }

  Future<void> _pop() async {
    if (_q.isEmpty) {
      current = null;
      notifyListeners();
      return;
    }
    current = _q.removeAt(0);
    notifyListeners();
    await Future.delayed(const Duration(milliseconds: 3120)); // in+hold+out
    _pop();
  }
}

class PremiumFlyingGiftBanner extends StatefulWidget {
  final PremiumFlyingGiftBannerController controller;
  const PremiumFlyingGiftBanner({super.key, required this.controller});

  @override
  State<PremiumFlyingGiftBanner> createState() =>
      _PremiumFlyingGiftBannerState();
}

class _PremiumFlyingGiftBannerState extends State<PremiumFlyingGiftBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 3120));
    widget.controller.addListener(_onChange);
  }

  void _onChange() {
    if (widget.controller.current != null) {
      _ac.forward(from: 0);
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onChange);
    _ac.dispose();
    super.dispose();
  }

  List<Color> _tier(int v) {
    if (v >= 5000) {
      return const [Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFFEC4899)];
    }
    if (v >= 1000) {
      return const [Color(0xFF8B5CF6), Color(0xFFEC4899)];
    }
    return const [Color(0xFF3B82F6), Color(0xFF06B6D4)];
  }

  @override
  Widget build(BuildContext context) {
    final g = widget.controller.current;
    if (g == null) return const SizedBox.shrink();
    final grad = _tier(g.giftValue);
    return AnimatedBuilder(
      animation: _ac,
      builder: (_, __) {
        final t = _ac.value;
        double x;
        if (t < 0.13) {
          x = (1 - (t / 0.13)) * 400;
        } else if (t > 0.87) {
          final k = (t - 0.87) / 0.13;
          x = -k * 400;
        } else {
          x = 0;
        }
        final opacity = (t < 0.05)
            ? t / 0.05
            : (t > 0.95 ? (1 - (t - 0.95) / 0.05) : 1.0);
        return Positioned(
          top: 90,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Center(
              child: Opacity(
                opacity: opacity.clamp(0, 1),
                child: Transform.translate(
                  offset: Offset(x, 0),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 10),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: grad),
                      borderRadius: BorderRadius.circular(999),
                      boxShadow: [
                        BoxShadow(
                            color: grad.first.withOpacity(0.55),
                            blurRadius: 24,
                            spreadRadius: 2),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircleAvatar(
                            radius: 14,
                            backgroundColor: Colors.white24,
                            backgroundImage: (g.senderAvatarUrl != null &&
                                    g.senderAvatarUrl!.isNotEmpty)
                                ? NetworkImage(g.senderAvatarUrl!)
                                : null),
                        const SizedBox(width: 8),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 90),
                          child: Text(g.senderName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w700,
                                  fontSize: 13)),
                        ),
                        const SizedBox(width: 6),
                        const Text('sent',
                            style: TextStyle(
                                color: Colors.white70, fontSize: 12)),
                        const SizedBox(width: 6),
                        if (g.giftImageUrl != null)
                          Image.network(g.giftImageUrl!,
                              width: 24, height: 24, errorBuilder: (_, __, ___) => const SizedBox.shrink()),
                        const SizedBox(width: 4),
                        Text(g.giftName,
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w800,
                                fontSize: 13)),
                        if (g.count > 1) ...[
                          const SizedBox(width: 6),
                          Text('x${g.count}',
                              style: const TextStyle(
                                  color: Color(0xFFFDE68A),
                                  fontWeight: FontWeight.w900,
                                  fontSize: 14)),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
