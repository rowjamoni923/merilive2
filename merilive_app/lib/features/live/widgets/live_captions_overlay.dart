// Pkg196 parity — Live Captions Overlay.
//
// Flutter port of `src/components/live/LiveCaptionsOverlay.tsx`. The web
// component subscribes to a `livekit-transcription` browser event; on Flutter
// the equivalent is fed by a Dart-side stream (wire from your LiveKit
// transcription bridge). Rolling per-speaker buffer, interim overwrite,
// final freeze, linger auto-dismiss, tap-toggle button. Toggle is persisted
// through the provided [onToggle] callback + [enabled] prop so the parent
// controls SharedPreferences.

import 'dart:async';
import 'package:flutter/material.dart';

class LiveTranscriptionSegment {
  const LiveTranscriptionSegment({
    required this.speaker,
    required this.segmentId,
    required this.text,
    required this.isFinal,
  });
  final String speaker;
  final String segmentId;
  final String text;
  final bool isFinal;
}

class _CaptionLine {
  _CaptionLine({
    required this.id,
    required this.speaker,
    required this.text,
    required this.isFinal,
    required this.updatedAt,
  });
  final String id;
  final String speaker;
  String text;
  bool isFinal;
  DateTime updatedAt;
}

class LiveCaptionsOverlay extends StatefulWidget {
  const LiveCaptionsOverlay({
    super.key,
    required this.stream,
    this.enabled = true,
    this.onToggle,
    this.speakerLabels = const {},
    this.maxLines = 2,
    this.lingerDuration = const Duration(seconds: 6),
    this.showToggle = true,
    this.bottomOffset = 104,
  });

  final Stream<LiveTranscriptionSegment> stream;
  final bool enabled;
  final ValueChanged<bool>? onToggle;
  final Map<String, String> speakerLabels;
  final int maxLines;
  final Duration lingerDuration;
  final bool showToggle;
  final double bottomOffset;

  @override
  State<LiveCaptionsOverlay> createState() => _LiveCaptionsOverlayState();
}

class _LiveCaptionsOverlayState extends State<LiveCaptionsOverlay> {
  final List<_CaptionLine> _lines = [];
  StreamSubscription<LiveTranscriptionSegment>? _sub;
  Timer? _sweep;

  @override
  void initState() {
    super.initState();
    if (widget.enabled) _subscribe();
  }

  @override
  void didUpdateWidget(covariant LiveCaptionsOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.enabled != widget.enabled) {
      if (widget.enabled) {
        _subscribe();
      } else {
        _unsubscribe();
        setState(_lines.clear);
      }
    } else if (oldWidget.stream != widget.stream && widget.enabled) {
      _unsubscribe();
      _subscribe();
    }
  }

  void _subscribe() {
    _sub = widget.stream.listen(_ingest);
    _sweep = Timer.periodic(const Duration(milliseconds: 750), (_) {
      final cutoff = DateTime.now().subtract(widget.lingerDuration);
      final before = _lines.length;
      _lines.removeWhere((l) => l.updatedAt.isBefore(cutoff));
      if (_lines.length != before && mounted) setState(() {});
    });
  }

  void _unsubscribe() {
    _sub?.cancel();
    _sub = null;
    _sweep?.cancel();
    _sweep = null;
  }

  void _ingest(LiveTranscriptionSegment seg) {
    final text = seg.text.trim();
    if (text.isEmpty) return;
    final now = DateTime.now();
    final composite = seg.isFinal
        ? '${seg.speaker}::${seg.segmentId}'
        : '${seg.speaker}::interim';
    final idx = _lines.indexWhere((l) => l.id == composite);
    if (idx >= 0) {
      _lines[idx]
        ..text = text
        ..isFinal = seg.isFinal
        ..updatedAt = now;
    } else {
      _lines.add(_CaptionLine(
        id: composite,
        speaker: seg.speaker,
        text: text,
        isFinal: seg.isFinal,
        updatedAt: now,
      ));
    }
    if (seg.isFinal) {
      _lines.removeWhere(
        (l) => l.speaker == seg.speaker && l.id != composite && !l.isFinal,
      );
    }
    if (_lines.length > widget.maxLines) {
      _lines.removeRange(0, _lines.length - widget.maxLines);
    }
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _unsubscribe();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final visible = _lines.take(widget.maxLines).toList();

    return Positioned(
      left: 12,
      right: 12,
      bottom: widget.bottomOffset,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (widget.showToggle)
            Align(
              alignment: Alignment.centerRight,
              child: Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: _ToggleButton(
                  enabled: widget.enabled,
                  onPressed: () => widget.onToggle?.call(!widget.enabled),
                ),
              ),
            ),
          if (widget.enabled)
            for (final line in visible)
              Padding(
                key: ValueKey(line.id),
                padding: const EdgeInsets.only(top: 6),
                child: _CaptionBubble(
                  line: line,
                  speakerLabel: widget.speakerLabels[line.speaker],
                ),
              ),
        ],
      ),
    );
  }
}

class _ToggleButton extends StatelessWidget {
  const _ToggleButton({required this.enabled, required this.onPressed});
  final bool enabled;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onPressed,
        child: Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: enabled
                ? const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0x8CA855F7), Color(0x73EC4899)],
                  )
                : null,
            color: enabled ? null : Colors.black.withOpacity(0.5),
            border: Border.all(
              color: enabled
                  ? const Color(0x73EC4899)
                  : Colors.white.withOpacity(0.15),
            ),
            boxShadow: enabled
                ? const [
                    BoxShadow(
                      color: Color(0x8CEC4899),
                      blurRadius: 18,
                      offset: Offset(0, 6),
                    ),
                  ]
                : null,
          ),
          child: Icon(
            enabled ? Icons.subtitles_rounded : Icons.subtitles_off_rounded,
            size: 16,
            color: enabled ? Colors.white : Colors.white70,
          ),
        ),
      ),
    );
  }
}

class _CaptionBubble extends StatelessWidget {
  const _CaptionBubble({required this.line, this.speakerLabel});
  final _CaptionLine line;
  final String? speakerLabel;

  @override
  Widget build(BuildContext context) {
    return AnimatedOpacity(
      duration: const Duration(milliseconds: 220),
      opacity: line.isFinal ? 1.0 : 0.85,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(20),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xB8000000), Color(0x9E140F28)],
          ),
          border: Border.all(color: Colors.white.withOpacity(0.10)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x99000000),
              blurRadius: 18,
              offset: Offset(0, 6),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (speakerLabel != null && speakerLabel!.isNotEmpty) ...[
              Text(
                speakerLabel!.toUpperCase(),
                style: const TextStyle(
                  color: Color(0xF2EC4899),
                  fontSize: 10,
                  letterSpacing: 1.5,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(width: 8),
            ],
            Flexible(
              child: Text(
                line.text,
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 14,
                  height: 1.3,
                  fontStyle:
                      line.isFinal ? FontStyle.normal : FontStyle.italic,
                  fontWeight:
                      line.isFinal ? FontWeight.w500 : FontWeight.w400,
                  shadows: const [
                    Shadow(color: Colors.black87, blurRadius: 2),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
