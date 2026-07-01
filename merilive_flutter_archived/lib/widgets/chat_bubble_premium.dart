import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'level_badge.dart';
import '../services/admin_controller_service.dart';

class ChatBubblePremium extends StatelessWidget {
  final String text;
  final String? sender;
  final int level;
  final bool isHost;
  final bool isSystem;
  final bool isGift;
  final String? bubbleUrl; // For "Message Skin" background

  const ChatBubblePremium({
    super.key,
    required this.text,
    this.sender,
    this.level = 1,
    this.isHost = false,
    this.isSystem = false,
    this.isGift = false,
    this.bubbleUrl,
  });

  @override
  Widget build(BuildContext context) {
    if (isSystem) {
      return Container(
        margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          isGift ? "🎁 $text" : "📢 $text",
          style: GoogleFonts.inter(
            color: isGift ? const Color(0xFFF59E0B) : const Color(0xFF38BDF8),
            fontSize: 12,
            fontWeight: FontWeight.bold,
          ),
        ),
      );
    }

    // High-End Bubble Gradient based on level/role
    final Color baseColor = isHost 
        ? const Color(0xFFF43F5E) 
        : level >= AdminControllerService().premiumChatBubbleMinLevel 
            ? const Color(0xFFA855F7) 
            : Colors.white12;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              LevelBadge(level: level, size: 'xs'),
              const SizedBox(width: 6),
              if (isHost)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  margin: const EdgeInsets.only(right: 6),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF43F5E),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text("HOST", style: TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.bold)),
                ),
              Text(
                sender ?? "User",
                style: GoogleFonts.inter(
                  color: Colors.white70,
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
          const SizedBox(height: 2),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: baseColor.withOpacity(0.15),
              borderRadius: const BorderRadius.only(
                topRight: Radius.circular(20),
                bottomLeft: Radius.circular(20),
                bottomRight: Radius.circular(20),
              ),
              border: Border.all(color: baseColor.withOpacity(0.3), width: 0.5),
              // Support for Custom Background Designs (Bubble Skins)
              image: bubbleUrl != null 
                ? DecorationImage(
                    image: NetworkImage(bubbleUrl!),
                    fit: BoxFit.fill,
                  )
                : null,
            ),
            child: Text(
              text,
              style: GoogleFonts.inter(
                color: Colors.white,
                fontSize: 14,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}


