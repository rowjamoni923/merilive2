import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';
import '../utils/design_system.dart';
import 'dynamic_avatar.dart';
import 'level_badge.dart';

class ProfessionalHeader extends StatelessWidget {
  final Map<String, dynamic> hostData;
  final int viewerCount;
  final int sessionBeans;
  final List<Map<String, dynamic>> recentViewers;
  final VoidCallback onFollow;
  final VoidCallback onClose;

  const ProfessionalHeader({
    super.key,
    required this.hostData,
    this.viewerCount = 0,
    this.sessionBeans = 0,
    this.recentViewers = const [],
    required this.onFollow,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          // 1. Host Group (Glass Badge)
          Flexible(child: _buildHostBadge()),
          const SizedBox(width: 8),
          // 2. Metrics Group (Viewer stack + Close)
          _buildMetricsGroup(),
        ],
      ),
    );
  }

  Widget _buildHostBadge() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(30),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          padding: const EdgeInsets.fromLTRB(2, 2, 12, 2),
          decoration: App3DDesign.glassDecoration(borderRadius: 24, opacity: 0.15),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              DynamicAvatar(
                avatarUrl: hostData['avatar_url'],
                frameId: hostData['equipped_frame_id'] ?? hostData['frame_id'],
                size: 36,
                showFrame: true,
                level: hostData['host_level'] ?? hostData['user_level'] ?? 1,
                isHost: true,
                isVerified: hostData['is_face_verified'] == true || hostData['is_verified'] == true,
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                     Row(
                       mainAxisSize: MainAxisSize.min,
                       children: [
                         Flexible(
                           child: Text(
                             hostData['display_name'] ?? 'Host',
                             maxLines: 1,
                             overflow: TextOverflow.ellipsis,
                             style: GoogleFonts.inter(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w800),
                           ),
                         ),
                         const SizedBox(width: 4),
                         LevelBadge(level: hostData['host_level'] ?? hostData['user_level'] ?? 1, size: 'xs'),
                       ],
                     ),
                     Text(
                       "ID: ${hostData['app_uid'] ?? (hostData['id']?.toString().split('-').first ?? '0000')}",
                       maxLines: 1,
                       overflow: TextOverflow.ellipsis,
                       style: GoogleFonts.inter(color: Colors.white70, fontSize: 9, fontWeight: FontWeight.w600),
                     ),
                  ],
                ),
              ),
              if (hostData['is_self'] != true) ...[
                const SizedBox(width: 8),
                _buildFollowButton(),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildFollowButton() {
     return GestureDetector(
        onTap: onFollow,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
          decoration: BoxDecoration(
            gradient: App3DDesign.premiumGradient,
            borderRadius: BorderRadius.circular(16),
            boxShadow: App3DDesign.buttonGlowShadow,
            border: Border.all(color: Colors.white24, width: 0.8),
          ),
          child: Text(
            "Follow",
            style: GoogleFonts.inter(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold),
          ),
        ),
     );
  }

  Widget _buildMetricsGroup() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
         // Session Beans
          _buildGlassMetric(
            icon: App3DDesign.beanIcon(size: 14),
            value: sessionBeans.toString(),
            color: const Color(0xFFFBBF24),
          ),
         const SizedBox(width: 8),
         // Viewer Stack
         _buildViewerStack(),
         const SizedBox(width: 12),
         // Close Button
         IconButton(
           icon: const Icon(LucideIcons.x, color: Colors.white, size: 24, shadows: [Shadow(color: Colors.black45, blurRadius: 4)]),
           onPressed: onClose,
           padding: EdgeInsets.zero,
           constraints: const BoxConstraints(),
         ),
      ],
    );
  }

  Widget _buildGlassMetric({required Widget icon, required String value, required Color color}) {
     return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: App3DDesign.glassDecoration(borderRadius: 23, opacity: 0.2),
        child: Row(
          children: [
            icon,
            const SizedBox(width: 6),
            Text(value, style: GoogleFonts.inter(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800)),
          ],
        ),
     );
  }

  Widget _buildViewerStack() {
    if (recentViewers.isEmpty) return const SizedBox.shrink();
    
    return SizedBox(
      width: 50, height: 26,
      child: Stack(
        children: List.generate(recentViewers.length.clamp(0, 3), (index) {
          return Positioned(
            right: index * 12.0,
            child: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white24, width: 1),
              ),
              child: CircleAvatar(
                radius: 12,
                backgroundImage: NetworkImage(recentViewers[index]['avatar_url'] ?? 'https://via.placeholder.com/50'),
              ),
            ),
          );
        }),
      ),
    );
  }
}


