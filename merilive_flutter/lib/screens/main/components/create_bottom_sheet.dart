import 'package:flutter/material.dart';
import '../../../theme/app_theme.dart';
import 'dart:ui';

class CreateBottomSheet extends StatelessWidget {
  const CreateBottomSheet({super.key});

  @override
  Widget build(BuildContext context) {
    return BackdropFilter(
      filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 30),
        decoration: BoxDecoration(
          color: Colors.black.withOpacity(0.85),
          borderRadius: const BorderRadius.vertical(top: Radius.circular(40)),
          border: Border.all(color: Colors.white10),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text(
              "Create Something New",
              style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 30),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildCreateOption(
                  context,
                  icon: Icons.videocam_rounded,
                  label: "Go Live",
                  color: AppTheme.primaryPink,
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.pushNamed(context, '/go_live_preview');
                  },
                ),
                _buildCreateOption(
                  context,
                  icon: Icons.groups_rounded,
                  label: "Party Room",
                  color: Colors.purpleAccent,
                  onTap: () {
                    Navigator.pop(context);
                    // Navigate to Create Party Room
                  },
                ),
                _buildCreateOption(
                  context,
                  icon: Icons.videogame_asset_rounded,
                  label: "Game Mode",
                  color: Colors.amber,
                  onTap: () {
                    Navigator.pop(context);
                    // Navigate to Game Room
                  },
                ),
              ],
            ),
            const SizedBox(height: 30),
            IconButton(
              icon: const Icon(Icons.close, color: Colors.white54, size: 30),
              onPressed: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCreateOption(
    BuildContext context, {
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: color.withOpacity(0.15),
              shape: BoxShape.circle,
              border: Border.all(color: color.withOpacity(0.3), width: 2),
              boxShadow: [
                BoxShadow(color: color.withOpacity(0.2), blurRadius: 20, spreadRadius: -5),
              ],
            ),
            child: Icon(icon, color: color, size: 35),
          ),
          const SizedBox(height: 12),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
