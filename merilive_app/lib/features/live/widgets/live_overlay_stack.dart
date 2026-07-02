import 'dart:async';

import 'package:flutter/material.dart';

import 'live_captions_overlay.dart' show CaptionEvent;
import 'live_widgets.dart';

/// LiveOverlayStack — single drop-in composite that mounts every Phase I
/// widget on top of the LiveKit video canvas with correct z-order, safe
/// insets, and lifecycle glue. Web parity: matches `LiveStream.tsx` overlay
/// composition (join banners > cinematics > tasks/HUD > bigo VIP > gifts >
/// captions > chat > composer).
///
/// Usage (inside `live_stream_page.dart` / `live_session_page.dart`):
/// ```dart
/// Stack(children: [
///   LiveKitVideoPlayer(...),          // or native SurfaceViewRenderer
///   LiveOverlayStack(
///     controller: overlayController,  // consumer manages state
///     child: /* chat overlay + composer + action bar */,
///   ),
/// ])
/// ```
///
/// The stack is presentation only. All data comes through
/// [LiveOverlayController]; the caller wires realtime bridges to it.
class LiveOverlayController extends ChangeNotifier {
  final LiveJoinNotificationsController joinNotifications =
      LiveJoinNotificationsController();
  final LiveBigoJoinBannerController bigoBanner =
      LiveBigoJoinBannerController();
  final PremiumFlyingGiftBannerController premiumFlyingGifts =
      PremiumFlyingGiftBannerController();
  final GiftComboController giftCombos = GiftComboController();
  final PremiumJoinChatController premiumJoinChat =
      PremiumJoinChatController();
  final StreamController<CaptionEvent> captionEvents =
      StreamController<CaptionEvent>.broadcast();

  bool captionsEnabled = false;
  bool audioUnlockNeeded = false;
  LiveConnectionQuality connectionQuality = LiveConnectionQuality.unknown;
  int viewerCount = 0;
  List<GiftComboTrackerEntry> topGifters = const [];
  PKBattleActiveState? pkState;

  void setCaptionsEnabled(bool v) {
    captionsEnabled = v;
    notifyListeners();
  }

  void setAudioUnlockNeeded(bool v) {
    if (audioUnlockNeeded == v) return;
    audioUnlockNeeded = v;
    notifyListeners();
  }

  void setConnectionQuality(LiveConnectionQuality q) {
    if (connectionQuality == q) return;
    connectionQuality = q;
    notifyListeners();
  }

  void setViewerCount(int c) {
    if (viewerCount == c) return;
    viewerCount = c;
    notifyListeners();
  }

  void setTopGifters(List<GiftComboTrackerEntry> list) {
    topGifters = list;
    notifyListeners();
  }

  void setPKState(PKBattleActiveState? s) {
    pkState = s;
    notifyListeners();
  }

  @override
  void dispose() {
    joinNotifications.dispose();
    bigoBanner.dispose();
    premiumFlyingGifts.dispose();
    giftCombos.dispose();
    premiumJoinChat.dispose();
    captionEvents.close();
    super.dispose();
  }
}

class LiveOverlayStack extends StatelessWidget {
  final LiveOverlayController controller;
  final Widget? chatOverlay; // chat list rendered by caller
  final Widget? composer; // bottom composer rendered by caller
  final Widget? actionBar; // right-rail action buttons

  final VoidCallback? onCaptionsToggle;
  final VoidCallback? onAudioUnlock;

  /// Phase I17 — when the caller already renders its own top pill
  /// (host avatar / follow / viewer-count chip), suppress the overlay's
  /// duplicate right-side count + quality chip. Top-gifters column and
  /// PK HUD still render on the left/right.
  final bool showTopCountChip;

  const LiveOverlayStack({
    super.key,
    required this.controller,
    this.chatOverlay,
    this.composer,
    this.actionBar,
    this.onCaptionsToggle,
    this.onAudioUnlock,
    this.showTopCountChip = true,
  });

  @override
  Widget build(BuildContext context) {
    final mq = MediaQuery.of(context);
    return AnimatedBuilder(
      animation: controller,
      builder: (_, __) {
        return UnifiedEntryAnimationHost(
          child: Stack(
            children: [
              // ── Top HUD ─────────────────────────────────────────────────
              Positioned(
                top: mq.padding.top + 8,
                left: 10,
                right: 10,
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          if (controller.pkState != null)
                            PKBattleActive(state: controller.pkState!),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            ConnectionQualityIndicator(
                                quality: controller.connectionQuality),
                            const SizedBox(width: 6),
                            AnimatedViewerCount(
                                value: controller.viewerCount),
                          ],
                        ),
                        const SizedBox(height: 6),
                        GiftComboTracker(entries: controller.topGifters),
                      ],
                    ),
                  ],
                ),
              ),

              // ── Left rail: bigo VIP banner + stacking joins ─────────────
              Positioned(
                top: mq.padding.top + 100,
                left: 8,
                right: 8,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    LiveStackingJoinNotifications(
                        controller: controller.joinNotifications),
                    const SizedBox(height: 4),
                    LiveBigoJoinBanner(
                        controller: controller.bigoBanner),
                  ],
                ),
              ),

              // ── Combo counters (mid-left) ───────────────────────────────
              GiftComboDisplay(controller: controller.giftCombos),

              // ── Premium flying gifts ────────────────────────────────────
              PremiumFlyingGiftBanner(
                  controller: controller.premiumFlyingGifts),

              // ── Chat overlay (bottom-left) ──────────────────────────────
              if (chatOverlay != null)
                Positioned(
                  left: 8,
                  right: 80,
                  bottom: mq.padding.bottom + 84,
                  top: mq.size.height * 0.42,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      PremiumJoinChatOverlay(
                          controller: controller.premiumJoinChat),
                      const SizedBox(height: 6),
                      Expanded(child: chatOverlay!),
                    ],
                  ),
                ),

              // ── Right rail: action buttons ──────────────────────────────
              if (actionBar != null)
                Positioned(
                  right: 8,
                  bottom: mq.padding.bottom + 100,
                  child: actionBar!,
                ),

              // ── Captions (bottom-center above composer) ─────────────────
              if (controller.captionsEnabled)
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: mq.padding.bottom + 78,
                  child: LiveCaptionsOverlay(
                    stream: controller.captionEvents.stream,
                    enabled: controller.captionsEnabled,
                    onToggle: onCaptionsToggle,
                  ),
                ),

              // ── Composer at bottom ──────────────────────────────────────
              if (composer != null)
                Positioned(
                  left: 0,
                  right: 0,
                  bottom: 0,
                  child: composer!,
                ),

              // ── Audio unlock (overlays everything) ──────────────────────
              if (controller.audioUnlockNeeded)
                Positioned.fill(
                  child: LiveAudioUnlockOverlay(
                    onUnlock: () async {
                      if (onAudioUnlock != null) {
                        onAudioUnlock!();
                      }
                      controller.setAudioUnlockNeeded(false);
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}
