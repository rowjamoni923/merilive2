import 'dart:async';
import 'package:flutter/material.dart';

import '../data/live_chat_bridge.dart';

/// B5 — Flying gift capsule stack.
///
/// Mirrors web `FlyingGiftAnimation` (src/components/live/FlyingGiftAnimation.tsx):
///   • Bigo/Chamet-style compact 2-line capsule (avatar · sender / gift xN).
///   • Vertical stack, up to 3 visible, 44px offset (8px gutter over 36px pill).
///   • Combo merge: same sender + same gift inside a 4s window bumps the
///     capsule count-up (animated) and resets its 3.5s dismiss timer.
///   • Tier gradient: premium (≥10k), luxury (≥1k), standard.
///
/// Purely presentational: full-screen VAP/SVGA gifts still play on the
/// native path via `NativeGiftBridge`. This is the always-on Flutter
/// banner that guarantees every gift shows a countable capsule.
class FlyingGiftCapsuleStack extends StatefulWidget {
  const FlyingGiftCapsuleStack({super.key, required this.stream});
  final Stream<LiveGiftEvent> stream;

  @override
  State<FlyingGiftCapsuleStack> createState() => _FlyingGiftCapsuleStackState();
}

class _Entry {
  _Entry(this.event, this.count);
  LiveGiftEvent event;
  int count;
  Timer? timer;
  int comboKey = 0;
  final GlobalKey<_FlyingGiftCapsuleState> key = GlobalKey();
}

class _FlyingGiftCapsuleStackState extends State<FlyingGiftCapsuleStack> {
  final List<_Entry> _stack = [];
  StreamSubscription<LiveGiftEvent>? _sub;
  static const int _maxVisible = 3;
  static const double _stackOffsetPx = 44;
  static const Duration _comboWindow = Duration(seconds: 4);
  static const Duration _dismiss = Duration(milliseconds: 3500);

  @override
  void initState() {
    super.initState();
    _sub = widget.stream.listen(_onGift);
  }

  String _key(LiveGiftEvent g) =>
      '${g.senderId ?? g.senderName}|${g.giftId ?? g.giftName}';

  void _onGift(LiveGiftEvent g) {
    final k = _key(g);
    final idx = _stack.indexWhere((e) => _key(e.event) == k);
    setState(() {
      if (idx >= 0) {
        final e = _stack[idx];
        e.count += g.quantity;
        e.event = g;
        e.comboKey += 1;
        e.timer?.cancel();
        e.timer = Timer(_dismiss, () => _expire(e));
        // Move to top (newest bumped capsule floats up).
        _stack.removeAt(idx);
        _stack.insert(0, e);
      } else {
        final e = _Entry(g, g.quantity);
        e.timer = Timer(_dismiss, () => _expire(e));
        _stack.insert(0, e);
        // No hard drop: keep record so combos still merge; just clip
        // the visible window to _maxVisible in build().
      }
      // Best-effort: also collapse anything past the combo window that
      // no longer has a live timer (defensive; timer already handles it).
      _stack.retainWhere((e) => e.timer?.isActive ?? true);
    });
  }

  void _expire(_Entry e) {
    if (!mounted) return;
    setState(() {
      e.timer?.cancel();
      _stack.remove(e);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    for (final e in _stack) {
      e.timer?.cancel();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final visible = _stack.take(_maxVisible).toList();
    return SizedBox(
      // Reserve exact stack height so surrounding layout doesn't jump.
      height: visible.isEmpty ? 0 : (visible.length - 1) * _stackOffsetPx + 40,
      width: 260,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          for (int i = 0; i < visible.length; i++)
            Positioned(
              // Newest (index 0) sits at the bottom; older float up.
              bottom: i * _stackOffsetPx,
              left: 0,
              child: FlyingGiftCapsule(
                key: visible[i].key,
                event: visible[i].event,
                count: visible[i].count,
                comboKey: visible[i].comboKey,
              ),
            ),
        ],
      ),
    );
  }
}

class FlyingGiftCapsule extends StatefulWidget {
  const FlyingGiftCapsule({
    super.key,
    required this.event,
    required this.count,
    required this.comboKey,
  });

  final LiveGiftEvent event;
  final int count;
  final int comboKey;

