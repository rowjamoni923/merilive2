import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';

class LevelProgressCard extends StatelessWidget {
  final int level;
  final double progress; // 0.0 to 100.0
  final int currentXP;
  final int nextLevelXP;
  final int nextLevelNumber;
  final bool isHost;
  final String? iconUrl;
  final VoidCallback onTap;

  const LevelProgressCard({
    super.key,
    required this.level,
    required this.progress,
    required this.currentXP,
    required this.nextLevelXP,
    required this.nextLevelNumber,
    required this.isHost,
    this.iconUrl,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final Color themeColor = isHost ? const Color(0xFFEC4899) : const Color(0xFF3B82F6);
    final String levelTypeLabel = isHost ? '👸 Host Level' : '💎 User Level';
    
    return GestureDetector(
      onTap: onTap,
      child: FadeInUp(
        duration: const Duration(milliseconds: 600),
        child: Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                themeColor.withOpacity(0.15),
                themeColor.withOpacity(0.05),
              ],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: themeColor.withOpacity(0.2), width: 1.5),
            boxShadow: [
              BoxShadow(
                color: themeColor.withOpacity(0.05),
                blurRadius: 20,
                offset: const Offset(0, 10),
              )
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: themeColor.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: themeColor.withOpacity(0.3)),
                    ),
                    child: Text(
                      levelTypeLabel,
                      style: GoogleFonts.outfit(
                        color: themeColor,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.5,
                      ),
                    ),
                  ),
                  Icon(LucideIcons.chevronRight, color: Colors.white.withOpacity(0.2), size: 18),
                ],
              ),
              const SizedBox(height: 16),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        "Level",
                        style: GoogleFonts.outfit(
                          color: Colors.white.withOpacity(0.6),
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Text(
                        level.toString(),
                        style: GoogleFonts.outfit(
                          color: Colors.white,
                          fontSize: 48,
                          fontWeight: FontWeight.black,
                          height: 1,
                        ),
                      ),
                    ],
                  ),
                  if (iconUrl != null && iconUrl!.startsWith('http'))
                    Pulse(
                      infinite: true,
                      child: CachedNetworkImage(
                        imageUrl: iconUrl!,
                        width: 60,
                        height: 60,
                        fit: BoxFit.contain,
                      ),
                    )
                  else
                    Pulse(
                      infinite: true,
                      child: Text(
                        isHost ? "👸" : "💎",
                        style: const TextStyle(fontSize: 40),
                      ),
                    ),
                ],
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: themeColor.withOpacity(0.3),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          "Lv$level",
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(
                        isHost ? LucideIcons.beans : LucideIcons.gem,
                        color: Colors.amber,
                        size: 14,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        _formatNumber(currentXP),
                        style: GoogleFonts.spaceMono(
                          color: Colors.amber.shade300,
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ],
                  ),
                  Text(
                    "Lv$nextLevelNumber",
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.4),
                      fontSize: 10,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Stack(
                children: [
                  Container(
                    height: 10,
                    width: double.infinity,
                    decoration: BoxDecoration(
                      color: themeColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                  ),
                  FractionallySizedBox(
                    widthFactor: (progress / 100.0).clamp(0.0, 1.0),
                    child: Container(
                      height: 10,
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [themeColor, themeColor.withOpacity(0.6)],
                        ),
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: [
                          BoxShadow(
                            color: themeColor.withOpacity(0.3),
                            blurRadius: 4,
                            spreadRadius: 1,
                          )
                        ],
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                "Need ${_formatNumber(nextLevelXP - currentXP)} more to level up",
                style: GoogleFonts.outfit(
                  color: themeColor.withOpacity(0.7),
                  fontSize: 11,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _formatNumber(int number) {
    if (number >= 1000000000) return "${(number / 1000000000).toStringAsFixed(1)}B";
    if (number >= 1000000) return "${(number / 1000000).toStringAsFixed(1)}M";
    if (number >= 1000) return "${(number / 1000).toStringAsFixed(1)}K";
    return number.toString();
  }
}
