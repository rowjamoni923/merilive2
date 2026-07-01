import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// Full-screen rating promo — 1:1 with `FullScreenPromoBanners.tsx` rating
/// variant. Tap → opens Play Store listing and flags a "return pending"
/// signal so the proof-upload dialog can open when the user comes back
/// (proof upload dialog itself is deferred to a later step).
class RatingRewardOverlay extends StatefulWidget {
  const RatingRewardOverlay({
    super.key,
    required this.imageUrl,
    required this.onDismissed,
    required this.onOpenStore,
  });

  final String imageUrl;
  final VoidCallback onDismissed;
  final VoidCallback onOpenStore;

  static const skipDelay = Duration(seconds: 3);
  static const autoClose = Duration(seconds: 10);

  @override
  State<RatingRewardOverlay> createState() => _RatingRewardOverlayState();
}

class _RatingRewardOverlayState extends State<RatingRewardOverlay> {
  int _countdown = RatingRewardOverlay.skipDelay.inSeconds;
  Timer? _tick;
  Timer? _autoClose;

  @override
  void initState() {
    super.initState();
    _tick = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_countdown > 0) _countdown -= 1;
      });
    });
    _autoClose = Timer(RatingRewardOverlay.autoClose, () {
      if (mounted) widget.onDismissed();
    });
  }

  @override
  void dispose() {
    _tick?.cancel();
    _autoClose?.cancel();
    super.dispose();
  }

  Future<void> _openStore() async {
    HapticFeedback.mediumImpact();
    widget.onOpenStore();
  }

  @override
  Widget build(BuildContext context) {
    final canSkip = _countdown <= 0;
    return Material(
      color: Colors.black,
      child: Stack(
        fit: StackFit.expand,
        children: [
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _openStore,
            child: CachedNetworkImage(
              imageUrl: widget.imageUrl,
              fit: BoxFit.cover,
              placeholder: (_, __) => const ColoredBox(color: Colors.black),
              errorWidget: (_, __, ___) =>
                  const ColoredBox(color: Colors.black),
            ),
          ),
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            right: 14,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (!canSkip)
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.45),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '${_countdown}s',
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
                            widget.onDismissed();
                          }
                        : null,
                    style: IconButton.styleFrom(
                      backgroundColor: Colors.black.withOpacity(0.55),
                      shape: const CircleBorder(),
                    ),
                    icon:
                        const Icon(Icons.close_rounded, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: MediaQuery.of(context).padding.bottom + 28,
            child: Center(
              child: ElevatedButton.icon(
                onPressed: _openStore,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.white,
                  foregroundColor: const Color(0xFF0F172A),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 22, vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(30),
                  ),
                  elevation: 6,
                ),
                icon: const Icon(Icons.star_rounded,
                    color: Color(0xFFF59E0B)),
                label: const Text(
                  'Rate us on Play Store',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Utility for the promo host — encapsulates the Play Store URL launch +
/// pending-return flag. `flutter_secure_storage` isn't needed: a plain
/// in-memory flag is enough for this session, matching the web
/// `RATING_PENDING_KEY` behavior for the app-resume rehydrate path.
class RatingReturnFlag {
  static bool pending = false;
  static Future<void> openPlayStoreAndMark() async {
    pending = true;
    final uri = Uri.parse(
        'https://play.google.com/store/apps/details?id=com.merilive.app');
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {/* swallow */}
  }
}
