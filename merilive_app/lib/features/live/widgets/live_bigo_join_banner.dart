// Bigo/Chamet-style single-slot flying join banner — Flutter port of
// `src/components/live/BigoStyleJoinBanner.tsx`.
//
// One VIP banner shown at a time (left-edge, ~28% from top). Feed events
// through [LiveBigoJoinBannerController]; VIPs (Lv40+) preempt the queue,
// hard cap 8. Cadence matches web: enter 280ms → hold 2.1–5s (tier) →
// exit 420ms.

import 'dart:async';
import 'package:flutter/material.dart';

class LiveJoinBannerEvent {
  LiveJoinBannerEvent({
    required this.id,
    required this.userId,
    required this.userName,
    required this.userLevel,
    this.userAvatar,
  });
  final String id;
  final String userId;
  final String userName;
  final int userLevel;
  final String? userAvatar;
}

int _levelHoldMs(int level) {
  if (level >= 60) return 5000;
  if (level >= 40) return 3500;
  if (level >= 20) return 2800;
  return 2100;
}

List<Color> _bannerGradient(int level) {
  if (level >= 60) {
    return const [Color(0xFFF59E0B), Color(0xFFFACC15), Color(0xFFFB923C)];
  }
  if (level >= 50) {
    return const [Color(0xFFF43F5E), Color(0xFFF472B6), Color(0xFFE879F9)];
  }
  if (level >= 40) {
    return const [Color(0xFFA855F7), Color(0xFFA78BFA), Color(0xFF818CF8)];
  }
  if (level >= 30) {
    return const [Color(0xFF06B6D4), Color(0xFF38BDF8), Color(0xFF60A5FA)];
  }
  if (level >= 20) {
    return const [Color(0xFF10B981), Color(0xFF34D399), Color(0xFF2DD4BF)];
  }
  if (level >= 10) {
    return const [Color(0xFF3B82F6), Color(0xFF818CF8), Color(0xFFA78BFA)];
  }
  return const [Color(0xFF64748B), Color(0xFF94A3B8), Color(0xFFA1A1AA)];
}

Color _avatarGlow(int level) {
  if (level >= 60) return const Color(0xCCFBBF24);
  if (level >= 50) return const Color(0xB3EC4899);
  if (level >= 40) return const Color(0x998B5CF6);
  if (level >= 30) return const Color(0x9922D3EE);
  if (level >= 20) return const Color(0x8010B981);
  return Colors.black26;
}

class LiveBigoJoinBannerController extends ChangeNotifier {
  static const int _highTier = 40;
  static const int _maxQueue = 8;

  final List<LiveJoinBannerEvent> _queue = [];
  LiveJoinBannerEvent? _active;

  LiveJoinBannerEvent? get active => _active;

  void add({
    required String userId,
    required String userName,
    required int userLevel,
    String? userAvatar,
  }) {
    final ev = LiveJoinBannerEvent(
      id: 'bigo_${DateTime.now().microsecondsSinceEpoch}_$userId',
      userId: userId,
      userName: userName,
      userLevel: userLevel,
      userAvatar: userAvatar,
    );
    if (userLevel >= _highTier) {
      var lastVip = -1;
      for (var i = 0; i < _queue.length; i++) {
        if (_queue[i].userLevel >= _highTier) lastVip = i;
      }
      _queue.insert(lastVip + 1, ev);
      if (_queue.length > _maxQueue) _queue.removeLast();
    } else {
      _queue.add(ev);
      if (_queue.length > _maxQueue) {
        final regularIdx = _queue.indexWhere((n) => n.userLevel < _highTier);
        if (regularIdx == -1) {
          _queue.removeLast();
        } else {
          _queue.removeAt(regularIdx);
        }
      }
    }
    _pump();
  }

  void _pump() {
    if (_active == null && _queue.isNotEmpty) {
      _active = _queue.removeAt(0);
      notifyListeners();
    }
  }

  void completeCurrent() {
    _active = null;
    _pump();
    notifyListeners();
  }

  void clear() {
    _queue.clear();
    _active = null;
    notifyListeners();
  }
}

class LiveBigoJoinBanner extends StatelessWidget {
  const LiveBigoJoinBanner({super.key, required this.controller});
  final LiveBigoJoinBannerController controller;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: controller,
      builder: (context, _) {
        final ev = controller.active;
        if (ev == null) return const SizedBox.shrink();
        return Align(
          alignment: const Alignment(-1, -0.44), // ~28% from top, left-edge
          child: _BannerBody(
            key: ValueKey(ev.id),
            event: ev,
            onDone: controller.completeCurrent,
          ),
        );
      },
    );
  }
}

