// R5 — Bottom info overlay for the Reels feed.
//
// Chamet/TikTok/Bigo pattern:
//   • Handle (@display_name) + verified/live pill, tappable to profile.
//   • Caption that clamps to two lines with a "more" toggle.
//   • Music ticker: rotating disc + marquee ("♪ Original sound — <handle>"
//     or "♪ <title> · <artist>"). Marquees only when text overflows.
//
// The rail lives on the right and pins the bottom-right column; this widget
// occupies the bottom-left third, padded above the app tab bar and safe area.

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../data/reels_models.dart';

typedef ReelInfoCallback = void Function(Reel reel);

class ReelBottomInfo extends StatefulWidget {
  const ReelBottomInfo({
    super.key,
    required this.reel,
    required this.isActive,
    required this.onHandleTap,
    required this.onSoundTap,
  });

  final Reel reel;
  final bool isActive;
  final ReelInfoCallback onHandleTap;
  final ReelInfoCallback onSoundTap;

  @override
  State<ReelBottomInfo> createState() => _ReelBottomInfoState();
}

class _ReelBottomInfoState extends State<ReelBottomInfo> {
  bool _captionExpanded = false;

  @override
  Widget build(BuildContext context) {
    final r = widget.reel;
    final handle = _resolveHandle(r);
    final caption = r.caption?.trim();
    return Padding(
      padding: EdgeInsets.only(
        left: 14,
        right: 76, // leave room for the right rail
        bottom: MediaQuery.of(context).padding.bottom + 96,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _HandleRow(
            handle: handle,
            isLive: false,
            onTap: () {
              HapticFeedback.selectionClick();
              widget.onHandleTap(r);
            },
          ),
          if (caption != null && caption.isNotEmpty) ...[
            const SizedBox(height: 6),
            _CaptionText(
              text: caption,
              expanded: _captionExpanded,
              onToggle: () =>
                  setState(() => _captionExpanded = !_captionExpanded),
            ),
          ],
          const SizedBox(height: 10),
          _MusicTicker(
            reel: r,
            playing: widget.isActive,
            onTap: () => widget.onSoundTap(r),
          ),
        ],
      ),
    );
  }

  String _resolveHandle(Reel r) {
    final u = r.user;
    if (u == null) return '@user';
    final name = (u.displayName ?? '').trim();
    if (name.isNotEmpty) return '@$name';
    return '@user';
  }
}

