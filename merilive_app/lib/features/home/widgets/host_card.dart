import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/design_tokens.dart';
import '../data/home_host.dart';
import '../data/thumbnail.dart';

/// Full-photo host card — port of `src/components/home/LiveStreamCard.tsx`
/// + non-live `UserCard.tsx`. Aspect 3:4, edge-to-edge photo, LIVE/BUSY/
/// ONLINE pill top-left, viewer count (LIVE) or per-min diamonds (non-live)
/// top-right, name + country flag pinned to bottom on a soft gradient scrim.
///
/// Tap routing matrix (parity with Index.tsx `handleUserClick`):
///   • LIVE   → /live/:liveStreamId       (viewer stream)
///   • BUSY   → /profile-detail/:userId   (host is on a call)
///   • ONLINE → /profile-detail/:userId
///   • OFFLINE→ /profile-detail/:userId
class HostCard extends StatelessWidget {
  const HostCard({
    super.key,
    required this.host,
    required this.onTap,
  });

  final HomeHost host;
  final VoidCallback onTap;

  static const _placeholder = 'assets/images/placeholder_avatar.png';

  Color _pillColor(HostStatus s) => switch (s) {
        HostStatus.live => DT.statusLive,
        HostStatus.busy => DT.statusBusy,
        HostStatus.online => DT.statusOnline,
        HostStatus.offline => DT.homeMutedInk,
      };

  String _pillLabel(HostStatus s) => switch (s) {
        HostStatus.live => 'LIVE',
        HostStatus.busy => 'BUSY',
        HostStatus.online => 'ONLINE',
        HostStatus.offline => 'OFFLINE',
      };

  String? _photoUrl() {
    // LIVE cards prefer the live thumbnail (fresh camera frame); fall back to
    // avatar so the tile still looks premium if the thumbnail hasn't landed.
    final raw = host.isLive && (host.liveThumbnailUrl?.isNotEmpty ?? false)
        ? host.liveThumbnailUrl
        : host.avatarUrl;
    return enhanceThumbnail(raw, width: 600, quality: 90, sharpen: 1.4);
  }

  String _formatViewers(int n) {
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return '$n';
  }

  @override
  Widget build(BuildContext context) {
    final photo = _photoUrl();
    return Semantics(
      button: true,
      label: '${host.displayName}, ${_pillLabel(host.status)}',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Material(
          color: DT.homeChipBg,
          child: InkWell(
            onTap: () {
              HapticFeedback.selectionClick();
              onTap();
            },
            child: AspectRatio(
              aspectRatio: 3 / 4,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Photo
                  if (photo != null)
                    Image.network(
                      photo,
                      fit: BoxFit.cover,
                      gaplessPlayback: true,
                      errorBuilder: (_, __, ___) => _AvatarFallback(name: host.displayName),
                    )
                  else
                    _AvatarFallback(name: host.displayName),

                  // Bottom scrim for legibility
                  const _BottomScrim(),

                  // Status pill (top-left)
                  Positioned(
                    top: 8,
                    left: 8,
                    child: _StatusPill(
                      label: _pillLabel(host.status),
                      color: _pillColor(host.status),
                      pulse: host.status == HostStatus.live,
                    ),
                  ),

                  // Viewer count (LIVE only) or per-min diamonds
                  if (host.isLive)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: _MetaChip(
                        icon: Icons.remove_red_eye_rounded,
                        label: _formatViewers(host.liveViewerCount),
                      ),
                    )
                  else if (host.callRatePerMinute != null)
                    Positioned(
                      top: 8,
                      right: 8,
                      child: _MetaChip(
                        icon: Icons.diamond_rounded,
                        label: '${host.callRatePerMinute} / min',
                      ),
                    ),

                  // Bottom info: name + country flag
                  Positioned(
                    left: 10,
                    right: 10,
                    bottom: 10,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          host.displayName,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 13,
                            fontWeight: FontWeight.w800,
                            shadows: [
                              Shadow(
                                color: Color(0xB3000000),
                                offset: Offset(0, 1),
                                blurRadius: 6,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            if ((host.countryFlag ?? '').isNotEmpty) ...[
                              Text(host.countryFlag!,
                                  style: const TextStyle(fontSize: 12)),
                              const SizedBox(width: 4),
                            ],
                            if (host.hostLevel > 0) ...[
                              const Icon(Icons.star_rounded,
                                  size: 12, color: Color(0xFFFBBF24)),
                              const SizedBox(width: 2),
                              Text(
                                'Lv ${host.hostLevel}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 10.5,
                                  fontWeight: FontWeight.w700,
                                  shadows: [
                                    Shadow(
                                      color: Color(0xB3000000),
                                      offset: Offset(0, 1),
                                      blurRadius: 4,
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _BottomScrim extends StatelessWidget {
  const _BottomScrim();
  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [Color(0x00000000), Color(0xB3000000)],
            stops: [0.55, 1.0],
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.label,
    required this.color,
    required this.pulse,
  });
  final String label;
  final Color color;
  final bool pulse;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(999),
        boxShadow: [
          BoxShadow(
            color: color.withOpacity(0.45),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (pulse) ...[
            const _PulsingDot(),
            const SizedBox(width: 5),
          ],
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

class _PulsingDot extends StatefulWidget {
  const _PulsingDot();
  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: Tween<double>(begin: 0.45, end: 1).animate(_c),
      child: Container(
        width: 6,
        height: 6,
        decoration: const BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});
  final IconData icon;
  final String label;
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3.5),
      decoration: BoxDecoration(
        color: const Color(0x80000000),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: Colors.white),
          const SizedBox(width: 4),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _AvatarFallback extends StatelessWidget {
  const _AvatarFallback({required this.name});
  final String name;
  @override
  Widget build(BuildContext context) {
    final initial = name.trim().isEmpty ? '?' : name.trim()[0].toUpperCase();
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFFEC4899), Color(0xFFA855F7)],
        ),
      ),
      alignment: Alignment.center,
      child: Text(
        initial,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 42,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}
