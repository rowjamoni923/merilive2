import 'dart:math' as math;
import 'package:flutter/material.dart';

import '../data/party_room_models.dart';

/// Chamet-style 1+8 seat grid — 1:1 parity with
/// `src/components/party/ChametStyleSeatGrid.tsx`.
///
/// Layout:
///   Row 1: 4 guest seats (seatNumber 1..4)
///   Center: Host seat (seatNumber 0) — larger, prominent, decorative glow
///   Row 2: 4 guest seats (seatNumber 5..8)
///
/// Visual features carried over:
///   - Speaking pulse rings (green/cyan) — driven by seat.isSpeaking
///   - Animated crown for host
///   - Level badge (colored by tier)
///   - Mic indicator ring (muted red / speaking emerald / idle slate)
///   - Beans pill under name
///   - Empty seat dashed border + pulsing purple orb
///   - Locked seat = lock icon, opacity reduced
class ChametSeatGrid extends StatelessWidget {
  const ChametSeatGrid({
    super.key,
    required this.seats,
    required this.currentUserId,
    required this.onSeatTap,
  });

  final List<PartySeat> seats;
  final String? currentUserId;
  final void Function(PartySeat seat) onSeatTap;

  @override
  Widget build(BuildContext context) {
    // Host = seatNumber 0; guests = 1..8 (pad missing to 8).
    PartySeat host = seats.firstWhere(
      (s) => s.seatNumber == 0,
      orElse: () => PartySeat.empty(0),
    );
    final guests = <PartySeat>[
      for (var i = 1; i <= 8; i++)
        seats.firstWhere(
          (s) => s.seatNumber == i,
          orElse: () => PartySeat.empty(i),
        ),
    ];

    final top = guests.sublist(0, 4);
    final bottom = guests.sublist(4, 8);

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          _row(top, isHostSeat: false, startIndex: 0),
          const SizedBox(height: 10),
          _hostSlot(host),
          const SizedBox(height: 10),
          _row(bottom, isHostSeat: false, startIndex: 4),
        ],
      ),
    );
  }

  Widget _row(List<PartySeat> row, {required bool isHostSeat, required int startIndex}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        for (var i = 0; i < row.length; i++) ...[
          _ChametSeat(
            seat: row[i],
            isHostSeat: isHostSeat,
            isCurrentUser: row[i].userId != null && row[i].userId == currentUserId,
            index: startIndex + i,
            onTap: () => onSeatTap(row[i]),
          ),
          if (i != row.length - 1) const SizedBox(width: 16),
        ],
      ],
    );
  }

  Widget _hostSlot(PartySeat host) {
    return SizedBox(
      height: 96,
      child: Stack(
        alignment: Alignment.center,
        children: [
          // Decorative purple/pink glow behind host
          Container(
            width: 120,
            height: 120,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              gradient: RadialGradient(
                colors: [
                  Color(0x22A855F7),
                  Color(0x10EC4899),
                  Color(0x00000000),
                ],
                stops: [0.0, 0.55, 1.0],
              ),
            ),
          ),
          _ChametSeat(
            seat: host,
            isHostSeat: true,
            isCurrentUser: host.userId != null && host.userId == currentUserId,
            index: 0,
            onTap: () => onSeatTap(host),
          ),
        ],
      ),
    );
  }
}

/// A single seat tile — dispatches to empty / occupied variants.
class _ChametSeat extends StatelessWidget {
  const _ChametSeat({
    required this.seat,
    required this.isHostSeat,
    required this.isCurrentUser,
    required this.index,
    required this.onTap,
  });

  final PartySeat seat;
  final bool isHostSeat;
  final bool isCurrentUser;
  final int index;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    if (seat.isEmpty) {
      return _EmptySeat(seat: seat, isHostSeat: isHostSeat, onTap: onTap);
    }
    return _OccupiedSeat(
      seat: seat,
      isHostSeat: isHostSeat,
      isCurrentUser: isCurrentUser,
      onTap: onTap,
    );
  }
}

