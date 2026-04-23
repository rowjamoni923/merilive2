import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'level_badge.dart';
import 'avatar_with_frame.dart';

class PremiumPartyCard extends StatelessWidget {
  final Map<String, dynamic> room;
  final VoidCallback onTap;

  const PremiumPartyCard({
    super.key,
    required this.room,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final host = room['host'] as Map<String, dynamic>?;
    final String hostAvatar = host?['avatar_url'] ?? "";
    final String roomName = room['name'] ?? "Party Room";
    final String type = room['room_type'] ?? "audio";
    final int participants = room['current_participants'] ?? 0;
    final int level = host?['user_level'] ?? 1;
    final bool isPrivate = room['is_private'] == true;
    final String? gameMode = room['game_mode'];
    final String? frameUrl = host?['frame_id'] != null ? "https://your-storage-url/frames/${host?['frame_id']}.png" : null;

    // Type Colors (Web Parity)
    Color typeColor = const Color(0xFF3B82F6); // Audio - Blue
    if (type == 'video') typeColor = const Color(0xFF10B981); // Video - Emerald
    if (type == 'game') typeColor = const Color(0xFFEC4899); // Game - Rose

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B).withOpacity(0.4),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(0.2),
              blurRadius: 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          children: [
            // 1. Top Section - Room Cover + Badges
            Expanded(
              flex: 5,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  // Cover Image (Host Avatar)
                  if (hostAvatar.isNotEmpty)
                    Image.network(hostAvatar, fit: BoxFit.cover)
                  else
                    Container(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [typeColor.withOpacity(0.8), typeColor],
                        ),
                      ),
                    ),
                  
                  // Gradient Overlay
                  Container(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        colors: [
                          Colors.transparent,
                          Colors.black.withOpacity(0.1),
                          Colors.black.withOpacity(0.8),
                        ],
                        stops: const [0.0, 0.4, 1.0],
                      ),
                    ),
                  ),

                  // Room Type Badge (Top Left)
                  Positioned(
                    top: 8, left: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: typeColor.withOpacity(0.9),
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [BoxShadow(color: typeColor.withOpacity(0.3), blurRadius: 4)],
                      ),
                      child: Row(
                        children: [
                          Icon(_getTypeIcon(type), color: Colors.white, size: 10),
                          const SizedBox(width: 4),
                          Text(
                            type.toUpperCase(),
                            style: GoogleFonts.inter(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w900, letterSpacing: 0.5),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Participants Badge (Top Right)
                  Positioned(
                    top: 8, right: 8,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black.withOpacity(0.5),
                        borderRadius: BorderRadius.circular(20),
                        
                      ),
                      child: Row(
                        children: [
                          const Icon(LucideIcons.users, color: Colors.white70, size: 10),
                          const SizedBox(width: 4),
                          Text(
                            "$participants",
                            style: GoogleFonts.inter(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold),
                          ),
                        ],
                      ),
                    ),
                  ),

                  // Game Mode Pulse (Center)
                  if (gameMode != null && gameMode.isNotEmpty)
                    Center(
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(colors: [Color(0xFFD946EF), Color(0xFF9333EA)]),
                          shape: BoxShape.circle,
                          border: Border.all(color: Colors.white.withOpacity(0.3), width: 1.5),
                          boxShadow: [BoxShadow(color: const Color(0xFF9333EA).withOpacity(0.5), blurRadius: 12)],
                        ),
                        child: Text(
                          _getGameEmoji(gameMode),
                          style: const TextStyle(fontSize: 20),
                        ),
                      ),
                    ),

                  // Private Lock (Bottom Right of top section)
                  if (isPrivate)
                    Positioned(
                      bottom: 8, right: 8,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                        child: const Icon(LucideIcons.lock, color: Color(0xFFFBBF24), size: 10),
                      ),
                    ),
                ],
              ),
            ),
            
            // 2. Bottom Section - Host Info
            Container(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    roomName,
                    style: GoogleFonts.inter(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      // Host Avatar (Sleek)
                      SizedBox(
                        width: 24, height: 24,
                        child: AvatarWithFrame(
                          src: hostAvatar,
                          name: host?['display_name'] ?? "Host",
                          userId: host?['app_uid'] ?? host?['id']?.toString() ?? "0",
                          level: level,
                          size: 24,
                        ),
                      ),
                      const SizedBox(width: 6),
                      // Level Badge
                      LevelBadge(level: level, isHost: host?['is_host'] == true, size: 'xs'),
                      const Spacer(),
                      // Flag
                      if (host?['country_flag'] != null)
                        Text(host!['country_flag'], style: const TextStyle(fontSize: 14)),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  IconData _getTypeIcon(String type) {
    switch (type) {
      case 'video': return LucideIcons.monitor;
      case 'audio': return LucideIcons.mic;
      case 'game': return LucideIcons.gamepad2;
      default: return LucideIcons.mic;
    }
  }

  String _getGameEmoji(String gameMode) {
    switch (gameMode.toLowerCase()) {
      case 'ludo': return '🎲';
      case 'lucky28': return '🃏';
      case 'spin': return '🎡';
      case 'wheel': return '🎡';
      case 'crash': return '🚀';
      case 'quiz': return '🧠';
      default: return '🎮';
    }
  }
}


