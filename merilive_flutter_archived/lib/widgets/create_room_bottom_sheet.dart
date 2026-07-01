import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

class CreateRoomBottomSheet extends StatelessWidget {
  const CreateRoomBottomSheet({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        boxShadow: [
          BoxShadow(
            color: Colors.black54,
            blurRadius: 30,
            offset: Offset(0, -10),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag Handle
          Container(
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: Colors.white24,
              borderRadius: BorderRadius.circular(2),
            ),
          ),
          const SizedBox(height: 32),
          
          // Option 1: Go Live (Red/Pink Gradient) - Horizontal Card Style as per Hubohub
          _buildPremiumCreateButton(
            context: context,
            title: "Go Live",
            subtitle: "Start your own live show now",
            icon: LucideIcons.rocket,
            gradient: const LinearGradient(
              colors: [Color(0xFFEF4444), Color(0xFFEC4899)],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
            onTap: () {
              Navigator.pop(context);
              // Handle Live Setup
            },
          ),
          
          const SizedBox(height: 20),
          
          // Option 2: Create Party (Purple/Indigo Gradient)
          _buildPremiumCreateButton(
            context: context,
            title: "Create Party",
            subtitle: "Create a room to chat and play",
            icon: LucideIcons.users,
            gradient: const LinearGradient(
              colors: [Color(0xFF9333EA), Color(0xFF4F46E5)],
              begin: Alignment.centerLeft,
              end: Alignment.centerRight,
            ),
            onTap: () {
              Navigator.pop(context);
              // Handle Party Setup
            },
          ),
          
          const SizedBox(height: 32),
          
          // Dismiss Button
          InkWell(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white10),
                color: Colors.white.withOpacity(0.05),
              ),
              child: const Icon(LucideIcons.x, color: Colors.white70, size: 24),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPremiumCreateButton({
    required BuildContext context,
    required String title,
    required String subtitle,
    required IconData icon,
    required Gradient gradient,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 20),
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(24),
          boxShadow: [
            BoxShadow(
              color: (gradient as LinearGradient).colors.first.withOpacity(0.3),
              blurRadius: 15,
              offset: const Offset(0, 8),
            ),
          ],
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.black.withOpacity(0.15),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Icon(icon, color: Colors.white, size: 28),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 18,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.8),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            const Icon(LucideIcons.chevronRight, color: Colors.white70),
          ],
        ),
      ),
    );
  }
}


