import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:share_plus/share_plus.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';

class AgencySmartLinkScreen extends StatefulWidget {
  final String agencyCode;
  const AgencySmartLinkScreen({super.key, required this.agencyCode});

  @override
  State<AgencySmartLinkScreen> createState() => _AgencySmartLinkScreenState();
}

class _AgencySmartLinkScreenState extends State<AgencySmartLinkScreen> {
  final Color _accentColor = const Color(0xFF6366F1);
  
  String _getRecruitmentLink() => "https://merilive.com/smart-link?parent=${widget.agencyCode}";
  String _getHostLink() => "https://merilive.com/smart-link?agency=${widget.agencyCode}";

  void _copy(String text) {
    Clipboard.setData(ClipboardData(text: text));
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: const Text("Master link copied!"),
      behavior: SnackBarBehavior.floating,
      backgroundColor: Colors.cyanAccent.withOpacity(0.1),
    ));
  }

  void _share(String text) {
    Share.share("Join my official MeriLive Agency! Level up your career here: $text");
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              physics: const BouncingScrollPhysics(),
              child: Column(
                children: [
                  _buildHeader(),
                  const SizedBox(height: 32),
                  _buildIntroCard(),
                  const SizedBox(height: 32),
                  FadeInLeft(
                    child: _buildLinkCard(
                      title: "SUB-AGENT NETWORK",
                      desc: "Build your own agency tree. Recruit new sub-agents and earn a percentage of their total monthly volume.",
                      link: _getRecruitmentLink(),
                      icon: LucideIcons.network,
                      color: Colors.cyanAccent,
                    ),
                  ),
                  const SizedBox(height: 24),
                  FadeInRight(
                    child: _buildLinkCard(
                      title: "HOST RECRUITMENT",
                      desc: "Invite talented hosts directly. They will be automatically mapped to your agency for seamless payroll.",
                      link: _getHostLink(),
                      icon: LucideIcons.userPlus,
                      color: Colors.pinkAccent,
                    ),
                  ),
                  const SizedBox(height: 48),
                  _buildSocialGrid(),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        GestureDetector(
          onTap: () => Navigator.pop(context),
          child: Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
            child: const Icon(LucideIcons.chevronLeft, color: Colors.white, size: 20),
          ),
        ),
        const SizedBox(width: 16),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Recruitment Hub", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
            Text("Master Copy • Dynamic Smart Links", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
          ],
        ),
      ],
    );
  }

  Widget _buildIntroCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.1), shape: BoxShape.circle),
            child: const Icon(LucideIcons.zap, color: Colors.cyanAccent, size: 36),
          ),
          const SizedBox(height: 24),
          Text(
            "Instant Attribution",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          Text(
            "Share these links across social media. Anyone who signs up through your link will be automatically credited to your agency.",
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 13, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _buildLinkCard({required String title, required String desc, required String link, required IconData icon, required Color color}) {
    return Container(
      padding: const EdgeInsets.all(28),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
                child: Icon(icon, color: color, size: 20),
              ),
              const SizedBox(width: 16),
              Text(title, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 14, letterSpacing: 1)),
            ],
          ),
          const SizedBox(height: 16),
          Text(desc, style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 12, height: 1.4)),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
            decoration: BoxDecoration(color: Colors.black.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
            child: Row(
              children: [
                Expanded(child: Text(link, style: TextStyle(color: color.withOpacity(0.8), fontSize: 11, overflow: TextOverflow.ellipsis))),
                const SizedBox(width: 12),
                GestureDetector(
                  onTap: () => _copy(link),
                  child: Icon(LucideIcons.copy, color: Colors.white.withOpacity(0.3), size: 18),
                ),
              ],
            ),
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(LucideIcons.share2, size: 16),
              label: Text("SHARE SMART LINK", style: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 12)),
              style: ElevatedButton.styleFrom(
                backgroundColor: color.withOpacity(0.1),
                foregroundColor: color,
                elevation: 0,
                padding: const EdgeInsets.symmetric(vertical: 18),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide(color: color.withOpacity(0.3))),
              ),
              onPressed: () => _share(link),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSocialGrid() {
    return Column(
      children: [
        Text("MULTI-CHANNEL RECRUITMENT", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 2)),
        const SizedBox(height: 24),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _socialBtn(LucideIcons.facebook, Colors.blueAccent),
            const SizedBox(width: 24),
            _socialBtn(LucideIcons.instagram, Colors.pinkAccent),
            const SizedBox(width: 24),
            _socialBtn(LucideIcons.messageCircle, Colors.greenAccent),
            const SizedBox(width: 24),
            _socialBtn(LucideIcons.twitter, Colors.lightBlueAccent),
          ],
        ),
      ],
    );
  }

  Widget _socialBtn(IconData icon, Color color) {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(
        color: color.withOpacity(0.05),
        shape: BoxShape.circle,
        border: Border.all(color: color.withOpacity(0.1)),
      ),
      child: Icon(icon, color: color, size: 22),
    );
  }
}


