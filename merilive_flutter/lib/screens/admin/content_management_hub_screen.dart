import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class ContentManagementHubScreen extends StatefulWidget {
  const ContentManagementHubScreen({super.key});

  @override
  State<ContentManagementHubScreen> createState() => _ContentManagementHubScreenState();
}

class _ContentManagementHubScreenState extends State<ContentManagementHubScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 32),
          _buildTabs(),
          const SizedBox(height: 24),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildBannerList(),
                _buildSlideManager(),
                _buildContentPages(),
              ],
            ),
          ),
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
            Text("CONTENT MANAGEMENT HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            const Text("Manage homepage banners, onboarding slides, and system information", style: TextStyle(color: Colors.white38, fontSize: 13)),
          ],
        ),
        _buildActionBtn("ADD NEW BANNER", LucideIcons.image, const Color(0xFF6366F1)),
      ],
    );
  }

  Widget _buildActionBtn(String label, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          Icon(icon, color: Colors.white, size: 16),
          const SizedBox(width: 8),
          Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      width: 500,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white70)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: const Color(0xFF6366F1), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        unselectedLabelColor: Colors.white24,
        tabs: const [Tab(text: "Banners"), Tab(text: "Slides"), Tab(text: "Pages")],
      ),
    );
  }

  Widget _buildBannerList() {
    return ListView.builder(
      itemCount: 4,
      itemBuilder: (context, index) {
        return FadeInUp(
          delay: Duration(milliseconds: index * 100),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.03),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white70),
            ),
            child: Row(
              children: [
                Container(
                  width: 120, height: 60,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
                  child: const Icon(LucideIcons.image, color: Colors.white12),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("Promo Banner #${index + 1}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                      Text("Valid until: 2026-05-01 \u2022 Status: Active", style: const TextStyle(color: Colors.white24, fontSize: 12)),
                    ],
                  ),
                ),
                _buildActionIcon(LucideIcons.edit3),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildSlideManager() {
     return const Center(child: Text("Onboarding Slides CMS - Parity Pending", style: TextStyle(color: Colors.white24)));
  }

  Widget _buildContentPages() {
     return const Center(child: Text("Informational Pages Registry - Parity Pending", style: TextStyle(color: Colors.white24)));
  }

  Widget _buildActionIcon(IconData icon) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
      child: Icon(icon, color: Colors.white38, size: 18),
    );
  }
}


