import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';

/// B6 — Bigo/Chamet-style compact join banner (Flutter port of
/// `src/components/live/BigoStyleJoinBanner.tsx`).
///
/// Renders left-anchored, one-at-a-time, tier-gradient join capsules
/// with an enter-from-left → hold → exit-to-right cadence. Used for
/// non-premium joins (Lv < 20, no noble / no equipped entrance) that
/// don't warrant a full-width cinematic banner.
///
/// **Welcome coalescer:** identical join events (same userId) that
/// arrive inside a 500 ms window are dropped — some rooms emit multiple
/// join events (presence + rpc + participant) for the same person, so
/// the coalescer keeps banners from spamming twice for one entrance.
class BigoJoinPayload {
  BigoJoinPayload({
    required this.userId,
    required this.userName,
    required this.userLevel,
    this.avatarUrl,
  });

  final String userId;
  final String userName;
  final int userLevel;
  final String? avatarUrl;
}

class BigoJoinQueue {
  BigoJoinQueue._();
  static final BigoJoinQueue instance = BigoJoinQueue._();

  final _controller = StreamController<BigoJoinPayload?>.broadcast();
  final Queue<BigoJoinPayload> _pending = Queue();
  BigoJoinPayload? _active;
  Timer? _endTimer;

  /// Welcome coalescer window — dedupe repeat join events for the
  /// same user within 500 ms.
  static const Duration _coalesceWindow = Duration(milliseconds: 500);
  final Map<String, DateTime> _lastSeen = {};
  // Enter ~280 + hold (tier) + exit ~420 ms — matches web cadence.
  static const int _enterMs = 280;
  static const int _exitMs = 420;
  static const int _maxQueue = 8;

  Stream<BigoJoinPayload?> get stream$ => _controller.stream;

  void enqueue(BigoJoinPayload p) {
    final now = DateTime.now();
    final last = _lastSeen[p.userId];
    if (last != null && now.difference(last) < _coalesceWindow) {
      return; // coalesced — drop dup within window.
    }
    _lastSeen[p.userId] = now;

    // Bounded queue: drop the OLDEST entry to keep memory sane on
    // viral bursts (never drop active, never drop the newest).
    if (_pending.length >= _maxQueue) {
      _pending.removeFirst();
    }
    _pending.add(p);
    _drain();
  }

  void _drain() {
    if (_active != null || _pending.isEmpty) return;
    _active = _pending.removeFirst();
    _controller.add(_active);
    final holdMs = _holdMsForLevel(_active!.userLevel);
    final total = _enterMs + holdMs + _exitMs;
    _endTimer = Timer(Duration(milliseconds: total), () {
      _active = null;
      _controller.add(null);
      _drain();
    });
  }

  int _holdMsForLevel(int level) {
    if (level >= 60) return 5000;
    if (level >= 40) return 3500;
    if (level >= 20) return 2800;
    return 2100;
  }

  void clear() {
    _endTimer?.cancel();
    _pending.clear();
    _active = null;
    _lastSeen.clear();
    _controller.add(null);
  }
}

class BigoJoinBannerOverlay extends StatelessWidget {
  const BigoJoinBannerOverlay({super.key, this.topFraction = 0.28});

  /// Vertical anchor as a fraction of the screen height (0 = top,
  /// 1 = bottom). Web reference uses 28%.
  final double topFraction;

  @override
  Widget build(BuildContext context) {
    final screenH = MediaQuery.of(context).size.height;
    return Positioned(
      top: screenH * topFraction,
      left: 0,
      child: IgnorePointer(
        child: StreamBuilder<BigoJoinPayload?>(
          stream: BigoJoinQueue.instance.stream$,
          builder: (context, snap) {
            final p = snap.data;
            return AnimatedSwitcher(
              duration: const Duration(milliseconds: 320),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, anim) {
                final slide = Tween<Offset>(
                  begin: const Offset(-1.1, 0),
                  end: Offset.zero,
                ).animate(anim);
                return FadeTransition(
                  opacity: anim,
                  child: SlideTransition(position: slide, child: child),
                );
              },
              child: p == null
                  ? const SizedBox.shrink()
                  : _BigoBannerCard(key: ValueKey(p.hashCode), payload: p),
            );
          },
        ),
      ),
    );
  }
}

class _BigoBannerCard extends StatefulWidget {
  const _BigoBannerCard({super.key, required this.payload});
  final BigoJoinPayload payload;

  @override
  State<_BigoBannerCard> createState() => _BigoBannerCardState();
}

