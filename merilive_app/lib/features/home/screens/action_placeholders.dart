import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';

/// Honest scaffold surfaces for the "+" FAB destinations.
///
/// Each screen ships a real Scaffold with the target's branding + a clear
/// "landing in Sector N" note so navigation is verifiable end-to-end today
/// without pretending unfinished features work.

class _ComingSoon extends StatelessWidget {
  const _ComingSoon({
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.gradient,
    required this.sector,
  });

  final String title;
  final String subtitle;
  final IconData icon;
  final List<Color> gradient;
  final String sector;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
        title: Text(title,
            style: const TextStyle(
                fontWeight: FontWeight.w800, color: Colors.white)),
      ),
      extendBodyBehindAppBar: true,
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: gradient,
          ),
        ),
        child: SafeArea(
          child: Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 96,
                    height: 96,
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.15),
                      shape: BoxShape.circle,
                      border: Border.all(
                          color: Colors.white.withOpacity(0.4), width: 2),
                    ),
                    child: Icon(icon, color: Colors.white, size: 48),
                  ),
                  const SizedBox(height: 24),
                  Text(title,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 26,
                        fontWeight: FontWeight.w900,
                      ),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 8),
                  Text(subtitle,
                      style: TextStyle(
                          color: Colors.white.withOpacity(0.9),
                          fontSize: 14,
                          height: 1.4),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 24),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.18),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                          color: Colors.white.withOpacity(0.3)),
                    ),
                    child: Text('Lands in $sector',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          letterSpacing: 0.4,
                        )),
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

@RoutePage()
class GoLivePlaceholderPage extends StatelessWidget {
  const GoLivePlaceholderPage({super.key});
  @override
  Widget build(BuildContext context) => const _ComingSoon(
        title: 'Go Live',
        subtitle:
            'Face verification + camera preview + broadcaster controls will be built out with the Live Streaming sector.',
        icon: Icons.radio_rounded,
        gradient: [Color(0xFFEF4444), Color(0xFFF43F5E)],
        sector: 'Sector 6 (Live Streaming)',
      );
}

@RoutePage()
class CreatePartyPlaceholderPage extends StatelessWidget {
  const CreatePartyPlaceholderPage({super.key});
  @override
  Widget build(BuildContext context) => const _ComingSoon(
        title: 'Create Party',
        subtitle:
            'Audio / video / game party rooms with seats, mic queue and moderation will be built out with the Party sector.',
        icon: Icons.celebration_rounded,
        gradient: [Color(0xFF9333EA), Color(0xFFEC4899)],
        sector: 'Sector 3 (Party)',
      );
}

@RoutePage()
class RandomCallPlaceholderPage extends StatelessWidget {
  const RandomCallPlaceholderPage({super.key});
  @override
  Widget build(BuildContext context) => const _ComingSoon(
        title: 'Random Call',
        subtitle:
            'Instant 1-on-1 video matching with gender/country filters and per-minute diamond billing will be built out with the Private Call sector.',
        icon: Icons.phone_in_talk_rounded,
        gradient: [Color(0xFF06B6D4), Color(0xFF3B82F6)],
        sector: 'Sector 7 (Private Call)',
      );
}

/// Live viewer placeholder — reached by tapping a LIVE host card.
/// Real player (LiveKit viewer + chat + gifts + PK) lands in the Live sector.
@RoutePage()
class LiveStreamPlaceholderPage extends StatelessWidget {
  const LiveStreamPlaceholderPage({
    super.key,
    @PathParam('streamId') required this.streamId,
  });
  final String streamId;
  @override
  Widget build(BuildContext context) => _ComingSoon(
        title: 'Live Stream',
        subtitle:
            'Stream ID: $streamId\n\nFull viewer player (LiveKit video/voice, chat, gifts, PK) lands with the Live Streaming sector.',
        icon: Icons.live_tv_rounded,
        gradient: const [Color(0xFFEF4444), Color(0xFFEC4899)],
        sector: 'Sector 6 (Live Streaming)',
      );
}

/// Profile detail placeholder — reached by tapping a BUSY / ONLINE / OFFLINE
/// host card. Real profile screen with follow/call CTAs lands with Profile.
@RoutePage()
class ProfileDetailPlaceholderPage extends StatelessWidget {
  const ProfileDetailPlaceholderPage({
    super.key,
    @PathParam('userId') required this.userId,
  });
  final String userId;
  @override
  Widget build(BuildContext context) => _ComingSoon(
        title: 'Profile',
        subtitle:
            'User ID: $userId\n\nFull profile (avatar frame, bio, gifts received, follow / call CTAs) lands with the Profile sector.',
        icon: Icons.account_circle_rounded,
        gradient: const [Color(0xFF06B6D4), Color(0xFF3B82F6)],
        sector: 'Sector 8 (Profile)',
      );
}
