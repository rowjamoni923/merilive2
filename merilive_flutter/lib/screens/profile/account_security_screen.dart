import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../widgets/nebula_background.dart';

class AccountSecurityScreen extends StatelessWidget {
  const AccountSecurityScreen({super.key});

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
                  child: ListView(
                    padding: const EdgeInsets.all(20),
                    children: [
                      _buildSecurityItem("Device Verification", "Secured", LucideIcons.smartphone, Colors.green),
                      _buildSecurityItem("Password", "Tap to change", LucideIcons.lock, Colors.white70),
                      _buildSecurityItem("Two-Factor Auth", "Disabled", LucideIcons.shieldAlert, Colors.orange),
                      _buildSecurityItem("Login History", "View recent logins", LucideIcons.history, Colors.white70),
                      const SizedBox(height: 48),
                      _buildDeleteAccount(context),
                    ],
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
            "ACCOUNT SECURITY",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }

  Widget _buildSecurityItem(String title, String status, IconData icon, Color statusColor) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.white70, size: 20),
          const SizedBox(width: 16),
          Expanded(child: Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
          Text(status, style: TextStyle(color: statusColor, fontSize: 12)),
          const SizedBox(width: 8),
          const Icon(LucideIcons.chevronRight, color: Colors.white24, size: 16),
        ],
      ),
    );
  }

  Widget _buildDeleteAccount(BuildContext context) {
    return TextButton(
      onPressed: () {},
      child: const Text("DELETE ACCOUNT", style: TextStyle(color: Colors.redAccent, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1)),
    );
  }
}