class _BigoBannerCardState extends State<_BigoBannerCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _sweep;

  @override
  void initState() {
    super.initState();
    _sweep = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..forward();
  }

  @override
  void dispose() {
    _sweep.dispose();
    super.dispose();
  }

  List<Color> _bgFor(int level) {
    if (level >= 60) {
      return const [Color(0xFFF59E0B), Color(0xFFFACC15), Color(0xFFFB923C)];
    }
    if (level >= 50) {
      return const [Color(0xFFF43F5E), Color(0xFFF472B6), Color(0xFFE879F9)];
    }
    if (level >= 40) {
      return const [Color(0xFFA855F7), Color(0xFF8B5CF6), Color(0xFF6366F1)];
    }
    if (level >= 30) {
      return const [Color(0xFF06B6D4), Color(0xFF38BDF8), Color(0xFF60A5FA)];
    }
    if (level >= 20) {
      return const [Color(0xFF10B981), Color(0xFF34D399), Color(0xFF2DD4BF)];
    }
    if (level >= 10) {
      return const [Color(0xFF3B82F6), Color(0xFF6366F1), Color(0xFF8B5CF6)];
    }
    return const [Color(0xFF64748B), Color(0xFF9CA3AF), Color(0xFFA1A1AA)];
  }

  Color _badgeBg(int level) {
    if (level >= 60) return const Color(0xFFB45309);
    if (level >= 50) return const Color(0xFFBE185D);
    if (level >= 40) return const Color(0xFF6D28D9);
    if (level >= 30) return const Color(0xFF0369A1);
    if (level >= 20) return const Color(0xFF047857);
    if (level >= 10) return const Color(0xFF1D4ED8);
    return const Color(0xFF475569);
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.payload;
    final bg = _bgFor(p.userLevel);
    return Container(
      constraints: const BoxConstraints(maxWidth: 300),
      padding: const EdgeInsets.fromLTRB(6, 6, 14, 6),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: bg),
        borderRadius: const BorderRadius.only(
          topRight: Radius.circular(20),
          bottomRight: Radius.circular(20),
        ),
        border: Border.all(color: Colors.white.withValues(alpha: 0.4), width: 1.5),
        boxShadow: [
          BoxShadow(
            color: bg.last.withValues(alpha: 0.5),
            blurRadius: 16,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Stack(
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  boxShadow: p.userLevel >= 30
                      ? [
                          BoxShadow(
                            color: Colors.white.withValues(alpha: 0.6),
                            blurRadius: 12,
                          ),
                        ]
                      : const [],
                ),
                child: CircleAvatar(
                  radius: 18,
                  backgroundColor: Colors.white24,
                  backgroundImage:
                      (p.avatarUrl != null && p.avatarUrl!.isNotEmpty)
                          ? NetworkImage(p.avatarUrl!)
                          : null,
                  child: (p.avatarUrl == null || p.avatarUrl!.isEmpty)
                      ? Text(
                          p.userName.isNotEmpty
                              ? p.userName[0].toUpperCase()
                              : '?',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w800,
                          ),
                        )
                      : null,
                ),
              ),
              const SizedBox(width: 10),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: _badgeBg(p.userLevel),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(
                  'Lv.${p.userLevel}',
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.4,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 110),
                child: Text(
                  p.userName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 13,
                    fontWeight: FontWeight.w800,
                    shadows: [
                      Shadow(color: Colors.black45, blurRadius: 4),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 6),
              const Text('✨',
                  style: TextStyle(
                    fontSize: 14,
                    shadows: [Shadow(color: Colors.black45, blurRadius: 3)],
                  )),
              const SizedBox(width: 4),
              const Text(
                'joined the room',
                style: TextStyle(
                  color: Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  shadows: [Shadow(color: Colors.black45, blurRadius: 3)],
                ),
              ),
            ],
          ),
          // Single-pass light-sweep shimmer on enter.
          Positioned.fill(
            child: ClipRRect(
              borderRadius: const BorderRadius.only(
                topRight: Radius.circular(20),
                bottomRight: Radius.circular(20),
              ),
              child: AnimatedBuilder(
                animation: _sweep,
                builder: (context, _) => FractionalTranslation(
                  translation: Offset(-1.0 + _sweep.value * 2.2, 0),
                  child: IgnorePointer(
                    child: Container(
                      decoration: const BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.centerLeft,
                          end: Alignment.centerRight,
                          colors: [
                            Color(0x00FFFFFF),
                            Color(0x33FFFFFF),
                            Color(0x00FFFFFF),
                          ],
                          stops: [0.35, 0.5, 0.65],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