  @override
  State<FlyingGiftCapsule> createState() => _FlyingGiftCapsuleState();
}

class _FlyingGiftCapsuleState extends State<FlyingGiftCapsule>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _entry;
  late final Animation<double> _pop;
  int _displayCount = 0;
  int _fromCount = 0;
  int _toCount = 0;
  int _lastComboKey = -1;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 320),
    );
    _entry = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutBack);
    _pop = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.24), weight: 40),
      TweenSequenceItem(tween: Tween(begin: 1.24, end: 1.0), weight: 60),
    ]).animate(_ctrl);
    _startCountUp(0, widget.count);
    _lastComboKey = widget.comboKey;
    _ctrl.forward(from: 0);
  }

  @override
  void didUpdateWidget(covariant FlyingGiftCapsule oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.comboKey != _lastComboKey || widget.count != _toCount) {
      _startCountUp(_displayCount, widget.count);
      _lastComboKey = widget.comboKey;
      _ctrl.forward(from: 0);
    }
  }

  void _startCountUp(int from, int to) {
    _fromCount = from;
    _toCount = to;
    final duration = Duration(milliseconds: (to * 25).clamp(180, 600));
    final start = DateTime.now();
    Timer.periodic(const Duration(milliseconds: 16), (t) {
      if (!mounted || _toCount != to) {
        t.cancel();
        return;
      }
      final elapsed = DateTime.now().difference(start).inMilliseconds;
      final p = (elapsed / duration.inMilliseconds).clamp(0.0, 1.0);
      final eased = 1 - (1 - p) * (1 - p) * (1 - p);
      setState(() {
        _displayCount = (_fromCount + (to - _fromCount) * eased).round();
      });
      if (p >= 1.0) t.cancel();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  ({List<Color> bg, Color border, Color countColor, Color glow}) _tierStyle() {
    final diamonds = widget.event.perUnitDiamonds * widget.count;
    if (diamonds >= 10000) {
      // Premium — royal blue → soft violet with gold accents.
      return (
        bg: const [Color(0xF52C37BA), Color(0xEA5C63E0), Color(0x8CB0BEFF)],
        border: const Color(0x70F6DD85),
        countColor: const Color(0xFFFFF0A6),
        glow: const Color(0x473236A8),
      );
    }
    if (diamonds >= 1000) {
      // Luxury — indigo → periwinkle.
      return (
        bg: const [Color(0xF22D43C2), Color(0xE66A6EDE), Color(0x7AB9C4FF)],
        border: const Color(0x61CBD5FF),
        countColor: const Color(0xFFF3E9FF),
        glow: const Color(0x3D3741B9),
      );
    }
    // Standard — warm coral (Chamet default).
    return (
      bg: const [Color(0xEEF97316), Color(0xE6EF4444)],
      border: const Color(0x66FFFFFF),
      countColor: const Color(0xFFFFF6D5),
      glow: const Color(0x33000000),
    );
  }

  @override
  Widget build(BuildContext context) {
    final g = widget.event;
    final tier = _tierStyle();
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        return Transform.scale(
          scale: _entry.value.clamp(0.0, 1.0),
          alignment: Alignment.centerLeft,
          child: Container(
            padding: const EdgeInsets.fromLTRB(4, 4, 12, 4),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: tier.bg,
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
              ),
              borderRadius: BorderRadius.circular(30),
              border: Border.all(color: tier.border, width: 1),
              boxShadow: [
                BoxShadow(color: tier.glow, blurRadius: 14, offset: const Offset(0, 4)),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 14,
                  backgroundColor: Colors.white24,
                  backgroundImage: (g.senderAvatar != null && g.senderAvatar!.isNotEmpty)
                      ? NetworkImage(g.senderAvatar!)
                      : null,
                  child: (g.senderAvatar == null || g.senderAvatar!.isEmpty)
                      ? const Icon(Icons.person, size: 14, color: Colors.white)
                      : null,
                ),
                const SizedBox(width: 8),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 130),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        g.senderName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11.5,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      Text(
                        'sent ${g.giftName}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10.5,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                if (g.giftIcon != null && g.giftIcon!.isNotEmpty)
                  Image.network(
                    g.giftIcon!,
                    width: 30,
                    height: 30,
                    errorBuilder: (_, __, ___) =>
                        const Icon(Icons.card_giftcard, size: 24, color: Colors.white),
                  )
                else
                  const Icon(Icons.card_giftcard, size: 24, color: Colors.white),
                const SizedBox(width: 6),
                Transform.scale(
                  scale: _pop.value,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'x$_displayCount',
                    style: TextStyle(
                      color: tier.countColor,
                      fontSize: 16,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 0.4,
                      shadows: const [
                        Shadow(color: Colors.black54, blurRadius: 4),
                      ],
                    ),
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
