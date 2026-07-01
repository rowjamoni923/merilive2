import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:math' as math;
import 'avatar_with_frame.dart';
import 'level_badge.dart';

class PremiumLiveCard extends StatefulWidget {
  final Map<String, dynamic> user;
  final VoidCallback onTap;

  const PremiumLiveCard({
    super.key,
    required this.user,
    required this.onTap,
  });

  @override
  State<PremiumLiveCard> createState() => _PremiumLiveCardState();
}

class _PremiumLiveCardState extends State<PremiumLiveCard> with SingleTickerProviderStateMixin {
  late AnimationController _rotationController;

  @override
  void initState() {
    super.initState();
    _rotationController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 4),
    )..repeat();
  }

  @override
  void dispose() {
    _rotationController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final user = widget.user;
    final bool isLive = user['isLive'] ?? false;
    final bool isFemaleHost = user['is_host'] == true && 
        (user['gender']?.toString().toLowerCase() == 'female');
    final int level = isFemaleHost ? (user['host_level'] ?? 0) : (user['user_level'] ?? 1);
    final bool isActuallyBusy = user['actuallyBusy'] ?? (user['is_in_call'] == true);
    final bool isOnline = user['is_online'] ?? false;
    final bool isVerified = user['is_verified'] == true || user['is_face_verified'] == true;

    // Web Parity: Border Glow Logic
    Widget buildCard(double glowOpacity) {
      Color borderColor = Colors.white.withOpacity(0.06);
      List<BoxShadow> shadows = [];

      if (isLive) {
        borderColor = const Color(0xFFEF4444).withOpacity(0.4 + (glowOpacity * 0.2));
        shadows = [
          BoxShadow(
            color: const Color(0xFFEF4444).withOpacity(0.4 * glowOpacity), 
            blurRadius: 12 + (8 * glowOpacity),
            spreadRadius: 2 * glowOpacity
          )
        ];
      } else if (level >= 40) {
        borderColor = const Color(0xFFFBBF24).withOpacity(0.3);
        shadows = [BoxShadow(color: const Color(0xFFFBBF24).withOpacity(0.35), blurRadius: 12)];
      } else if (level >= 20) {
        borderColor = const Color(0xFFA855F7).withOpacity(0.25);
        shadows = [BoxShadow(color: const Color(0xFFA855F7).withOpacity(0.3), blurRadius: 10)];
      } else if (level >= 10) {
        borderColor = const Color(0xFF3B82F6).withOpacity(0.2);
        shadows = [BoxShadow(color: const Color(0xFF3B82F6).withOpacity(0.25), blurRadius: 8)];
      }

      return Container(
        decoration: BoxDecoration(
          color: const Color(0xFF1A1A2E).withOpacity(0.6),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: borderColor, width: isLive ? 1.5 : 1.0),
          boxShadow: shadows,
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            // 1. Thumbnail
            Positioned.fill(
              child: Image.network(
                (isLive && user['liveThumbnailUrl'] != null) 
                    ? user['liveThumbnailUrl'] 
                    : (user['avatar_url'] ?? ''),
                fit: BoxFit.cover,
                errorBuilder: (context, error, stackTrace) => Container(
                  color: Colors.grey[900],
                  child: const Icon(LucideIcons.user, color: Colors.white24, size: 40),
                ),
              ),
            ),

            // 2. Gradient Overlay (Web Parity)
            Positioned.fill(
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Colors.black.withOpacity(0.1),
                      Colors.transparent,
                      Colors.black.withOpacity(0.8),
                    ],
                    stops: const [0.0, 0.4, 1.0],
                  ),
                ),
              ),
            ),

            // 3. Status Badges
            Positioned(
              top: 10,
              left: 8,
              child: _buildStatusBadge(isLive, isOnline, isActuallyBusy),
            ),

            // 4. Viewer Count or Verified
            if (isLive && (user['viewerCount'] ?? 0) > 0)
              Positioned(
                top: 10,
                right: 8,
                child: _buildViewerBadge(user['viewerCount']),
              )
            else if (isVerified)
              Positioned(
                top: 10,
                right: 8,
                child: const VerifiedBadge(),
              ),

            // 5. Profile Section 
            Positioned(
              bottom: 10,
              left: 10,
              right: 10,
              child: Row(
                 crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Expanded(child: _buildProfileInfo(user, level, isFemaleHost)),
                ],
              ),
            ),
          ],
        ),
      );
    }

    return GestureDetector(
      onTap: widget.onTap,
      child: AspectRatio(
        aspectRatio: 3 / 4, // Exact Web Parity
        child: AnimatedBuilder(
          animation: _rotationController,
          builder: (context, child) {
            final double glowValue = (math.sin(_rotationController.value * 2 * math.pi) + 1) / 2;
            return buildCard(glowValue);
          },
        ),
      ),
    );
  }

  Widget _buildStatusBadge(bool isLive, bool isOnline, bool isBusy) {
    if (isLive) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFFEF4444), Color(0xFFEC4899)]),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [BoxShadow(color: const Color(0xFFEF4444).withOpacity(0.5), blurRadius: 12)],
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const DotPulseIndicator(),
            const SizedBox(width: 6),
            Text("LIVE", style: GoogleFonts.inter(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
          ],
        ),
      );
    }
    if (isOnline) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          gradient: isBusy 
             ? LinearGradient(colors: [const Color(0xFFF59E0B).withOpacity(0.9), const Color(0xFFD97706).withOpacity(0.9)])
             : LinearGradient(colors: [const Color(0xFF10B981).withOpacity(0.9), const Color(0xFF059669).withOpacity(0.9)]),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(width: 6, height: 6, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)),
            const SizedBox(width: 6),
            Text(isBusy ? "Busy" : "Online", style: GoogleFonts.inter(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }

  Widget _buildViewerBadge(int? count) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.6),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.1)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.eye, color: Colors.white, size: 12),
          const SizedBox(width: 4),
          Text("${count ?? 0}", style: GoogleFonts.inter(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildProfileInfo(Map<String, dynamic> user, int level, bool isHost) {
    return Row(
      children: [
        AvatarWithFrame(
          userId: user['id'],
          src: user['avatar_url'] ?? '',
          name: user['display_name'] ?? 'U',
          size: 24.0,
          isHost: isHost,
          level: level,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                user['display_name'] ?? 'User',
                style: GoogleFonts.inter(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold, shadows: [const Shadow(color: Colors.black, blurRadius: 6)]),
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  LevelBadge(level: level, size: 'xs'),
                  if (user['country_flag'] != null && user['country_flag'] != 'NONE') ...[
                    const SizedBox(width: 6),
                    Text(user['country_flag'], style: const TextStyle(fontSize: 12)),
                  ],
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildCallButton() {
    return Container(
      width: 40,
      height: 40,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: const LinearGradient(colors: [Color(0xFF10B981), Color(0xFF059669)]),
        boxShadow: [
          BoxShadow(color: const Color(0xFF10B981).withOpacity(0.4), blurRadius: 12, offset: const Offset(0, 4)),
        ],
        border: Border.all(color: Colors.white.withOpacity(0.3), width: 1.5),
      ),
      child: const Icon(LucideIcons.phone, color: Colors.white, size: 18),
    );
  }
}

class VerifiedBadge extends StatelessWidget {
  const VerifiedBadge({super.key});
  @override
  Widget build(BuildContext context) {
    return Container(
      width: 24, height: 24,
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF60A5FA), Color(0xFF06B6D4)]),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withOpacity(0.3), width: 1.5),
        boxShadow: [BoxShadow(color: const Color(0xFF3B82F6).withOpacity(0.5), blurRadius: 8)],
      ),
      child: const Icon(Icons.check, color: Colors.white, size: 12, weight: 900),
    );
  }
}

class DotPulseIndicator extends StatefulWidget {
  const DotPulseIndicator({super.key});
  @override
  State<DotPulseIndicator> createState() => _DotPulseIndicatorState();
}

class _DotPulseIndicatorState extends State<DotPulseIndicator> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  @override
  void initState() {
    super.initState();
    _controller = AnimationController(vsync: this, duration: const Duration(milliseconds: 800))..repeat(reverse: true);
  }
  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }
  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _controller,
      child: Container(width: 6, height: 6, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)),
    );
  }
}


