import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class DeviceManagementScreen extends StatefulWidget {
  const DeviceManagementScreen({super.key});

  @override
  State<DeviceManagementScreen> createState() => _DeviceManagementScreenState();
}

class _DeviceManagementScreenState extends State<DeviceManagementScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = false;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 32),
          _buildSecurityStats(),
          const SizedBox(height: 32),
          Expanded(child: _buildBannedDeviceList()),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("DEVICE SECURITY HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            const Text("Manage device-level bans and security audits", style: TextStyle(color: Colors.white38, fontSize: 13)),
          ],
        ),
        _buildActionBtn("BAN NEW DEVICE", LucideIcons.shieldAlert, Colors.redAccent),
      ],
    );
  }

  Widget _buildActionBtn(String label, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.3))),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 8),
          Text(label, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildSecurityStats() {
    return Row(
      children: [
        _buildStatCard("Total Banned Devices", "1,240", LucideIcons.ban, Colors.redAccent),
        const SizedBox(width: 20),
        _buildStatCard("Active Security Logs", "5.4K", LucideIcons.activity, Colors.blueAccent),
        const SizedBox(width: 20),
        _buildStatCard("Recent Fraud Attempts", "12", LucideIcons.shieldAlert, Colors.orangeAccent),
      ],
    );
  }

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: color.withOpacity(0.03), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.1))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 16),
            Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            Text(label, style: TextStyle(color: color.withOpacity(0.6), fontSize: 11, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _buildBannedDeviceList() {
    return ListView.builder(
      itemCount: 5,
      itemBuilder: (context, index) {
        return FadeInRight(
          delay: Duration(milliseconds: index * 100),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white70)),
            child: Row(
              children: [
                const Icon(LucideIcons.smartphone, color: Colors.white24),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text("DEVICE-ID: 7A1F-9C2B-4E8D-6F3A", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                      Text("Reason: Repeated policy violations \u2022 Banned on 2026-04-10", style: const TextStyle(color: Colors.white24, fontSize: 12)),
                    ],
                  ),
                ),
                TextButton(onPressed: () {}, child: const Text("UNBAN", style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 12))),
              ],
            ),
          ),
        );
      },
    );
  }
}


