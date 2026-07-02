// Professional host-info chip / viewer-count chip / live-duration pill.
//
// Flutter port of `src/components/live/ProfessionalHostInfo.tsx`. Three
// widgets, feature-parity with the web version's public API:
//
//   * [ProfessionalHostInfoChip]  – host avatar + name + verified + country +
//     level badge + follower count + follow button (+ optional close).
//   * [ProfessionalViewerCountChip] – stacked recent-viewer avatars + count.
//   * [LiveDurationPill] – red pulsing dot + HH:MM:SS ticker.

import 'dart:async';
import 'package:flutter/material.dart';

String _formatFollowerCount(int n) {
  if (n < 1000) return '$n';
  if (n < 1000000) {
    final k = n / 1000.0;
    final s = k < 10 ? k.toStringAsFixed(1) : k.toStringAsFixed(0);
    return '${s.replaceAll(RegExp(r'\.0$'), '')}K';
  }
  final m = n / 1000000.0;
  final s = m < 10 ? m.toStringAsFixed(1) : m.toStringAsFixed(0);
  return '${s.replaceAll(RegExp(r'\.0$'), '')}M';
}

Color _levelBadgeBg(int level) {
  if (level >= 60) return const Color(0xFFF59E0B);
  if (level >= 50) return const Color(0xFFEC4899);
  if (level >= 40) return const Color(0xFF8B5CF6);
  if (level >= 30) return const Color(0xFF06B6D4);
  if (level >= 20) return const Color(0xFF10B981);
  if (level >= 10) return const Color(0xFF3B82F6);
  return const Color(0xFF64748B);
}

class ProfessionalHostInfoChip extends StatelessWidget {
  const ProfessionalHostInfoChip({
    super.key,
    required this.name,
    required this.level,
    this.avatar,
    this.country = '🌍',
    this.isVerified = false,
    this.isFollowing = false,
    this.followersCount = 0,
    this.onFollow,
    this.onClose,
  });

