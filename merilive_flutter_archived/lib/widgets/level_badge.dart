import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

class LevelStyle {
  final dynamic icon;
  final String emoji;
  final List<Color> gradient;
  final Color shadowColor;
  final Color textColor;
  final String name;

  LevelStyle({
    required this.icon,
    required this.emoji,
    required this.gradient,
    required this.shadowColor,
    required this.textColor,
    required this.name,
  });
}

class LevelBadge extends StatelessWidget {
  final int level;
  final String size; // 'xs', 'sm', 'md', 'lg', 'xl'
  final bool isHost;
  final bool showLabel;

  const LevelBadge({
    super.key,
    required this.level,
    this.size = 'sm',
    this.isHost = false,
    this.showLabel = false,
  });

  LevelStyle _getStyle() {
    if (isHost) {
      if (level >= 8) {
        return LevelStyle(icon: LucideIcons.crown, emoji: "👸", gradient: [const Color(0xFFFBBF24), const Color(0xFFEAB308), const Color(0xFFD97706)], shadowColor: const Color(0xFFFBBF24), textColor: const Color(0xFFFBBF24), name: "Legend");
      }
      if (level >= 7) {
        return LevelStyle(icon: LucideIcons.crown, emoji: "👸", gradient: [const Color(0xFF8B5CF6), const Color(0xFF7C3AED), const Color(0xFF6D28D9)], shadowColor: const Color(0xFF8B5CF6), textColor: const Color(0xFF8B5CF6), name: "Goddess");
      }
      if (level >= 6) {
        return LevelStyle(icon: LucideIcons.crown, emoji: "👑", gradient: [const Color(0xFFA855F7), const Color(0xFF9333EA), const Color(0xFF7E22CE)], shadowColor: const Color(0xFFA855F7), textColor: const Color(0xFFA855F7), name: "Queen");
      }
      if (level >= 5) {
        return LevelStyle(icon: LucideIcons.heart, emoji: "💜", gradient: [const Color(0xFFF43F5E), const Color(0xFFA855F7), const Color(0xFFE11D48)], shadowColor: const Color(0xFFF43F5E), textColor: const Color(0xFFF43F5E), name: "Super Star");
      }
      if (level >= 4) {
        return LevelStyle(icon: Icons.local_florist, emoji: "💐", gradient: [const Color(0xFFF43F5E), const Color(0xFFE11D48), const Color(0xFFBE185D)], shadowColor: const Color(0xFFF43F5E), textColor: const Color(0xFFF43F5E), name: "Star");
      }
      if (level >= 3) {
        return LevelStyle(icon: Icons.local_florist, emoji: "🌹", gradient: [const Color(0xFFEC4899), const Color(0xFFF43F5E), const Color(0xFFDB2777)], shadowColor: const Color(0xFFEC4899), textColor: const Color(0xFFEC4899), name: "Famous");
      }
      if (level >= 2) {
        return LevelStyle(icon: Icons.local_florist, emoji: "🌺", gradient: [const Color(0xFFFB7185), const Color(0xFFEC4899), const Color(0xFFF43F5E)], shadowColor: const Color(0xFFFB7185), textColor: const Color(0xFFFB7185), name: "Popular");
      }
      if (level >= 1) {
        return LevelStyle(icon: Icons.local_florist, emoji: "🌷", gradient: [const Color(0xFFF472B6), const Color(0xFFFB7185), const Color(0xFFEC4899)], shadowColor: const Color(0xFFF472B6), textColor: const Color(0xFFF472B6), name: "Rising Star");
      }
      return LevelStyle(icon: Icons.local_florist, emoji: "🌸", gradient: [const Color(0xFFFCE7F3), const Color(0xFFF9A8D4), const Color(0xFFF472B6)], shadowColor: const Color(0xFFF9A8D4), textColor: const Color(0xFFF9A8D4), name: "New Host");
    } else {
      if (level >= 50) return LevelStyle(icon: LucideIcons.trophy, emoji: "💎", gradient: [const Color(0xFFF87171), const Color(0xFFF43F5E), const Color(0xFFE11D48)], shadowColor: const Color(0xFFF43F5E), textColor: const Color(0xFFF87171), name: "Divine");
      if (level >= 40) return LevelStyle(icon: LucideIcons.crown, emoji: "💎", gradient: [const Color(0xFFFB923C), const Color(0xFFF59E0B), const Color(0xFFEA580C)], shadowColor: const Color(0xFFF59E0B), textColor: const Color(0xFFFB923C), name: "Immortal");
      if (level >= 30) return LevelStyle(icon: LucideIcons.crown, emoji: "💎", gradient: [const Color(0xFFFBBF24), const Color(0xFFEAB308), const Color(0xFFD97706)], shadowColor: const Color(0xFFEAB308), textColor: const Color(0xFFFBBF24), name: "Legend");
      if (level >= 20) return LevelStyle(icon: LucideIcons.crown, emoji: "💎", gradient: [const Color(0xFFFDE047), const Color(0xFFFACC15), const Color(0xFFEAB308)], shadowColor: const Color(0xFFFACC15), textColor: const Color(0xFFFDE047), name: "Master");
      if (level >= 10) return LevelStyle(icon: LucideIcons.crown, emoji: "💎", gradient: [const Color(0xFFFBBF24), const Color(0xFFEAB308), const Color(0xFFF97316)], shadowColor: const Color(0xFFEAB308), textColor: const Color(0xFFFBBF24), name: "King");
      if (level >= 8) return LevelStyle(icon: LucideIcons.crown, emoji: "💎", gradient: [const Color(0xFFFDE68A), const Color(0xFFF59E0B), const Color(0xFFD97706)], shadowColor: const Color(0xFFF59E0B), textColor: const Color(0xFFFBBF24), name: "Noble");
      if (level >= 6) return LevelStyle(icon: LucideIcons.star, emoji: "💎", gradient: [const Color(0xFFC084FC), const Color(0xFFA855F7), const Color(0xFF9333EA)], shadowColor: const Color(0xFFA855F7), textColor: const Color(0xFFC084FC), name: "Elite");
      if (level >= 5) return LevelStyle(icon: LucideIcons.gem, emoji: "💎", gradient: [const Color(0xFF6366F1), const Color(0xFFA855F7), const Color(0xFF4F46E5)], shadowColor: const Color(0xFF6366F1), textColor: const Color(0xFF818CF8), name: "Diamond");
      if (level >= 4) return LevelStyle(icon: LucideIcons.gem, emoji: "💎", gradient: [const Color(0xFF818CF8), const Color(0xFF6366F1), const Color(0xFF4F46E5)], shadowColor: const Color(0xFF6366F1), textColor: const Color(0xFF818CF8), name: "Platinum");
      if (level >= 3) return LevelStyle(icon: LucideIcons.gem, emoji: "💎", gradient: [const Color(0xFF3B82F6), const Color(0xFF2563EB), const Color(0xFF4F46E5)], shadowColor: const Color(0xFF3B82F6), textColor: const Color(0xFF60A5FA), name: "Gold");
      if (level >= 2) return LevelStyle(icon: LucideIcons.gem, emoji: "💎", gradient: [const Color(0xFF60A5FA), const Color(0xFF3B82F6), const Color(0xFF2563EB)], shadowColor: const Color(0xFF3B82F6), textColor: const Color(0xFF60A5FA), name: "Silver");
      if (level >= 1) return LevelStyle(icon: LucideIcons.gem, emoji: "💎", gradient: [const Color(0xFF93C5FD), const Color(0xFF60A5FA), const Color(0xFF3B82F6)], shadowColor: const Color(0xFF60A5FA), textColor: const Color(0xFF93C5FD), name: "Bronze");
      return LevelStyle(icon: LucideIcons.sparkles, emoji: "🤍", gradient: [const Color(0xFFD1D5DB), const Color(0xFF9CA3AF), const Color(0xFF6B7280)], shadowColor: const Color(0xFF9CA3AF), textColor: const Color(0xFFD1D5DB), name: "Beginner");
    }
  }

