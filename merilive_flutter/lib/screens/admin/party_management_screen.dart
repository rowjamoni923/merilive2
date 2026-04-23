import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class PartyManagementScreen extends StatefulWidget {
  const PartyManagementScreen({super.key});

  @override
  State<PartyManagementScreen> createState() => _PartyManagementScreenState();
}

class _PartyManagementScreenState extends State<PartyManagementScreen> with SingleTickerProviderStateMixin {
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
                _buildRoomGrid(),
                _buildAssetManagement(),
                _buildCommunitySettings(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("PARTY ROOM CMS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
        const Text("Manage room assets, welcome logic, and active party hubs", style: TextStyle(color: Colors.white38, fontSize: 13)),
      ],
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
        tabs: const [Tab(text: "Active Rooms"), Tab(text: "Backgrounds"), Tab(text: "Welcome MSGs")],
      ),
    );
  }

  Widget _buildRoomGrid() {
    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3, 
        childAspectRatio: 1.5, 
        crossAxisSpacing: 20, 
        mainAxisSpacing: 20
      ),
      itemCount: 6,
      itemBuilder: (context, index) {
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.03),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white70),
            ),
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Container(height: 10, width: 10, decoration: const BoxDecoration(color: Colors.greenAccent, shape: BoxShape.circle)),
                    const Icon(LucideIcons.moreHorizontal, color: Colors.white24, size: 16),
                  ],
                ),
                const Spacer(),
                const Text("Elite Party Hub", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                Text("Host: @HostUser$index \u2022 1.2K Viewers", style: const TextStyle(color: Colors.white38, fontSize: 12)),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildAssetManagement() {
     return const Center(child: Text("Party Backgrounds CMS Parity Pending", style: TextStyle(color: Colors.white24)));
  }

  Widget _buildCommunitySettings() {
     return const Center(child: Text("Welcome Messages Registry Pending", style: TextStyle(color: Colors.white24)));
  }
}


