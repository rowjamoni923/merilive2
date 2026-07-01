import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import '../services/api_service.dart';

class GenderSelectionModal extends StatelessWidget {
  const GenderSelectionModal({super.key});

  @override
  Widget build(BuildContext context) {
    final ApiService api = ApiService();

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 40),
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        borderRadius: BorderRadius.vertical(top: Radius.circular(40)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            "Select Your Gender",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 8),
          Text(
            "This will help us personalize your experience",
            style: GoogleFonts.outfit(color: Colors.white54, fontSize: 14),
          ),
          const SizedBox(height: 48),
          Row(
            children: [
              Expanded(
                child: _buildGenderCard(
                  context,
                  "MALE",
                  LucideIcons.user,
                  const Color(0xFF3B82F6),
                  () => _handleSelection(context, api, 'male'),
                ),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: _buildGenderCard(
                  context,
                  "FEMALE",
                  LucideIcons.user,
                  const Color(0xFFEC4899),
                  () => _handleSelection(context, api, 'female'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 40),
          Text(
            "Note: Gender cannot be changed after selection",
            style: GoogleFonts.outfit(color: Colors.amber.withOpacity(0.5), fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _buildGenderCard(BuildContext context, String label, IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 32),
        decoration: BoxDecoration(
          color: color.withOpacity(0.05),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: color.withOpacity(0.3), width: 2),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 48),
            const SizedBox(height: 16),
            Text(
              label,
              style: GoogleFonts.outfit(color: color, fontWeight: FontWeight.bold, letterSpacing: 2),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _handleSelection(BuildContext context, ApiService api, String gender) async {
    try {
      await api.completeOnboarding(gender: gender);
      if (context.mounted) Navigator.pop(context);
    } catch (e) {
      debugPrint("Gender selection error: $e");
    }
  }
}


