import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../data/promo_models.dart';
import '../promo_coordinator.dart';

/// Full-screen event popup — 1:1 with `EventPopupBanner.tsx`.
///
/// • Fills entire viewport (BoxFit.cover).
/// • Skip button appears after `skipDelaySeconds`.
/// • Auto-dismisses after `autoDismissSeconds` (0 → never).
/// • Marks itself as the top-priority interstitial via [PromoCoordinator]
///   so the rating promo waits until it clears.
class EventPopupOverlay extends StatefulWidget {
  const EventPopupOverlay({
    super.key,
    required this.banner,
    required this.onDismissed,
  });

  final EventPopupBannerRow banner;
  final VoidCallback onDismissed;

  @override
  State<EventPopupOverlay> createState() => _EventPopupOverlayState();
}

class _EventPopupOverlayState extends State<EventPopupOverlay> {
  int _elapsed = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    PromoCoordinator.instance.markEventPopupActive();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _elapsed += 1);
      final ad = widget.banner.autoDismissSeconds;
      if (ad > 0 && _elapsed >= ad) _dismiss();
    });
  }

  void _dismiss() {
    _timer?.cancel();
    _timer = null;
    PromoCoordinator.instance.markEventPopupDismissed();
    widget.onDismissed();
  }

  @override
  void dispose() {
    _timer?.cancel();
    // Safety net — if the widget is torn down without a normal dismiss,
    // still clear the "active" flag so the rating promo isn't blocked.
    if (PromoCoordinator.instance.eventPopupActive) {
      PromoCoordinator.instance.markEventPopupDismissed();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final b = widget.banner;
    final canSkip = _elapsed >= b.skipDelaySeconds;
    final remaining = b.autoDismissSeconds > 0
        ? (b.autoDismissSeconds - _elapsed).clamp(0, b.autoDismissSeconds)
        : null;

    return Material(
      color: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          if (b.isVideo)
            const ColoredBox(color: Colors.black) // Video: unsupported in H6
          else
            CachedNetworkImage(
              imageUrl: b.imageUrl,
              fit: BoxFit.cover,
              placeholder: (_, __) => const ColoredBox(color: Colors.black),
              errorWidget: (_, __, ___) =>
                  const ColoredBox(color: Colors.black),
            ),
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            right: 14,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (remaining != null && !canSkip)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.45),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${remaining}s',
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 12,
                      ),
                    ),
                  ),
                const SizedBox(width: 8),
                AnimatedOpacity(
                  duration: const Duration(milliseconds: 200),
                  opacity: canSkip ? 1 : 0.35,
                  child: IconButton(
                    onPressed: canSkip
                        ? () {
                            HapticFeedback.selectionClick();
                            _dismiss();
                          }
                        : null,
                    style: IconButton.styleFrom(
                      backgroundColor: Colors.black.withOpacity(0.55),
                      shape: const CircleBorder(),
                    ),
                    icon: const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
