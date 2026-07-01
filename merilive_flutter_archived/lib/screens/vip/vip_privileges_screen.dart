import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../widgets/nebula_background.dart';

class VipPrivilegesScreen extends StatelessWidget {
  const VipPrivilegesScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildAppBar(context),
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.all(20),
                    child: Column(
                      children: [
                        _buildVipBadge(),
                        const SizedBox(height: 32),
                        _buildPrivilegesGrid(),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.chevronLeft, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const SizedBox(width: 8),
          Text(
            "VIP PRIVILEGES",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Widget _buildVipBadge() {
    return FadeInDown(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 24),
        decoration: BoxDecoration(
          gradient: const LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFEF4444)]),
          borderRadius: BorderRadius.circular(30),
          boxShadow: [
            BoxShadow(color: const Color(0xFFF59E0B).withOpacity(0.3), blurRadius: 20, spreadRadius: 5),
          ],
        ),
        child: Column(
          children: [
            const Icon(LucideIcons.crown, color: Colors.white, size: 60),
            const SizedBox(height: 12),
            Text(
              "MERILIVE VIP",
              style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900, letterSpacing: 2),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPrivilegesGrid() {
    final privileges = [
      {'icon': LucideIcons.badgeCheck, 'title': 'Exclusive Badge', 'desc': 'Stand out in every room'},
      {'icon': LucideIcons.messageSquare, 'title': 'Custom Bubbles', 'desc': 'Special chat effects'},
      {'icon': LucideIcons.userPlus, 'title': 'Extra Seats', 'desc': 'Join any locked seat'},
      {'icon': LucideIcons.gift, 'title': 'Daily Rewards', 'desc': 'Free coins every day'},
      {'icon': LucideIcons.shieldCheck, 'title': 'Anti-Kick', 'desc': 'Protected from kicks'},
      {'icon': LucideIcons.music, 'title': 'Enter Effect', 'desc': 'Dynamic entrance sound'},
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 16,
        mainAxisSpacing: 16,
        childAspectRatio: 0.85,
      ),
      itemCount: privileges.length,
      itemBuilder: (context, index) {
        final p = privileges[index];
        return FadeInUp(
          delay: Duration(milliseconds: 100 * index),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white10),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFFF59E0B).withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(p['icon'] as IconData, color: const Color(0xFFF59E0B), size: 28),
                ),
                const SizedBox(height: 12),
                Text(
                  p['title'] as String,
                  style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16),
                ),
                const SizedBox(height: 4),
                Text(
                  p['desc'] as String,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: Colors.white54, fontSize: 11),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}


