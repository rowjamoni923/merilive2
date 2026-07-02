import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';

/// A11 — Flutter fallback for the flying entry name bar.
///
/// Renders a compact, level-tier gradient banner with the joining user's
/// avatar, display name and Lv.xx badge. FIFO queue with max 3 stacked
/// active banners so a fast crowd doesn't collapse into one blur.
///
/// Used when the native `NativeEntryAnimationPlugin` isn't available
/// (Web / iOS / old APK / no equipped animation URL). The tier gradient
/// mirrors `src/components/EntryNameBar.tsx` on the web side so users see
/// the same treatment across every surface.
class EntryNameBarPayload {
  EntryNameBarPayload({
    required this.userName,
    required this.userLevel,
    this.avatarUrl,
    this.animationUrl,
  });

  final String userName;
  final int userLevel;
  final String? avatarUrl;
  final String? animationUrl; // reserved for SVGA/Lottie/GIF/image fallback
}

class EntryNameBarQueue {
  EntryNameBarQueue._();
  static final EntryNameBarQueue instance = EntryNameBarQueue._();

  final _controller = StreamController<List<EntryNameBarPayload>>.broadcast();
  final Queue<EntryNameBarPayload> _pending = Queue();
  final List<_ActivePayload> _active = [];
  static const int _maxConcurrent = 3;
  static const Duration _duration = Duration(milliseconds: 3600);

  Stream<List<EntryNameBarPayload>> get stream$ => _controller.stream;

  void enqueue(EntryNameBarPayload payload) {
    _pending.add(payload);
    _drain();
  }

  void _drain() {
    while (_active.length < _maxConcurrent && _pending.isNotEmpty) {
      final p = _pending.removeFirst();
      final active = _ActivePayload(p);
      _active.add(active);
      active.timer = Timer(_duration, () {
        _active.remove(active);
        _emit();
        _drain();
      });
    }
    _emit();
  }

  void _emit() {
    _controller.add(_active.map((a) => a.payload).toList(growable: false));
  }

  void clear() {
    for (final a in _active) {
      a.timer?.cancel();
    }
    _active.clear();
    _pending.clear();
    _emit();
  }
}

class _ActivePayload {
  _ActivePayload(this.payload);
  final EntryNameBarPayload payload;
  Timer? timer;
}

/// Widget: renders the currently-active entry banners stacked from the
/// top-center of the screen. Drop it inside a `Stack` (above chat, below
/// gift full-screen animations, below top header).
class EntryNameBarOverlay extends StatelessWidget {
  const EntryNameBarOverlay({super.key, this.topOffset});

  final double? topOffset;

  @override
  Widget build(BuildContext context) {
    final safeTop = topOffset ?? (MediaQuery.of(context).padding.top + 78);
    return Positioned(
      top: safeTop,
      left: 0,
      right: 0,
      child: IgnorePointer(
        child: StreamBuilder<List<EntryNameBarPayload>>(
          stream: EntryNameBarQueue.instance.stream$,
          initialData: const [],
          builder: (context, snap) {
            final items = snap.data ?? const [];
            if (items.isEmpty) return const SizedBox.shrink();
            return Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (int i = 0; i < items.length; i++)
                  Padding(
                    padding: EdgeInsets.only(top: i == 0 ? 0 : 6),
                    child: _EntryBannerCard(payload: items[i], key: ValueKey(items[i])),
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _EntryBannerCard extends StatefulWidget {
  const _EntryBannerCard({super.key, required this.payload});
  final EntryNameBarPayload payload;

  @override
  State<_EntryBannerCard> createState() => _EntryBannerCardState();
}

class _EntryBannerCardState extends State<_EntryBannerCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _slide;
  late final Animation<double> _opacity;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 320),
    );
    _slide = Tween(begin: -1.0, end: 0.0)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _opacity =
        CurvedAnimation(parent: _ctrl, curve: const Interval(0.0, 0.6));
    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final tier = _tierFor(widget.payload.userLevel);
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        return FractionalTranslation(
          translation: Offset(_slide.value, 0),
          child: Opacity(opacity: _opacity.value, child: _card(tier)),
        );
      },
    );
  }

  Widget _card(_Tier tier) {
    final avatar = widget.payload.avatarUrl;
    return Center(
      child: Container(
        constraints: const BoxConstraints(maxWidth: 340),
        margin: const EdgeInsets.symmetric(horizontal: 16),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          gradient: LinearGradient(colors: tier.gradient),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withValues(alpha: 0.35), width: 1),
          boxShadow: [
            BoxShadow(
              color: tier.gradient.last.withValues(alpha: 0.55),
              blurRadius: 18,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 14,
              backgroundColor: Colors.white24,
              backgroundImage:
                  (avatar != null && avatar.isNotEmpty) ? NetworkImage(avatar) : null,
              child: (avatar == null || avatar.isEmpty)
                  ? const Icon(Icons.person, size: 14, color: Colors.white70)
                  : null,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: Text(
                widget.payload.userName,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.black.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                'Lv.${widget.payload.userLevel}',
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.4,
                ),
              ),
            ),
            const SizedBox(width: 6),
            Text(
              tier.label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }

  _Tier _tierFor(int level) {
    if (level >= 60) {
      return _Tier('Legend', const [Color(0xFFF59E0B), Color(0xFFEF4444)]);
    }
    if (level >= 40) {
      return _Tier('Diamond', const [Color(0xFF06B6D4), Color(0xFFA855F7)]);
    }
    if (level >= 20) {
      return _Tier('Elite', const [Color(0xFF8B5CF6), Color(0xFFEC4899)]);
    }
    if (level >= 10) {
      return _Tier('Pro', const [Color(0xFF3B82F6), Color(0xFF06B6D4)]);
    }
    return _Tier('Joined', const [Color(0xFF64748B), Color(0xFF334155)]);
  }
}

class _Tier {
  const _Tier(this.label, this.gradient);
  final String label;
  final List<Color> gradient;
}
