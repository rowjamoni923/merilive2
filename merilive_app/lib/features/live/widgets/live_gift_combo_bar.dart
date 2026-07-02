import 'dart:async';
import 'package:flutter/material.dart';

import '../data/live_chat_bridge.dart';

/// B4 — Right-anchored combo bar.
///
/// Mirrors web `GiftComboDisplay` + `GiftComboTracker`: when the same
/// sender fires the same gift repeatedly inside a 4s window, the row
/// collapses into a single stacked capsule with a bouncing `xN` counter
/// instead of spawning a new pill for every hit.
///
/// Purely presentational. Full-screen VAP animations stay on the native
/// gift dispatcher — this bar is the always-on Flutter counter surface
/// that guarantees viewers *see* the combo count even when native VAP
/// isn't equipped (image-fallback gifts, low-tier gifts).
class LiveGiftComboBar extends StatefulWidget {
  const LiveGiftComboBar({super.key, required this.stream});
  final Stream<LiveGiftEvent> stream;

  @override
  State<LiveGiftComboBar> createState() => _LiveGiftComboBarState();
}

class _ComboSlot {
  _ComboSlot(this.event, this.count);
  LiveGiftEvent event;
  int count;
  Timer? timer;
  final GlobalKey<_ComboCapsuleState> bumpKey = GlobalKey<_ComboCapsuleState>();
}

class _LiveGiftComboBarState extends State<LiveGiftComboBar> {
  final List<_ComboSlot> _slots = [];
  StreamSubscription<LiveGiftEvent>? _sub;
  static const int _maxSlots = 4;
  static const Duration _window = Duration(seconds: 4);

  @override
  void initState() {
    super.initState();
    _sub = widget.stream.listen(_onGift);
  }

  void _onGift(LiveGiftEvent g) {
    final key = '${g.senderId ?? g.senderName}|${g.giftId ?? g.giftName}';
    final existing = _slots.indexWhere(
      (s) => '${s.event.senderId ?? s.event.senderName}|${s.event.giftId ?? s.event.giftName}' == key,
    );
    setState(() {
      if (existing >= 0) {
        final slot = _slots[existing];
        slot.count += g.quantity;
        slot.event = g;
        slot.timer?.cancel();
        slot.timer = Timer(_window, () => _expire(slot));
        // move to top
        _slots.removeAt(existing);
        _slots.insert(0, slot);
        WidgetsBinding.instance.addPostFrameCallback(
          (_) => slot.bumpKey.currentState?.bump(),
        );
      } else {
        final slot = _ComboSlot(g, g.quantity);
        slot.timer = Timer(_window, () => _expire(slot));
        _slots.insert(0, slot);
        if (_slots.length > _maxSlots) {
          final dropped = _slots.removeLast();
          dropped.timer?.cancel();
        }
      }
    });
  }

  void _expire(_ComboSlot s) {
    if (!mounted) return;
    setState(() {
      s.timer?.cancel();
      _slots.remove(s);
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    for (final s in _slots) {
      s.timer?.cancel();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        for (final s in _slots)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: _ComboCapsule(key: s.bumpKey, event: s.event, count: s.count),
          ),
      ],
    );
  }
}

class _ComboCapsule extends StatefulWidget {
  const _ComboCapsule({super.key, required this.event, required this.count});
  final LiveGiftEvent event;
  final int count;

  @override
  State<_ComboCapsule> createState() => _ComboCapsuleState();
}

class _ComboCapsuleState extends State<_ComboCapsule>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _entry;
  late final Animation<double> _pop;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 280),
    )..forward();
    _entry = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutBack);
    _pop = TweenSequence<double>([
      TweenSequenceItem(tween: Tween(begin: 1.0, end: 1.28), weight: 40),
      TweenSequenceItem(tween: Tween(begin: 1.28, end: 1.0), weight: 60),
    ]).animate(_ctrl);
  }

  void bump() {
    _ctrl
      ..reset()
      ..forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final g = widget.event;
    return AnimatedBuilder(
      animation: _ctrl,
      builder: (context, _) {
        return Transform.scale(
          scale: _entry.value.clamp(0.0, 1.0),
          child: Container(
            padding: const EdgeInsets.fromLTRB(6, 4, 10, 4),
            decoration: BoxDecoration(
              gradient: const LinearGradient(colors: [
                Color(0xE6F97316),
                Color(0xE6EF4444),
              ]),
              borderRadius: BorderRadius.circular(30),
              boxShadow: const [
                BoxShadow(
                    color: Colors.black45,
                    blurRadius: 10,
                    offset: Offset(0, 3)),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                CircleAvatar(
                  radius: 12,
                  backgroundColor: Colors.white24,
                  backgroundImage: (g.senderAvatar != null && g.senderAvatar!.isNotEmpty)
                      ? NetworkImage(g.senderAvatar!)
                      : null,
                  child: (g.senderAvatar == null || g.senderAvatar!.isEmpty)
                      ? const Icon(Icons.person, size: 12, color: Colors.white)
                      : null,
                ),
                const SizedBox(width: 6),
                if (g.giftIcon != null && g.giftIcon!.isNotEmpty)
                  Image.network(
                    g.giftIcon!,
                    width: 22,
                    height: 22,
                    errorBuilder: (_, __, ___) => const Icon(
                        Icons.card_giftcard,
                        size: 20,
                        color: Colors.white),
                  )
                else
                  const Icon(Icons.card_giftcard,
                      size: 20, color: Colors.white),
                const SizedBox(width: 6),
                Transform.scale(
                  scale: _pop.value,
                  alignment: Alignment.centerLeft,
                  child: Text(
                    'x${widget.count}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 15,
                      fontWeight: FontWeight.w900,
                      shadows: [
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
