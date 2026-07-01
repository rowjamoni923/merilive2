import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AgencyTierBadge extends StatelessWidget {
  final String tier; // A1, A2, A3, A4, A5
  final double size;

  const AgencyTierBadge({
    super.key,
    required this.tier,
    this.size = 24,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: size * 0.4, vertical: size * 0.15),
      decoration: BoxDecoration(
        gradient: _getTierGradient(),
        borderRadius: BorderRadius.circular(size * 0.5),
        boxShadow: [
          BoxShadow(
            color: _getTierColor().withOpacity(0.4),
            blurRadius: size * 0.4,
            offset: Offset(0, size * 0.1),
          ),
        ],
        border: Border.all(color: Colors.white24, width: 0.5),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.stars,
            color: Colors.white,
            size: size * 0.6,
          ),
          SizedBox(width: size * 0.2),
          Text(
            tier,
            style: GoogleFonts.outfit(
              color: Colors.white,
              fontSize: size * 0.5,
              fontWeight: FontWeight.w900,
            ),
          ),
        ],
      ),
    );
  }

  Color _getTierColor() {
    switch (tier.toUpperCase()) {
      case 'A5': return const Color(0xFFFACC15); // Diamond/Gold
      case 'A4': return const Color(0xFFFB923C); // Platinum/Orange
      case 'A3': return const Color(0xFF818CF8); // Crystal/Indigo
      case 'A2': return const Color(0xFF2DD4BF); // Emerald/Teal
      case 'A1':
      default:
        return const Color(0xFF94A3B8); // Silver/Slate
    }
  }

  LinearGradient _getTierGradient() {
    final color = _getTierColor();
    return LinearGradient(
      colors: [color, color.withOpacity(0.7)],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    );
  }
}
