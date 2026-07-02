import 'package:flutter/material.dart';

/// Flutter port of `FlyingJoinBanner.tsx` — legacy compact join banner used
/// for low-tier joins (Lv1-14). Slides in from right, holds 1.8s, exits left.
/// Simpler than Bigo-style banner: single line, small pill, no queue.
class FlyingJoinBannerData {
  final String userName;
  final int level;
  final String? avatarUrl;
  const FlyingJoinBannerData({
    required this.userName,
    required this.level,
    this.avatarUrl,
  });
}

class FlyingJoinBanner extends StatefulWidget {
  final FlyingJoinBannerData data;
  final VoidCallback? onComplete;
  const FlyingJoinBanner({
    super.key,
    required this.data,
    this.onComplete,
  });

  static OverlayEntry show(BuildContext context, FlyingJoinBannerData data) {
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => FlyingJoinBanner(
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
  State<FlyingJoinBanner> createState() => _FlyingJoinBannerState();
}

class _FlyingJoinBannerState extends State<FlyingJoinBanner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ac;
  static const _totalMs = 2600;
  static const _inMs = 400;
  static const _outMs = 400;

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
          top: size.height * 0.48,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: Transform.translate(
              offset: Offset(x, 0),
              child: Padding(
                padding: const EdgeInsets.only(left: 12),
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.55),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircleAvatar(
                          radius: 9,
                          backgroundColor: Colors.white24,
                          backgroundImage: (widget.data.avatarUrl != null &&
                                  widget.data.avatarUrl!.isNotEmpty)
                              ? NetworkImage(widget.data.avatarUrl!)
                              : null,
                        ),
                        const SizedBox(width: 6),
                        Text('Lv${widget.data.level}',
                            style: const TextStyle(
                                color: Color(0xFFFDE68A),
                                fontSize: 9,
                                fontWeight: FontWeight.w800)),
                        const SizedBox(width: 4),
                        ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 130),
                          child: Text(widget.data.userName,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700)),
                        ),
                        const SizedBox(width: 4),
                        const Text('joined',
                            style: TextStyle(
                                color: Colors.white70, fontSize: 10)),
                      ],
                    ),
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