  final String name;
  final int level;
  final String? avatar;
  final String country;
  final bool isVerified;
  final bool isFollowing;
  final int followersCount;
  final VoidCallback? onFollow;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    return AnimatedSlide(
      offset: Offset.zero,
      duration: const Duration(milliseconds: 240),
      curve: Curves.easeOutCubic,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.55),
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: Colors.white.withOpacity(0.1)),
          boxShadow: const [
            BoxShadow(
              color: Color(0x59000000),
              blurRadius: 10,
              offset: Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _AvatarWithRing(name: name, avatar: avatar, level: level),
            const SizedBox(width: 8),
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 84),
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 13,
                        ),
                      ),
                    ),
                    if (isVerified) ...[
                      const SizedBox(width: 4),
                      Container(
                        width: 14,
                        height: 14,
                        decoration: const BoxDecoration(
                          shape: BoxShape.circle,
                          color: Color(0xFF3B82F6),
                        ),
                        alignment: Alignment.center,
                        child: const Icon(
                          Icons.check,
                          size: 9,
                          color: Colors.white,
                        ),
                      ),
                    ],
                    const SizedBox(width: 4),
                    Text(country, style: const TextStyle(fontSize: 12)),
                  ],
                ),
                const SizedBox(height: 2),
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 5,
                        vertical: 1,
                      ),
                      decoration: BoxDecoration(
                        color: _levelBadgeBg(level),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        'Lv.$level',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 9,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${_formatFollowerCount(followersCount)} '
                      '${followersCount == 1 ? 'follower' : 'followers'}',
                      style: const TextStyle(
                        color: Colors.white60,
                        fontSize: 10,
                      ),
                    ),
                  ],
                ),
              ],
            ),
            const SizedBox(width: 8),
            _FollowButton(
              isFollowing: isFollowing,
              onTap: onFollow,
            ),
            if (onClose != null) ...[
              const SizedBox(width: 6),
              InkWell(
                borderRadius: BorderRadius.circular(999),
                onTap: onClose,
                child: Container(
                  padding: const EdgeInsets.all(4),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withOpacity(0.1),
                  ),
                  child: const Icon(Icons.close, size: 14, color: Colors.white70),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _AvatarWithRing extends StatelessWidget {
  const _AvatarWithRing({
    required this.name,
    required this.avatar,
    required this.level,
  });
  final String name;
  final String? avatar;
  final int level;

  @override
  Widget build(BuildContext context) {
    final ring = _levelBadgeBg(level);
    return Container(
      width: 34,
      height: 34,
      padding: const EdgeInsets.all(1.5),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [ring, ring.withOpacity(0.6)],
        ),
      ),
      child: ClipOval(
        child: (avatar ?? '').isNotEmpty
            ? Image.network(
                avatar!,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => _avatarFallback(name),
              )
            : _avatarFallback(name),
      ),
    );
  }

  Widget _avatarFallback(String name) => Container(
        color: const Color(0xFF6D28D9),
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

class _FollowButton extends StatelessWidget {
  const _FollowButton({required this.isFollowing, required this.onTap});
  final bool isFollowing;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 220),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            color: isFollowing ? Colors.white.withOpacity(0.2) : null,
            gradient: isFollowing
                ? null
                : const LinearGradient(
                    colors: [Color(0xFFEC4899), Color(0xFFA855F7)],
                  ),
          ),
          child: Text(
            isFollowing ? 'Following' : '+ Follow',
            style: TextStyle(
              color: isFollowing ? Colors.white70 : Colors.white,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}

class ProfessionalViewerCountChip extends StatelessWidget {
  const ProfessionalViewerCountChip({
    super.key,
    required this.count,
    this.recentViewers = const [],
    this.onTap,
  });

  final int count;
  final List<({String id, String? avatar, String name})> recentViewers;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final avatars = recentViewers.take(3).toList();
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(
            color: Colors.black.withOpacity(0.55),
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: Colors.white.withOpacity(0.1)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 20,
                width: 20 + (avatars.length - 1) * 12.0,
                child: Stack(
                  children: [
                    for (var i = 0; i < avatars.length; i++)
                      Positioned(
                        left: i * 12.0,
                        child: Container(
                          width: 20,
                          height: 20,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: Colors.black,
                              width: 1.5,
                            ),
                          ),
                          child: ClipOval(
                            child: (avatars[i].avatar ?? '').isNotEmpty
                                ? Image.network(
                                    avatars[i].avatar!,
                                    fit: BoxFit.cover,
                                    errorBuilder: (_, __, ___) => Container(
                                      color: const Color(0xFF6D28D9),
                                    ),
                                  )
                                : Container(
                                    color: const Color(0xFF6D28D9),
                                    alignment: Alignment.center,
                                    child: Text(
                                      avatars[i].name.isEmpty
                                          ? '?'
                                          : avatars[i]
                                              .name
                                              .characters
                                              .first
                                              .toUpperCase(),
                                      style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 10,
                                      ),
                                    ),
                                  ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              const Icon(
                Icons.remove_red_eye_rounded,
                size: 14,
                color: Color(0xFFF472B6),
              ),
              const SizedBox(width: 4),
              Text(
                count >= 1000
                    ? '${(count / 1000).toStringAsFixed(1)}K'
                    : '$count',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 13,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class LiveDurationPill extends StatefulWidget {
  const LiveDurationPill({super.key, required this.startTime});
  final DateTime startTime;

  @override
  State<LiveDurationPill> createState() => _LiveDurationPillState();
}

class _LiveDurationPillState extends State<LiveDurationPill>
    with SingleTickerProviderStateMixin {
  late Timer _timer;
  late AnimationController _blink;
  String _text = '00:00';

  @override
  void initState() {
    super.initState();
    _blink = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1000),
    )..repeat(reverse: true);
    _tick();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => _tick());
  }

  void _tick() {
    final diff = DateTime.now().difference(widget.startTime);
    final h = diff.inHours;
    final m = diff.inMinutes.remainder(60);
    final s = diff.inSeconds.remainder(60);
    setState(() {
      _text = h > 0
          ? '$h:${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}'
          : '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
    });
  }

  @override
  void dispose() {
    _timer.cancel();
    _blink.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0xFEEF4444),
        borderRadius: BorderRadius.circular(999),
        boxShadow: const [
          BoxShadow(
            color: Color(0x4D000000),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          FadeTransition(
            opacity: Tween<double>(begin: 1.0, end: 0.5).animate(_blink),
            child: Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white,
              ),
            ),
          ),
          const SizedBox(width: 6),
          Text(
            _text,
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.bold,
              fontSize: 12,
            ),
          ),
        ],
      ),
    );
  }
}