  @override
  Widget build(BuildContext context) {
    final style = _getStyle();
    
    double height;
    double iconSize;
    double fontSize;
    double ringWidth;
    
    switch (size) {
      case 'xs':
        height = 16; iconSize = 8; fontSize = 8; ringWidth = 1;
        break;
      case 'sm':
        height = 20; iconSize = 10; fontSize = 10; ringWidth = 1.5;
        break;
      case 'md':
        height = 28; iconSize = 14; fontSize = 12; ringWidth = 2;
        break;
      case 'lg':
        height = 36; iconSize = 18; fontSize = 14; ringWidth = 2.5;
        break;
      case 'xl':
        height = 48; iconSize = 24; fontSize = 18; ringWidth = 4;
        break;
      default:
        height = 20; iconSize = 10; fontSize = 10; ringWidth = 1.5;
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          height: height,
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: style.gradient,
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(height / 2),
            border: Border.all(color: Colors.white.withOpacity(0.3), width: ringWidth),
            boxShadow: [
              BoxShadow(
                color: style.shadowColor.withOpacity(0.5),
                blurRadius: 10,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                style.icon is IconData ? style.icon as IconData : Icons.star,
                color: Colors.white,
                size: iconSize,
              ),
              const SizedBox(width: 4),
              Text(
                "Lv.$level",
                style: TextStyle(
                  color: Colors.white,
                  fontSize: fontSize,
                  fontWeight: FontWeight.bold,
                  shadows: [
                    Shadow(color: Colors.black.withOpacity(0.3), offset: const Offset(0, 1), blurRadius: 2),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (showLabel) ...[
          const SizedBox(height: 4),
          Text(
            style.name,
            style: TextStyle(
              color: style.textColor,
              fontSize: fontSize * 0.9,
              fontWeight: FontWeight.bold,
            ),
          ),
        ],
      ],
    );
  }
}
