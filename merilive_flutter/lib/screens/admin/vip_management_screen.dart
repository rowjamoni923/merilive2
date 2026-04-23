import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class VIPManagementScreen extends StatefulWidget {
  const VIPManagementScreen({super.key});

  @override
  State<VIPManagementScreen> createState() => _VIPManagementScreenState();
}

class _VIPManagementScreenState extends State<VIPManagementScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  List<Map<String, dynamic>> _vipTiers = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadVIPData();
  }

  Future<void> _loadVIPData() async {
    setState(() => _isLoading = true);
    final tiers = await _api.getVIPTiers();
    setState(() {
      _vipTiers = tiers;
      _isLoading = false;
    });
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
                _buildVIPGrid(),
                _buildNobleCards(),
                _buildMedalsGallery(),
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
            Text("VIP & NOBLE SYSTEM", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            const Text("Manage premium memberships, elite cards, and special medals", style: TextStyle(color: Colors.white38, fontSize: 13)),
          ],
        ),
        _buildActionBtn("ADD NEW TIER", LucideIcons.plus, const Color(0xFF6366F1)),
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
        tabs: const [Tab(text: "VIP Tiers"), Tab(text: "Noble Cards"), Tab(text: "Medals")],
      ),
    );
  }

  Widget _buildVIPGrid() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    
    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3, 
        childAspectRatio: 1.4, 
        crossAxisSpacing: 20, 
        mainAxisSpacing: 20
      ),
      itemCount: _vipTiers.length,
      itemBuilder: (context, index) {
        final tier = _vipTiers[index];
        return _buildTierCard(tier, index);
      },
    );
  }

  Widget _buildTierCard(Map<String, dynamic> tier, int index) {
    final color = _getTierColor(tier['level'] ?? 0);
    return FadeInUp(
      delay: Duration(milliseconds: 50 * index),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.03),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Stack(
          children: [
            Positioned(
              right: -20, top: -20,
              child: Icon(LucideIcons.crown, color: color.withOpacity(0.05), size: 120),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle),
                        child: Icon(LucideIcons.star, color: color, size: 20),
                      ),
                      const SizedBox(width: 16),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(tier['name'] ?? 'VIP', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                          Text("Lvl ${tier['level']}", style: TextStyle(color: color.withOpacity(0.6), fontSize: 12, fontWeight: FontWeight.bold)),
                        ],
                      ),
                    ],
                  ),
                  const Spacer(),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text("PRICE", style: TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
                          Text("${tier['price_diamonds'] ?? 0} 💎", style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                        ],
                      ),
                      _buildActionIcon(LucideIcons.edit3, Colors.white24),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Color _getTierColor(int level) {
    if (level >= 3) return Colors.purpleAccent;
    if (level >= 2) return Colors.amber;
    return Colors.blueAccent;
  }

  Widget _buildActionIcon(IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
      child: Icon(icon, color: Colors.white38, size: 16),
    );
  }

  Widget _buildNobleCards() {
    return const Center(child: Text("Noble Cards Management - High Fidelity Parity Pending", style: TextStyle(color: Colors.white24)));
  }

  Widget _buildMedalsGallery() {
    return const Center(child: Text("Medals Registry - Enterprise Asset CMS Parity Pending", style: TextStyle(color: Colors.white24)));
  }
}


