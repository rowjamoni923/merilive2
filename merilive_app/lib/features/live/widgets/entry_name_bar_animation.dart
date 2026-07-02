import 'package:flutter/material.dart';

/// Flutter port of `EntryNameBarAnimation.tsx` — mid-tier flying name bar
/// (table: `entry_name_bars`) for Lv15-39. A gradient pill sweeps across
/// mid-screen with just username + level. 3.0s total (0.5s in, 2.0s hold,
/// 0.5s out).
class EntryNameBarData {
  final String userName;
  final int level;
  final List<Color> gradient;
  final String? avatarUrl;

  const EntryNameBarData({
    required this.userName,
    required this.level,
    required this.gradient,
    this.avatarUrl,
  });
}

class EntryNameBarAnimation extends StatefulWidget {
  final EntryNameBarData data;
  final VoidCallback? onComplete;
  const EntryNameBarAnimation({
    super.key,
    required this.data,
    this.onComplete,
  });

  static OverlayEntry show(BuildContext context, EntryNameBarData data) {
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => EntryNameBarAnimation(
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
  State<EntryNameBarAnimation> createState() =>
      _EntryNameBarAnimationState();
}

class _EntryNameBarAnimationState extends State<EntryNameBarAnimation>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ac;
  static const _totalMs = 3000;
  static const _inMs = 500;
  static const _outMs = 500;

  @override
  void initState() {
    super.initState();
    _ac = AnimationController(
        vsync: this, duration: const Duration(milliseconds: _totalMs))
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
        return Positioned(
          top: size.height * 0.42,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Center(
              child: Transform.translate(
                offset: Offset(x, 0),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: widget.data.gradient),
                    borderRadius: BorderRadius.circular(999),
                    boxShadow: [
                      BoxShadow(
                          color: widget.data.gradient.first.withOpacity(0.55),
                          blurRadius: 18,
                          spreadRadius: 1),
                    ],
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (widget.data.avatarUrl != null) ...[
                        CircleAvatar(
                            radius: 11,
                            backgroundColor: Colors.white24,
                            backgroundImage:
                                NetworkImage(widget.data.avatarUrl!)),
                        const SizedBox(width: 6),
                      ],
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
                        constraints: const BoxConstraints(maxWidth: 200),
                        child: Text(widget.data.userName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                color: Colors.white,
                                fontSize: 13,
                                fontWeight: FontWeight.w800)),
                      ),
                    ],
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
