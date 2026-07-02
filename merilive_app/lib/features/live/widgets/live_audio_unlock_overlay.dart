// Pkg201 parity — "Tap to enable sound" overlay.
//
// Flutter port of `src/components/live/AudioUnlockOverlay.tsx`. On Android/iOS
// native media playback is rarely blocked, but LiveKit remote audio tracks can
// still fail to auto-start in background/silent-mode edge cases. This overlay
// exposes the same UX contract as the web component: parent sets [blocked]
// true when playback is denied; user taps to retry; parent flips [blocked]
// false when resumption succeeds.

import 'package:flutter/material.dart';

class LiveAudioUnlockOverlay extends StatefulWidget {
  const LiveAudioUnlockOverlay({
    super.key,
    required this.blocked,
    required this.onUnlock,
  });

  final bool blocked;
  final Future<void> Function() onUnlock;

  @override
  State<LiveAudioUnlockOverlay> createState() => _LiveAudioUnlockOverlayState();
}

class _LiveAudioUnlockOverlayState extends State<LiveAudioUnlockOverlay>
    with SingleTickerProviderStateMixin {
  bool _busy = false;
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  Future<void> _handleTap() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await widget.onUnlock();
    } catch (_) {
      // Swallow — parent decides when to clear `blocked`.
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 180),
      child: !widget.blocked
          ? const SizedBox.shrink()
          : Positioned.fill(
              key: const ValueKey('audio-unlock-overlay'),
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: _handleTap,
                child: Container(
                  color: Colors.black.withOpacity(0.55),
                  alignment: Alignment.center,
                  child: TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0.9, end: 1),
                    duration: const Duration(milliseconds: 240),
                    curve: Curves.easeOutBack,
                    builder: (context, scale, child) =>
                        Transform.scale(scale: scale, child: child),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 28,
                        vertical: 24,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [
                            Colors.white.withOpacity(0.10),
                            Colors.white.withOpacity(0.05),
                          ],
                        ),
                        border: Border.all(
                          color: Colors.white.withOpacity(0.15),
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: const Color(0xFFEC4899).withOpacity(0.25),
                            blurRadius: 60,
                            offset: const Offset(0, 18),
                          ),
                        ],
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          AnimatedBuilder(
                            animation: _pulse,
                            builder: (context, _) {
                              final s = 1 + (_pulse.value * 0.08);
                              return Transform.scale(
                                scale: s,
                                child: Container(
                                  width: 56,
                                  height: 56,
                                  decoration: BoxDecoration(
                                    borderRadius: BorderRadius.circular(16),
                                    gradient: const LinearGradient(
                                      begin: Alignment.topLeft,
                                      end: Alignment.bottomRight,
                                      colors: [
                                        Color(0xFFEC4899),
                                        Color(0xFFA855F7),
                                      ],
                                    ),
                                    boxShadow: [
                                      BoxShadow(
                                        color: const Color(0xFFEC4899)
                                            .withOpacity(0.55),
                                        blurRadius: 22,
                                      ),
                                    ],
                                  ),
                                  child: const Icon(
                                    Icons.volume_up_rounded,
                                    color: Colors.white,
                                    size: 28,
                                  ),
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: 12),
                          Text(
                            _busy ? 'Enabling sound…' : 'Tap to enable sound',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 6),
                          const SizedBox(
                            width: 240,
                            child: Text(
                              'Your phone blocked autoplay. Tap anywhere to start hearing the host.',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.white70,
                                fontSize: 12,
                                height: 1.4,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}
