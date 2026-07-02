// R3 — Reel video player widget.
//
// Renders the video for a single reel with:
//   • Thumbnail poster until the controller is ready (no black flash).
//   • Tap-to-play/pause with a fade-in pause glyph.
//   • Bottom progress bar (thin, non-interactive here — scrubbing = later).
//   • Mute toggle exposed via `onToggleMute` from the parent.
//
// The widget is stateless w.r.t. the pool — it just observes the handle it
// was given. Playback control (play/pause/preload) lives in the pool + feed
// page so lifecycle stays centralized.

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../data/reel_video_pool.dart';
import '../data/reels_models.dart';
import 'reel_card_placeholder.dart';

class ReelPlayer extends StatefulWidget {
  const ReelPlayer({
    super.key,
    required this.reel,
    required this.handle,
    required this.isActive,
    required this.isMuted,
    required this.onToggleMute,
  });

  final Reel reel;
  final ReelVideoHandle? handle;
  final bool isActive;
  final bool isMuted;
  final VoidCallback onToggleMute;

  @override
  State<ReelPlayer> createState() => _ReelPlayerState();
}

class _ReelPlayerState extends State<ReelPlayer> {
  bool _userPaused = false;
  bool _showPauseGlyph = false;

  VideoPlayerController? get _controller {
    final h = widget.handle;
    if (h == null || !h.initialized) return null;
    return h.controller;
  }

  @override
  void didUpdateWidget(covariant ReelPlayer oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.isActive != widget.isActive && widget.isActive) {
      // Becoming active — clear any prior manual pause.
      _userPaused = false;
    }
  }

  void _handleTap() {
    final c = _controller;
    if (c == null) return;
    HapticFeedback.selectionClick();
    if (c.value.isPlaying) {
      c.pause();
      _userPaused = true;
      setState(() => _showPauseGlyph = true);
    } else {
      c.play();
      _userPaused = false;
      setState(() => _showPauseGlyph = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = _controller;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _handleTap,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // Poster / thumbnail — always mounted so we never show a black gap.
          ReelCardPlaceholder(reel: widget.reel),

          if (c != null && c.value.isInitialized)
            Positioned.fill(
              child: FittedBox(
                fit: BoxFit.cover,
                child: SizedBox(
                  width: c.value.size.width,
                  height: c.value.size.height,
                  child: VideoPlayer(c),
                ),
              ),
            ),

          // Bottom progress bar.
          if (c != null && c.value.isInitialized)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: _ProgressBar(controller: c),
            ),

          // Pause glyph fade.
          IgnorePointer(
            child: AnimatedOpacity(
              opacity: _showPauseGlyph && _userPaused ? 1 : 0,
              duration: const Duration(milliseconds: 180),
              child: const Center(
                child: Icon(
                  Icons.play_arrow_rounded,
                  color: Colors.white,
                  size: 96,
                  shadows: [Shadow(color: Colors.black45, blurRadius: 12)],
                ),
              ),
            ),
          ),

          // Mute toggle (top-right).
          Positioned(
            top: MediaQuery.of(context).padding.top + 46,
            right: 12,
            child: _MuteButton(
              muted: widget.isMuted,
              onTap: widget.onToggleMute,
            ),
          ),
        ],
      ),
    );
  }
}

class _ProgressBar extends StatefulWidget {
  const _ProgressBar({required this.controller});
  final VideoPlayerController controller;

  @override
  State<_ProgressBar> createState() => _ProgressBarState();
}

class _ProgressBarState extends State<_ProgressBar> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onTick);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTick);
    super.dispose();
  }

  void _onTick() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final v = widget.controller.value;
    final total = v.duration.inMilliseconds;
    final pos = v.position.inMilliseconds;
    final progress = total > 0 ? (pos / total).clamp(0.0, 1.0) : 0.0;
    return Container(
      height: 2.5,
      color: Colors.white.withOpacity(0.18),
      child: FractionallySizedBox(
        alignment: Alignment.centerLeft,
        widthFactor: progress,
        child: Container(color: Colors.white),
      ),
    );
  }
}

class _MuteButton extends StatelessWidget {
  const _MuteButton({required this.muted, required this.onTap});
  final bool muted;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.selectionClick();
        onTap();
      },
      behavior: HitTestBehavior.opaque,
      child: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.42),
          shape: BoxShape.circle,
        ),
        child: Icon(
          muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
          color: Colors.white,
          size: 20,
        ),
      ),
    );
  }
}
