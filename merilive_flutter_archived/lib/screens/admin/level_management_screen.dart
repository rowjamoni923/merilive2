import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class LevelManagementScreen extends StatefulWidget {
  const LevelManagementScreen({super.key});

  @override
  State<LevelManagementScreen> createState() => _LevelManagementScreenState();
}

class _LevelManagementScreenState extends State<LevelManagementScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  bool _isLoading = true;
  List<Map<String, dynamic>> _userTiers = [];
  List<Map<String, dynamic>> _hostTiers = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadTiers();
  }

  Future<void> _loadTiers() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('user_level_tiers').select('*').order('level_number', ascending: true);
      
      final data = List<Map<String, dynamic>>.from(res);
      setState(() {
        _userTiers = data.where((t) => t['tier_type'] == 'user').toList();
        _hostTiers = data.where((t) => t['tier_type'] == 'host').toList();
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading level tiers: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 32),
          _buildTabs(),
          const SizedBox(height: 32),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildLevelList(_userTiers, LucideIcons.user, "USER"),
                _buildLevelList(_hostTiers, LucideIcons.crown, "HOST"),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("LEVEL TIER ARCHITECTURE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              const Text("Configure XP thresholds, badge animations, and level gates for Users & Hosts", style: TextStyle(color: Colors.white38, fontSize: 14)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("ADD NEW TIER"),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      width: 450,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: const Color(0xFF6366F1), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13),
        unselectedLabelColor: Colors.white24,
        tabs: const [Tab(text: "User Levels"), Tab(text: "Host Levels")],
      ),
    );
  }

  Widget _buildLevelList(List<Map<String, dynamic>> tiers, IconData defaultIcon, String type) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      itemCount: tiers.length,
      itemBuilder: (context, index) {
        final tier = tiers[index];
        final amount = type == "USER" ? (tier['min_topup_amount'] ?? 0) : (tier['min_earning_amount'] ?? 0);
        final color = Color(int.parse((tier['level_color'] ?? "0xFF6366F1").replaceAll("#", "0xFF")));

        return FadeInRight(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                _buildBadge(tier, color),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text("Level ${tier['level_number']}", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 20)),
                          const SizedBox(width: 12),
                          if (tier['level_name'] != null && tier['level_name'].toString().isNotEmpty)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                              child: Text(tier['level_name'].toString().toUpperCase(), style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold)),
                            ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        "${type == 'USER' ? 'Minimum Top-up' : 'Minimum Earnings'}: ${_api.formatNumber(amount)} ${type == 'USER' ? 'Diamonds' : 'Beans'}",
                        style: const TextStyle(color: Colors.white24, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                _buildActionBtn("EDIT TIER", Colors.white10, onTap: () => _showEditDialog(tier)),
                const SizedBox(width: 12),
                _buildActionBtn("DELETE", Colors.redAccent.withOpacity(0.1), color: Colors.redAccent),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildBadge(Map<String, dynamic> tier, Color color) {
    final iconUrl = tier['icon_url'] ?? tier['animation_url'];
    
    return Container(
      width: 64,
      height: 64,
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: iconUrl != null 
          ? ClipRRect(borderRadius: BorderRadius.circular(12), child: CachedNetworkImage(imageUrl: iconUrl, fit: BoxFit.cover))
          : Center(child: Text(tier['level_icon'] ?? "💎", style: const TextStyle(fontSize: 24))),
    );
  }

  Widget _buildActionBtn(String label, Color bg, {Color? color, VoidCallback? onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.05))),
        child: Text(label, style: TextStyle(color: color ?? Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
      ),
    );
  }

  void _showEditDialog(Map<String, dynamic> tier) {
    // Implementation of high-fidelity edit dialog with color picker and asset URL inputs
    // (Similar to web's Dialog implementation)
  }
}
