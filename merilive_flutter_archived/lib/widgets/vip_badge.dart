import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';

class VIPConfig {
  final List<Color> gradient;
  final IconData icon;
  final String label;
  final Color textColor;
  final Color pulseColor;
  final List<BoxShadow> glow;

  VIPConfig({
    required this.gradient,
    required this.icon,
    required this.label,
    required this.textColor,
    required this.pulseColor,
    required this.glow,
  });
}

class VIPBadge extends StatelessWidget {
  final int tier;
  final String size; // 'xs', 'sm', 'md', 'lg'
  final bool showLabel;
  final bool animated;

  const VIPBadge({
    super.key,
    required this.tier,
    this.size = 'md',
    this.showLabel = true,
    this.animated = true,
  });

  VIPConfig? _getConfig() {
    switch (tier) {
      case 6:
        return VIPConfig(
          gradient: [const Color(0xFF9333EA), const Color(0xFFEC4899), const Color(0xFFC026D3)],
          icon: LucideIcons.crown,
          label: "VIP 6",
          textColor: Colors.white,
          pulseColor: const Color(0xFFA855F7).withOpacity(0.5),
          glow: [BoxShadow(color: const Color(0xFFA855F7).withOpacity(0.7), blurRadius: 20)],
        );
      case 5:
        return VIPConfig(
          gradient: [const Color(0xFFF43F5E), const Color(0xFFEC4899), const Color(0xFFE11D48)],
          icon: LucideIcons.gem,
          label: "VIP 5",
          textColor: Colors.white,
          pulseColor: const Color(0xFFF472B6).withOpacity(0.5),
          glow: [BoxShadow(color: const Color(0xFFF472B6).withOpacity(0.6), blurRadius: 16)],
        );
      case 4:
        return VIPConfig(
          gradient: [const Color(0xFF22D3EE), const Color(0xFF3B82F6), const Color(0xFF06B6D4)],
          icon: LucideIcons.gem,
          label: "VIP 4",
          textColor: Colors.white,
          pulseColor: const Color(0xFF22D3EE).withOpacity(0.4),
          glow: [BoxShadow(color: const Color(0xFF22D3EE).withOpacity(0.6), blurRadius: 14)],
        );
      case 3:
        return VIPConfig(
          gradient: [const Color(0xFFD1D5DB), const Color(0xFFE5E7EB), const Color(0xFF9CA3AF)],
          icon: LucideIcons.star,
          label: "VIP 3",
          textColor: Colors.black87,
          pulseColor: const Color(0xFFE5E7EB).withOpacity(0.4),
          glow: [BoxShadow(color: const Color(0xFFE5E7EB).withOpacity(0.5), blurRadius: 12)],
        );
      case 2:
        return VIPConfig(
          gradient: [const Color(0xFFFBBF24), const Color(0xFFFACC15), const Color(0xFFF59E0B)],
          icon: LucideIcons.sparkles,
          label: "VIP 2",
          textColor: const Color(0xFF78350F),
          pulseColor: const Color(0xFFFBBF24).withOpacity(0.4),
          glow: [BoxShadow(color: const Color(0xFFFBBF24).withOpacity(0.5), blurRadius: 10)],
        );
      case 1:
        return VIPConfig(
          gradient: [const Color(0xFF94A3B8), const Color(0xFF9CA3AF), const Color(0xFF64748B)],
          icon: LucideIcons.shield,
          label: "VIP 1",
          textColor: Colors.white,
          pulseColor: const Color(0xFF94A3B8).withOpacity(0.3),
          glow: [BoxShadow(color: const Color(0xFF94A3B8).withOpacity(0.4), blurRadius: 8)],
        );
      default:
        return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final config = _getConfig();
    if (config == null) return const SizedBox.shrink();

    double height;
    double iconSize;
    double fontSize;
    double borderRadius;

    switch (size) {
      case 'xs':
        height = 16; iconSize = 10; fontSize = 8; borderRadius = 4;
        break;
      case 'sm':
        height = 20; iconSize = 12; fontSize = 10; borderRadius = 6;
        break;
      case 'lg':
        height = 32; iconSize = 18; fontSize = 14; borderRadius = 12;
        break;
      case 'md':
      default:
        height = 24; iconSize = 14; fontSize = 12; borderRadius = 8;
    }

    Widget badge = Container(
      height: height,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: config.gradient, begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(borderRadius),
        boxShadow: config.glow,
        border: Border.all(color: Colors.white.withOpacity(0.2)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(config.icon, color: config.textColor, size: iconSize),
          if (showLabel) ...[
            const SizedBox(width: 4),
            Text(
              config.label,
              style: TextStyle(
                color: config.textColor,
                fontSize: fontSize,
                fontWeight: FontWeight.w900,
                shadows: [Shadow(color: Colors.black.withOpacity(0.2), offset: const Offset(0, 1), blurRadius: 1)],
              ),
            ),
          ],
        ],
      ),
    );

    if (animated && tier >= 3) {
      return Pulse(
        infinite: true,
        duration: const Duration(seconds: 2),
        child: badge,
      );
    }

    return badge;
  }
}