class _BannerBody extends StatefulWidget {
  const _BannerBody({super.key, required this.event, required this.onDone});
  final LiveJoinBannerEvent event;
  final VoidCallback onDone;

  @override
  State<_BannerBody> createState() => _BannerBodyState();
}

class _BannerBodyState extends State<_BannerBody>
    with TickerProviderStateMixin {
  static const _enterMs = 280;
  static const _exitMs = 420;

  late final AnimationController _slide;
  late final AnimationController _pulse;
  late final AnimationController _sparkle;
  Timer? _visibleTimer;
  Timer? _exitTimer;
  bool _exiting = false;

  @override
  void initState() {
    super.initState();
    _slide = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: _enterMs),
    )..forward();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();
    _sparkle = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    )..repeat(reverse: true, count: 3);
    final hold = _levelHoldMs(widget.event.userLevel);
    _exitTimer = Timer(Duration(milliseconds: _enterMs + hold), () async {
      if (!mounted) return;
      setState(() => _exiting = true);
      _slide.duration = const Duration(milliseconds: _exitMs);
      await _slide.reverse(from: 1);
      if (mounted) widget.onDone();
    });
  }

  @override
  void dispose() {
    _visibleTimer?.cancel();
    _exitTimer?.cancel();
    _slide.dispose();
    _pulse.dispose();
    _sparkle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final level = widget.event.userLevel;
    final gradient = _bannerGradient(level);
    final glow = _avatarGlow(level);

    return AnimatedBuilder(
      animation: _slide,
      builder: (context, _) {
        final enter = Curves.easeOutBack.transform(_slide.value.clamp(0, 1));
        final dx = _exiting ? (1 - _slide.value) * 1.3 : -(1 - enter) * 1.1;
        return FractionalTranslation(
          translation: Offset(dx, 0),
          child: Opacity(
            opacity: _slide.value.clamp(0.0, 1.0),
            child: Container(
              margin: const EdgeInsets.only(right: 40),
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 8),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: gradient),
                borderRadius: const BorderRadius.horizontal(
                  right: Radius.circular(20),
                ),
                border: Border.all(color: Colors.white.withOpacity(0.4), width: 2),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Avatar with pulse
                  SizedBox(
                    width: 40,
                    height: 40,
                    child: Stack(
                      alignment: Alignment.center,
                      children: [
                        if (level >= 30)
                          AnimatedBuilder(
                            animation: _pulse,
                            builder: (_, __) => Container(
                              width: 40 + _pulse.value * 8,
                              height: 40 + _pulse.value * 8,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: Colors.white.withOpacity(
                                  0.3 * (1 - _pulse.value),
                                ),
                              ),
                            ),
                          ),
                        Container(
                          width: 36,
                          height: 36,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.white, width: 2),
                            boxShadow: [BoxShadow(color: glow, blurRadius: 12)],
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: (widget.event.userAvatar ?? '').isNotEmpty
                              ? Image.network(
                                  widget.event.userAvatar!,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) =>
                                      _fallback(widget.event.userName),
                                )
                              : _fallback(widget.event.userName),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 10),
                  // Level badge
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 8,
                      vertical: 2,
                    ),
                    decoration: BoxDecoration(
                      color: Colors.black.withOpacity(0.25),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (level >= 50)
                          const Text('👑', style: TextStyle(fontSize: 10)),
                        if (level >= 30 && level < 50)
                          const Text('💎', style: TextStyle(fontSize: 10)),
                        if (level >= 30) const SizedBox(width: 2),
                        Text(
                          'Lv.$level',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.w900,
                            letterSpacing: 0.5,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 110),
                    child: Text(
                      widget.event.userName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        shadows: [Shadow(color: Colors.black45, blurRadius: 4)],
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                  AnimatedBuilder(
                    animation: _sparkle,
                    builder: (_, __) => Transform.rotate(
                      angle: _sparkle.value * 0.7 - 0.35,
                      child: Transform.scale(
                        scale: 1 + _sparkle.value * 0.3,
                        child: const Text('✨',
                            style: TextStyle(fontSize: 16)),
                      ),
                    ),
                  ),
                  const SizedBox(width: 4),
                  const Text(
                    'joined the room',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      shadows: [Shadow(color: Colors.black45, blurRadius: 3)],
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _fallback(String name) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF7C3AED), Color(0xFF6D28D9)],
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        name.isEmpty ? '?' : name.characters.first.toUpperCase(),
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.bold,
          fontSize: 14,
        ),
      ),
    );
  }
}
