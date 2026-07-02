import 'package:flutter/material.dart';

/// Flutter port of `EntryBannerAnimation.tsx` — premium car/dragon-style
/// full-width entry banner for VIP/high-level users (table: `entry_banners`).
/// Plays a horizontal sweep across the screen with vehicle image + username
/// nameplate. Total 4.2s (0.6s in-slide, 3.0s hold, 0.6s out-slide).
///
/// Real vehicle animations use VAP/SVGA/MP4 via NativeGiftAnimation on
/// Android. This widget is the pure-Flutter web-parity fallback used when
/// native effects are OFF or unavailable.
class EntryBannerData {
  final String userName;
  final int level;
  final String bannerImageUrl; // vehicle/car artwork (transparent PNG or webp)
  final String? soundUrl;
  final List<Color>? plateGradient;

  const EntryBannerData({
    required this.userName,
    required this.level,
    required this.bannerImageUrl,
    this.soundUrl,
    this.plateGradient,
  });
}

class EntryBannerAnimation extends StatefulWidget {
  final EntryBannerData data;
  final VoidCallback? onComplete;
  const EntryBannerAnimation({
    super.key,
    required this.data,
    this.onComplete,
  });

  static OverlayEntry show(BuildContext context, EntryBannerData data) {
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => EntryBannerAnimation(
        data: data,
        onComplete: () {
          try {
            entry.remove();
          } catch (_) {}
        },
      ),
    );
    Overlay.of(context).insert(entry);
    return entry;
  }

  @override
  State<EntryBannerAnimation> createState() => _EntryBannerAnimationState();
}

class _EntryBannerAnimationState extends State<EntryBannerAnimation>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ac;

  static const _totalMs = 4200;
  static const _inMs = 600;
  static const _outMs = 600;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: _totalMs),
    )..forward();
    _ac.addStatusListener((s) {
      if (s == AnimationStatus.completed) widget.onComplete?.call();
    });
  }

  @override
  void dispose() {
    _ac.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;
    return AnimatedBuilder(
      animation: _ac,
      builder: (_, __) {
        final ms = _ac.value * _totalMs;
        double x;
        if (ms < _inMs) {
          final k = Curves.easeOutCubic.transform(ms / _inMs);
          x = size.width * (1 - k);
        } else if (ms > _totalMs - _outMs) {
          final k = Curves.easeInCubic
              .transform((ms - (_totalMs - _outMs)) / _outMs);
          x = -size.width * k;
        } else {
          x = 0;
        }
        final grad = widget.data.plateGradient ??
            const [Color(0xFFF59E0B), Color(0xFFEF4444), Color(0xFFEC4899)];
        return Positioned(
          top: size.height * 0.32,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Transform.translate(
              offset: Offset(x, 0),
              child: SizedBox(
                height: 96,
                child: Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.centerLeft,
                  children: [
                    Positioned.fill(
                      child: Image.network(
                        widget.data.bannerImageUrl,
                        fit: BoxFit.contain,
                        alignment: Alignment.centerLeft,
                        errorBuilder: (_, __, ___) =>
                            const SizedBox.shrink(),
                      ),
                    ),
                    Positioned(
                      left: 96,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 6),
                        decoration: BoxDecoration(
                          gradient: LinearGradient(colors: grad),
                          borderRadius: BorderRadius.circular(999),
                          boxShadow: [
                            BoxShadow(
                                color: grad.first.withOpacity(0.55),
                                blurRadius: 20,
                                spreadRadius: 1),
                          ],
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 5, vertical: 1),
                              decoration: BoxDecoration(
                                color: Colors.black26,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: Text('Lv${widget.data.level}',
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 10,
                                      fontWeight: FontWeight.w800)),
                            ),
                            const SizedBox(width: 6),
                            ConstrainedBox(
                              constraints:
                                  const BoxConstraints(maxWidth: 180),
                              child: Text(widget.data.userName,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      color: Colors.white,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w800)),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}
