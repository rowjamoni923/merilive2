import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminQuickLinksScreen extends StatefulWidget {
  const AdminQuickLinksScreen({super.key});

  @override
  State<AdminQuickLinksScreen> createState() => _AdminQuickLinksScreenState();
}

class _AdminQuickLinksScreenState extends State<AdminQuickLinksScreen> {
  final ApiService _api = ApiService();

  final List<Map<String, dynamic>> _quickLinks = [
    {"label": "Direct Recharge", "icon": LucideIcons.zap, "color": Colors.orangeAccent, "path": "/admin/manual-topup"},
    {"label": "Ban Host", "icon": LucideIcons.ban, "color": Colors.redAccent, "path": "/admin/hosts"},
    {"label": "Verify Face", "icon": LucideIcons.userCheck, "color": Colors.emeraldAccent, "path": "/admin/face-verification"},
    {"label": "Audit Logs", "icon": LucideIcons.fileText, "color": Colors.blueAccent, "path": "/admin/logs"},
    {"label": "System Health", "icon": LucideIcons.activity, "color": Colors.tealAccent, "path": "/admin/system-health"},
    {"label": "Support Chat", "icon": LucideIcons.messageSquare, "color": Colors.purpleAccent, "path": "/admin/support-tickets"},
    {"label": "Broadcast Mail", "icon": LucideIcons.mail, "color": Colors.indigoAccent, "path": "/admin/gmail-broadcast"},
    {"label": "Global Config", "icon": LucideIcons.settings, "color": Colors.white70, "path": "/admin/settings"},
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(),
            const SizedBox(height: 48),
            _buildGrid(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        FadeInLeft(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.tealAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.rocket, color: Colors.white, size: 28),
          ),
        ),
        const SizedBox(width: 24),
        FadeInDown(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("ADMIN QUICK ACTIONS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("High-velocity access to critical system management functions", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildGrid() {
    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 4, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 1.2),
      itemCount: _quickLinks.length,
      itemBuilder: (context, index) {
        final link = _quickLinks[index];
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: InkWell(
            onTap: () {
              // Navigation logic handled by AdminDashboard via path update
            },
            borderRadius: BorderRadius.circular(24),
            child: Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: link['color'].withOpacity(0.1), borderRadius: BorderRadius.circular(16)), child: Icon(link['icon'], color: link['color'], size: 28)),
                  const SizedBox(height: 20),
                  Text(link['label'], style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
