import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminBlueprintScreen extends StatelessWidget {
  const AdminBlueprintScreen({super.key});

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
            const SizedBox(height: 60),
            _buildArchitectureGrid(),
            const SizedBox(height: 60),
            _buildSystemStatus(),
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
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.indigo, Colors.purple]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.map, color: Colors.white, size: 28),
          ),
        ),
        const SizedBox(width: 24),
        FadeInDown(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("SYSTEM BLUEPRINT", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Visual overview of the MeriLive ecosystem architecture and master copy logic", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildArchitectureGrid() {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 3,
      crossAxisSpacing: 32,
      mainAxisSpacing: 32,
      childAspectRatio: 1.5,
      children: [
        _buildBlueprintCard("CORE ENGINE", "Flutter / Dart / Supabase", LucideIcons.cpu, Colors.blueAccent),
        _buildBlueprintCard("REAL-TIME SYNC", "Postgres CDC / WebSockets", LucideIcons.zap, Colors.amberAccent),
        _buildBlueprintCard("MEDIA PIPELINE", "Agora SDK / RTC / RTM", LucideIcons.video, Colors.redAccent),
        _buildBlueprintCard("SECURITY LAYER", "RLS / JWT / Route Guard", LucideIcons.shieldCheck, Colors.emeraldAccent),
        _buildBlueprintCard("FINANCE HUB", "Edge Functions / Ledger", LucideIcons.wallet, Colors.purpleAccent),
        _buildBlueprintCard("AI MODERATION", "Deep Learning / Auto-Ban", LucideIcons.eye, Colors.pinkAccent),
      ],
    );
  }

  Widget _buildBlueprintCard(String title, String subtitle, IconData icon, Color color) {
    return FadeInUp(
      child: Container(
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.1))),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle), child: Icon(icon, color: color, size: 32)),
            const SizedBox(height: 24),
            Text(title, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(subtitle, style: const TextStyle(color: Colors.white24, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _buildSystemStatus() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("PLATFORM STATUS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 32),
          _statusLine("API Gateway", "Operational", Colors.greenAccent),
          _statusLine("Database (Postgres)", "Operational", Colors.greenAccent),
          _statusLine("Edge Functions", "Operational", Colors.greenAccent),
          _statusLine("Media Servers (Agora)", "Operational", Colors.greenAccent),
          _statusLine("Storage (S3/Supabase)", "Operational", Colors.greenAccent),
        ],
      ),
    );
  }

  Widget _statusLine(String label, String status, Color color) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70)),
          Row(
            children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 12),
              Text(status, style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.bold)),
            ],
          ),
        ],
      ),
    );
  }
}
