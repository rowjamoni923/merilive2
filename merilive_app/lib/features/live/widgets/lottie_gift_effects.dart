import 'package:flutter/material.dart';

/// Flutter port of `LottieGiftEffects.tsx` — fullscreen or centered Lottie
/// overlay that plays for premium gifts. On Android the real playback is
/// delegated to NativeGiftAnimation (VAP/SVGA/Lottie). This widget is the
/// pure-Flutter fallback that shows a scale-in image burst + optional
/// caption. Auto-dismiss after [durationMs].
class LottieGiftEffectData {
  final String giftName;
  final String iconUrl;
  final int durationMs;
  final int value; // Diamond value
  final String senderName;
  final int count;

  const LottieGiftEffectData({
    required this.giftName,
    required this.iconUrl,
    required this.senderName,
    this.durationMs = 2600,
    this.value = 0,
    this.count = 1,
  });
}

class LottieGiftEffects extends StatefulWidget {
  final LottieGiftEffectData data;
  final VoidCallback? onComplete;
  const LottieGiftEffects({
    super.key,
    required this.data,
    this.onComplete,
  });

  static OverlayEntry show(BuildContext context, LottieGiftEffectData data) {
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => LottieGiftEffects(
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
  State<LottieGiftEffects> createState() => _LottieGiftEffectsState();
}

class _LottieGiftEffectsState extends State<LottieGiftEffects>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ac;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(
        vsync: this,
        duration: Duration(milliseconds: widget.data.durationMs))
      ..forward();
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
    return Positioned.fill(
      child: IgnorePointer(
        child: AnimatedBuilder(
          animation: _ac,
          builder: (_, __) {
            final t = _ac.value;
            final scale = t < 0.25
                ? Curves.easeOutBack.transform(t / 0.25) * 1.0
                : (t > 0.85
                    ? 1 - Curves.easeInCubic.transform((t - 0.85) / 0.15) * 0.3
                    : 1.0);
            final opacity = t < 0.08
                ? t / 0.08
                : (t > 0.9 ? (1 - (t - 0.9) / 0.1) : 1.0);
            return Center(
              child: Opacity(
                opacity: opacity.clamp(0, 1),
                child: Transform.scale(
                  scale: 0.6 + scale * 0.6,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 220,
                        height: 220,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          gradient: RadialGradient(colors: [
                            const Color(0xFFF59E0B).withOpacity(0.45),
                            const Color(0xFFEC4899).withOpacity(0.15),
                            Colors.transparent,
                          ]),
                        ),
                        child: Center(
                          child: Image.network(
                            widget.data.iconUrl,
                            width: 150,
                            height: 150,
                            fit: BoxFit.contain,
                            errorBuilder: (_, __, ___) => const Icon(
                                Icons.card_giftcard,
                                color: Colors.white,
                                size: 120),
                          ),
                        ),
                      ),
                      const SizedBox(height: 16),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 6),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(colors: [
                            Color(0xFFEC4899),
                            Color(0xFFF59E0B),
                          ]),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Text(
                          widget.data.count > 1
                              ? '${widget.data.senderName} · ${widget.data.giftName} × ${widget.data.count}'
                              : '${widget.data.senderName} · ${widget.data.giftName}',
                          style: const TextStyle(
                              color: Colors.white,
                              fontSize: 13,
                              fontWeight: FontWeight.w800),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