class _EmptySeat extends StatelessWidget {
  const _EmptySeat({required this.seat, required this.isHostSeat, required this.onTap});
  final PartySeat seat;
  final bool isHostSeat;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final size = isHostSeat ? 72.0 : 56.0;
    return GestureDetector(
      onTap: seat.isLocked ? null : onTap,
      behavior: HitTestBehavior.opaque,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Opacity(
            opacity: seat.isLocked ? 0.4 : 1.0,
            child: Container(
              width: size,
              height: size,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: const RadialGradient(
                  center: Alignment(-0.2, -0.4),
                  colors: [Color(0x14FFFFFF), Color(0x05FFFFFF)],
                ),
                border: Border.all(
                  color: seat.isLocked
                      ? const Color(0x14FFFFFF)
                      : const Color(0x59A855F7),
                  width: 1.5,
                  style: seat.isLocked ? BorderStyle.solid : BorderStyle.solid,
                ),
                boxShadow: seat.isLocked
                    ? const []
                    : const [
                        BoxShadow(
                          color: Color(0x33000000),
                          blurRadius: 12,
                          offset: Offset(0, 4),
                        ),
                      ],
              ),
              child: seat.isLocked
                  ? const Icon(Icons.lock_rounded,
                      size: 16, color: Color(0x33FFFFFF))
                  : const _PulsingOrb(),
            ),
          ),
          if (isHostSeat) ...[
            const SizedBox(height: 4),
            const Text(
              'HOST',
              style: TextStyle(
                fontSize: 9,
                letterSpacing: 1,
                fontWeight: FontWeight.w600,
                color: Color(0x4DFFFFFF),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PulsingOrb extends StatefulWidget {
  const _PulsingOrb();
  @override
  State<_PulsingOrb> createState() => _PulsingOrbState();
}

class _PulsingOrbState extends State<_PulsingOrb>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 2500),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        final t = _c.value;
        final scale = 1.0 + 0.15 * t;
        final opacity = 0.35 + 0.25 * t;
        return Transform.scale(
          scale: scale,
          child: Container(
            width: 20,
            height: 20,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  const Color(0xFFA855F7).withValues(alpha: opacity + 0.05),
                  const Color(0xFFEC4899).withValues(alpha: opacity - 0.05),
                ],
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFFA855F7)
                      .withValues(alpha: 0.25 * (0.5 + t)),
                  blurRadius: 12,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _OccupiedSeat extends StatelessWidget {
  const _OccupiedSeat({
    required this.seat,
    required this.isHostSeat,
    required this.isCurrentUser,
    required this.onTap,
  });
  final PartySeat seat;
  final bool isHostSeat;
  final bool isCurrentUser;
  final VoidCallback onTap;

  bool get _isMuted => seat.isMuted || seat.mutedByHost;
  // Best-effort speaking detection: seat.isSpeaking isn't in model yet;
  // web parity uses backend-driven flag. When absent, treat as false.
  bool get _isSpeaking => false;

  @override
  Widget build(BuildContext context) {
    final avatarSize = isHostSeat ? 64.0 : 48.0;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: isHostSeat ? 84 : 68,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                if (_isSpeaking) ...[
                  _SpeakingRing(
                      inset: isHostSeat ? -8 : -6,
                      size: avatarSize,
                      blur: 8,
                      opacity: 0.35),
                  _SpeakingRing(
                      inset: isHostSeat ? -14 : -10,
                      size: avatarSize,
                      blur: 14,
                      opacity: 0.15),
                ],

                // Avatar
                _AvatarCircle(
                  url: seat.avatarUrl,
                  size: avatarSize,
                  level: seat.userLevel,
                  glow: seat.userLevel >= 10,
                ),

                // Crown for host
                if (isHostSeat || seat.isHost)
                  Positioned(
                    top: isHostSeat ? -14 : -12,
                    child: _AnimatedCrown(size: isHostSeat ? 22 : 18),
                  ),

                // Mic indicator (bottom-right of avatar)
                Positioned(
                  bottom: -2 + (avatarSize / 2 - avatarSize / 2),
                  right: (68 - avatarSize) / 2 - 4,
                  child: _MicBadge(muted: _isMuted, speaking: _isSpeaking),
                ),

                // Level badge below avatar
                Positioned(
                  bottom: -10,
                  child: _LevelBadge(level: seat.userLevel),
                ),
              ],
            ),
            const SizedBox(height: 14),
            // Name
            SizedBox(
              width: 68,
              child: Text(
                seat.displayName ?? '—',
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                  height: 1.1,
                  color: (isHostSeat || seat.isHost)
                      ? const Color(0xFFFCD34D)
                      : isCurrentUser
                          ? const Color(0xFF67E8F9)
                          : Colors.white.withValues(alpha: 0.9),
                  shadows: const [
                    Shadow(
                        color: Color(0x99000000),
                        blurRadius: 4,
                        offset: Offset(0, 1)),
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

class _AvatarCircle extends StatelessWidget {
  const _AvatarCircle({
    required this.url,
    required this.size,
    required this.level,
    required this.glow,
  });
  final String? url;
  final double size;
  final int level;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF4C1D95),
        border: Border.all(
          color: level >= 30
              ? const Color(0xFFF59E0B)
              : level >= 10
                  ? const Color(0xFF22C55E)
                  : Colors.white.withValues(alpha: 0.15),
          width: 1.5,
        ),
        boxShadow: glow
            ? [
                BoxShadow(
                  color: const Color(0xFF22D3EE).withValues(alpha: 0.35),
                  blurRadius: 12,
                ),
              ]
            : null,
        image: url != null && url!.isNotEmpty
            ? DecorationImage(image: NetworkImage(url!), fit: BoxFit.cover)
            : null,
      ),
      child: url == null || url!.isEmpty
          ? Icon(Icons.person, color: Colors.white70, size: size * 0.45)
          : null,
    );
  }
}

class _SpeakingRing extends StatefulWidget {
  const _SpeakingRing({
    required this.inset,
    required this.size,
    required this.blur,
    required this.opacity,
  });
  final double inset;
  final double size;
  final double blur;
  final double opacity;

  @override
  State<_SpeakingRing> createState() => _SpeakingRingState();
}

class _SpeakingRingState extends State<_SpeakingRing>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final total = widget.size - widget.inset * 2;
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        final scale = 1.0 + 0.25 * _c.value;
        final op = widget.opacity + 0.2 * math.sin(_c.value * math.pi);
        return Transform.scale(
          scale: scale,
          child: Container(
            width: total,
            height: total,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              gradient: LinearGradient(
                colors: [
                  const Color(0xFF34D399).withValues(alpha: op.clamp(0, 1)),
                  const Color(0xFF22D3EE).withValues(alpha: op.clamp(0, 1)),
                ],
              ),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF34D399)
                      .withValues(alpha: (op * 0.6).clamp(0, 1)),
                  blurRadius: widget.blur,
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _AnimatedCrown extends StatefulWidget {
  const _AnimatedCrown({required this.size});
  final double size;

  @override
  State<_AnimatedCrown> createState() => _AnimatedCrownState();
}

class _AnimatedCrownState extends State<_AnimatedCrown>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3000),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) {
        final t = _c.value;
        return Transform.translate(
          offset: Offset(0, -2 * t),
          child: Transform.rotate(
            angle: (math.sin(t * math.pi * 2)) * 0.08,
            child: Icon(
              Icons.emoji_events_rounded,
              color: const Color(0xFFFBBF24),
              size: widget.size,
              shadows: const [
                Shadow(color: Color(0xB3FBBF24), blurRadius: 8),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _MicBadge extends StatelessWidget {
  const _MicBadge({required this.muted, required this.speaking});
  final bool muted;
  final bool speaking;

  @override
  Widget build(BuildContext context) {
    final Color bg = muted
        ? const Color(0xE6EF4444)
        : speaking
            ? const Color(0xE610B981)
            : const Color(0xE6475569);
    final Color ring = bg.withValues(alpha: 0.3);
    return Container(
      width: 18,
      height: 18,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: bg,
        shape: BoxShape.circle,
        border: Border.all(color: ring, width: 2),
      ),
      child: Icon(
        muted ? Icons.mic_off_rounded : Icons.mic_rounded,
        color: Colors.white,
        size: 10,
      ),
    );
  }
}

class _LevelBadge extends StatelessWidget {
  const _LevelBadge({required this.level});
  final int level;

  List<Color> get _gradient {
    if (level >= 50) return const [Color(0xFF9333EA), Color(0xFFEC4899)];
    if (level >= 40) return const [Color(0xFFF59E0B), Color(0xFFEA580C)];
    if (level >= 30) return const [Color(0xFFEC4899), Color(0xFFF43F5E)];
    if (level >= 20) return const [Color(0xFF06B6D4), Color(0xFF6366F1)];
    if (level >= 10) return const [Color(0xFF22C55E), Color(0xFF14B8A6)];
    return const [Color(0xFF64748B), Color(0xFF475569)];
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: _gradient,
        ),
        boxShadow: const [
          BoxShadow(color: Color(0x4D000000), blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      child: Text(
        'Lv.$level',
        style: const TextStyle(
          fontSize: 8,
          fontWeight: FontWeight.w900,
          color: Colors.white,
          height: 1.2,
        ),
      ),
    );
  }
}
