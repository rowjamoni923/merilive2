import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:ui';
import '../utils/design_system.dart';

class ProfessionalBottomBar extends StatelessWidget {
  final Function(String) onChatSubmitted;
  final VoidCallback onGiftTap;
  final VoidCallback onGameTap;
  final VoidCallback onBeautyTap;
  final VoidCallback onPKTap;
  final VoidCallback onShareTap;
  final bool isHost;

  const ProfessionalBottomBar({
    super.key,
    required this.onChatSubmitted,
    required this.onGiftTap,
    required this.onGameTap,
    required this.onBeautyTap,
    required this.onPKTap,
    required this.onShareTap,
    this.isHost = false,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Colors.black.withOpacity(0.6), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          // 1. Chat Input (Pill Shape)
          Expanded(child: _buildChatInput()),
          const SizedBox(width: 12),
          // 2. Action Icons Group
          _buildActionGroup(),
        ],
      ),
    );
  }

  Widget _buildChatInput() {
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
        child: Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: App3DDesign.glassDecoration(borderRadius: 24, opacity: 0.15),
          child: Row(
            children: [
              const Icon(LucideIcons.messageSquare, color: Colors.white60, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: TextField(
                  onSubmitted: onChatSubmitted,
                  style: GoogleFonts.inter(color: Colors.white, fontSize: 13),
                  decoration: InputDecoration(
                    hintText: "Say hi...",
                    hintStyle: GoogleFonts.inter(color: Colors.white38, fontSize: 13),
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionGroup() {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isHost) ...[
          _buildCircleAction(LucideIcons.swords, onPKTap), // PK Battle
          const SizedBox(width: 10),
          _buildCircleAction(LucideIcons.wand2, onBeautyTap), // Beauty
          const SizedBox(width: 10),
        ],
        _buildCircleAction(LucideIcons.gamepad2, onGameTap), // Games
        const SizedBox(width: 10),
        _buildCircleAction(LucideIcons.share2, onShareTap), // Share
        const SizedBox(width: 10),
        _buildGiftButton(),
      ],
    );
  }

  Widget _buildCircleAction(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 46, height: 46,
        decoration: App3DDesign.glassDecoration(borderRadius: 23, opacity: 0.2),
        child: Icon(icon, color: Colors.white, size: 20),
      ),
    );
  }

  Widget _buildGiftButton() {
     return GestureDetector(
        onTap: onGiftTap,
        child: Container(
          width: 46, height: 46,
          decoration: BoxDecoration(
            gradient: App3DDesign.premiumGradient,
            shape: BoxShape.circle,
            boxShadow: App3DDesign.buttonGlowShadow,
            border: Border.all(color: Colors.white.withOpacity(0.3), width: 1.5),
          ),
          child: const Icon(LucideIcons.gift, color: Colors.white, size: 22),
        ),
      );
  }
}


