import 'dart:async';
import 'dart:collection';

import 'package:flutter/material.dart';

/// B6/B7 — Cinematic full-width join banner (Flutter fallback).
///
/// Mirrors web `BigoStyleJoinBanner` + `CinematicEntranceOverlay`: for
/// premium joins (Lv ≥ 20 or noble/vehicle equipped) that DON'T have a
/// native VAP renderer available, this overlay renders a full-width
/// gradient banner with an ease-in-from-right → hold → ease-out-to-left
/// motion and a subtle light-sweep, so the moment still lands with real
/// weight on Flutter surfaces.
class CinematicJoinPayload {
  CinematicJoinPayload({
    required this.userName,
    required this.userLevel,
    this.avatarUrl,
    this.tagline,
    this.nobleLabel,
  });

  final String userName;
  final int userLevel;
  final String? avatarUrl;
  final String? tagline;
  final String? nobleLabel;
}

class CinematicJoinQueue {
  CinematicJoinQueue._();
  static final CinematicJoinQueue instance = CinematicJoinQueue._();

  final _controller = StreamController<CinematicJoinPayload?>.broadcast();
  final Queue<CinematicJoinPayload> _pending = Queue();
  CinematicJoinPayload? _active;
  Timer? _endTimer;
  static const Duration _duration = Duration(milliseconds: 3800);

  Stream<CinematicJoinPayload?> get stream$ => _controller.stream;

  void enqueue(CinematicJoinPayload p) {
    _pending.add(p);
    _drain();
  }

  void _drain() {
    if (_active != null || _pending.isEmpty) return;
    _active = _pending.removeFirst();
    _controller.add(_active);
    _endTimer = Timer(_duration, () {
      _active = null;
      _controller.add(null);
      _drain();
    });
  }

  void clear() {
    _endTimer?.cancel();
    _pending.clear();
    _active = null;
    _controller.add(null);
  }
}

class CinematicJoinBannerOverlay extends StatelessWidget {
  const CinematicJoinBannerOverlay({super.key, this.topOffset});
  final double? topOffset;

  @override
  Widget build(BuildContext context) {
    final safeTop = topOffset ?? (MediaQuery.of(context).padding.top + 120);
    return Positioned(
      top: safeTop,
      left: 0,
      right: 0,
      child: IgnorePointer(
        child: StreamBuilder<CinematicJoinPayload?>(
          stream: CinematicJoinQueue.instance.stream$,
          builder: (context, snap) {
            final p = snap.data;
            return AnimatedSwitcher(
              duration: const Duration(milliseconds: 320),
              switchInCurve: Curves.easeOutCubic,
              switchOutCurve: Curves.easeInCubic,
              transitionBuilder: (child, anim) => FadeTransition(
                opacity: anim,
                child: SlideTransition(
                  position: Tween(
                    begin: const Offset(1.0, 0.0),
                    end: Offset.zero,
                  ).animate(anim),
                  child: child,
                ),
              ),
              child: p == null
                  ? const SizedBox.shrink()
                  : _BannerCard(key: ValueKey(p.hashCode), payload: p),
            );
          },
        ),
      ),
    );
  }
}

class _BannerCard extends StatefulWidget {
  const _BannerCard({super.key, required this.payload});
  final CinematicJoinPayload payload;

  @override
  State<_BannerCard> createState() => _BannerCardState();
}

class _BannerCardState extends State<_BannerCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _sweep;

  @override
  void initState() {
    super.initState();
    _sweep = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat();
  }

  @override
  void dispose() {
    _sweep.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final p = widget.payload;
    final tier = _tier(p.userLevel, p.nobleLabel);
    final avatar = p.avatarUrl;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: Stack(
          children: [
            Container(
              height: 64,
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: tier.gradient),
                boxShadow: [
                  BoxShadow(
                    color: tier.gradient.last.withValues(alpha: 0.55),
                    blurRadius: 24,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(2),
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: Colors.white70, width: 1.5),
                    ),
                    child: CircleAvatar(
                      radius: 20,
                      backgroundColor: Colors.white24,
                      backgroundImage:
                          (avatar != null && avatar.isNotEmpty)
                              ? NetworkImage(avatar)
                              : null,
                      child: (avatar == null || avatar.isEmpty)
                          ? const Icon(Icons.person,
                              size: 20, color: Colors.white70)
                          : null,
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                p.userName,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                  shadows: [
                                    Shadow(
                                        color: Colors.black45, blurRadius: 3),
                                  ],
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.black.withValues(alpha: 0.35),
                                borderRadius: BorderRadius.circular(999),
                              ),
                              child: Text(
                                'Lv.${p.userLevel}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text(
                          p.tagline ?? '${tier.label} has entered the room',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: Colors.white.withValues(alpha: 0.9),
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            letterSpacing: 0.2,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  Icon(tier.icon, size: 22, color: Colors.white),
                ],
              ),
            ),
            // Light-sweep shimmer
            AnimatedBuilder(
              animation: _sweep,
              builder: (context, _) {
                return Positioned.fill(
                  child: FractionalTranslation(
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
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  _Tier _tier(int level, String? noble) {
    if (noble != null && noble.isNotEmpty) {
      return _Tier(noble, const [Color(0xFFF59E0B), Color(0xFFB45309)],
          Icons.workspace_premium_rounded);
    }
    if (level >= 60) {
      return _Tier('Legend', const [Color(0xFFF59E0B), Color(0xFFEF4444)],
          Icons.local_fire_department_rounded);
    }
    if (level >= 40) {
      return _Tier('Diamond', const [Color(0xFF06B6D4), Color(0xFFA855F7)],
          Icons.diamond_rounded);
    }
    return _Tier('Elite', const [Color(0xFF8B5CF6), Color(0xFFEC4899)],
        Icons.star_rounded);
  }
}

class _Tier {
  const _Tier(this.label, this.gradient, this.icon);
  final String label;
  final List<Color> gradient;
  final IconData icon;
}