class _HandleRow extends StatelessWidget {
  const _HandleRow({
    required this.handle,
    required this.isLive,
    required this.onTap,
  });
  final String handle;
  final bool isLive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: onTap,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Flexible(
            child: Text(
              handle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.1,
                shadows: [Shadow(color: Colors.black54, blurRadius: 6)],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CaptionText extends StatelessWidget {
  const _CaptionText({
    required this.text,
    required this.expanded,
    required this.onToggle,
  });
  final String text;
  final bool expanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final style = const TextStyle(
      color: Colors.white,
      fontSize: 13.5,
      height: 1.35,
      fontWeight: FontWeight.w500,
      shadows: [Shadow(color: Colors.black54, blurRadius: 6)],
    );
    return LayoutBuilder(
      builder: (context, constraints) {
        final tp = TextPainter(
          text: TextSpan(text: text, style: style),
          maxLines: 2,
          textDirection: TextDirection.ltr,
        )..layout(maxWidth: constraints.maxWidth);
        final overflows = tp.didExceedMaxLines;
        if (!overflows) {
          return Text(text, style: style);
        }
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onToggle,
          child: RichText(
            maxLines: expanded ? 10 : 2,
            overflow: TextOverflow.ellipsis,
            text: TextSpan(
              style: style,
              children: [
                TextSpan(text: expanded ? text : '$text  '),
                if (!expanded)
                  const TextSpan(
                    text: 'more',
                    style: TextStyle(
                      color: Colors.white70,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _MusicTicker extends StatefulWidget {
  const _MusicTicker({
    required this.reel,
    required this.playing,
    required this.onTap,
  });
  final Reel reel;
  final bool playing;
  final VoidCallback onTap;

  @override
  State<_MusicTicker> createState() => _MusicTickerState();
}

class _MusicTickerState extends State<_MusicTicker>
    with SingleTickerProviderStateMixin {
  late final AnimationController _spin;

  @override
  void initState() {
    super.initState();
    _spin = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 6),
    );
    _syncSpin();
  }

  @override
  void didUpdateWidget(covariant _MusicTicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.playing != widget.playing) _syncSpin();
  }

  void _syncSpin() {
    if (widget.playing) {
      if (!_spin.isAnimating) _spin.repeat();
    } else {
      _spin.stop();
    }
  }

  @override
  void dispose() {
    _spin.dispose();
    super.dispose();
  }

  String _label(Reel r) {
    if (r.isOriginalSound) {
      final handle = (r.user?.displayName ?? '').trim();
      return handle.isEmpty ? 'Original sound' : 'Original sound · @$handle';
    }
    final title = (r.soundTitle ?? r.musicTitle ?? '').trim();
    final artist = (r.soundArtist ?? r.musicArtist ?? '').trim();
    if (title.isEmpty && artist.isEmpty) return 'Original sound';
    if (title.isNotEmpty && artist.isNotEmpty) return '$title · $artist';
    return title.isNotEmpty ? title : artist;
  }

  @override
  Widget build(BuildContext context) {
    final label = _label(widget.reel);
    return GestureDetector(
      onTap: widget.onTap,
      behavior: HitTestBehavior.opaque,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          RotationTransition(
            turns: _spin,
            child: Container(
              width: 22,
              height: 22,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const LinearGradient(
                  colors: [Color(0xFF3B4A66), Color(0xFF0F172A)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                border: Border.all(color: Colors.white54, width: 1),
              ),
              alignment: Alignment.center,
              child: const Icon(Icons.music_note_rounded,
                  color: Colors.white, size: 12),
            ),
          ),
          const SizedBox(width: 8),
          Flexible(
            child: _Marquee(
              text: label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
                shadows: [Shadow(color: Colors.black54, blurRadius: 6)],
              ),
              enabled: widget.playing,
            ),
          ),
        ],
      ),
    );
  }
}

/// Simple horizontal marquee: static when text fits, otherwise scrolls left
/// with a wrap-around gap. Runs only when [enabled] is true so paused reels
/// stop consuming ticker frames.
class _Marquee extends StatefulWidget {
  const _Marquee({
    required this.text,
    required this.style,
    required this.enabled,
  });
  final String text;
  final TextStyle style;
  final bool enabled;

  @override
  State<_Marquee> createState() => _MarqueeState();
}

class _MarqueeState extends State<_Marquee>
    with SingleTickerProviderStateMixin {
  late final ScrollController _ctrl = ScrollController();
  Ticker? _ticker;
  double _offset = 0;
  static const double _pxPerSec = 28;
  static const double _gap = 40;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(_onTick);
    if (widget.enabled) _ticker!.start();
  }

  @override
  void didUpdateWidget(covariant _Marquee oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.enabled != widget.enabled) {
      if (widget.enabled) {
        _ticker?.start();
      } else {
        _ticker?.stop();
      }
    }
    if (oldWidget.text != widget.text) {
      _offset = 0;
      if (_ctrl.hasClients) _ctrl.jumpTo(0);
    }
  }

  Duration _prev = Duration.zero;
  void _onTick(Duration elapsed) {
    if (!_ctrl.hasClients) return;
    final max = _ctrl.position.maxScrollExtent;
    if (max <= 0) return; // fits — no scroll
    final dt = _prev == Duration.zero
        ? 0
        : (elapsed - _prev).inMicroseconds / 1e6;
    _prev = elapsed;
    _offset += _pxPerSec * dt;
    final loop = max + _gap;
    if (_offset >= loop) _offset -= loop;
    _ctrl.jumpTo(_offset.clamp(0, max));
  }

  @override
  void dispose() {
    _ticker?.dispose();
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 18,
      child: SingleChildScrollView(
        controller: _ctrl,
        scrollDirection: Axis.horizontal,
        physics: const NeverScrollableScrollPhysics(),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(widget.text, style: widget.style, maxLines: 1),
            const SizedBox(width: _gap),
            Text(widget.text, style: widget.style, maxLines: 1),
          ],
        ),
      ),
    );
  }
}
