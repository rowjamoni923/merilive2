import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class AdminShopSystemHubScreen extends StatefulWidget {
  const AdminShopSystemHubScreen({super.key});

  @override
  State<AdminShopSystemHubScreen> createState() => _AdminShopSystemHubScreenState();
}

class _AdminShopSystemHubScreenState extends State<AdminShopSystemHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, int> _stats = {'totalItems': 0, 'gifts': 0, 'special': 0, 'inventory': 0};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final items = await supa.from('shop_items').select('category, id');
      final parcels = await supa.from('user_inventory').select('id', count: CountOption.exact);
      
      final List<dynamic> itemList = items as List<dynamic>;

      setState(() {
        _stats['totalItems'] = itemList.length;
        _stats['gifts'] = itemList.where((i) => i['category'] == 'gift').length;
        _stats['special'] = itemList.where((i) => ['frame', 'bubble', 'entry'].contains(i['category'])).length;
        _stats['inventory'] = parcels.count ?? 0;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading shop stats: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: Column(
        children: [
          _buildHeader(),
          _buildStatsOverview(),
          _buildTabHeader(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildPlaceholder("Gifts & Virtual Items", LucideIcons.gift),
                _buildPlaceholder("Inventory & Bundles", LucideIcons.package),
                _buildPlaceholder("Sales & Revenue", LucideIcons.trendingUp),
                _buildPlaceholder("Discount Campaigns", LucideIcons.tag),
                _buildPlaceholder("Parcel Management", LucideIcons.box),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.violetAccent.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.violet, Colors.purpleAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.shoppingBag, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("SHOP GOVERNANCE CENTER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Unified management for gifts, virtual assets, inventory bundles, and sales campaigns", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatsOverview() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Row(
        children: [
          _statCard("TOTAL ITEMS", _stats['totalItems'].toString(), LucideIcons.shoppingCart, Colors.blueAccent),
          const SizedBox(width: 16),
          _statCard("GIFTS ACTIVE", _stats['gifts'].toString(), LucideIcons.gift, Colors.pinkAccent),
          const SizedBox(width: 16),
          _statCard("PREMIUM ASSETS", _stats['special'].toString(), LucideIcons.sparkles, Colors.amberAccent),
          const SizedBox(width: 16),
          _statCard("USER INVENTORY", _stats['inventory'].toString(), LucideIcons.box, Colors.greenAccent),
        ],
      ),
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.1))),
        child: Row(
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                Text(label, style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTabHeader() {
    return Container(
      margin: const EdgeInsets.all(40),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.violet, Colors.purpleAccent]), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "ITEMS"),
          Tab(text: "INVENTORY"),
          Tab(text: "SALES"),
          Tab(text: "DISCOUNTS"),
          Tab(text: "PARCELS"),
        ],
      ),
    );
  }

  Widget _buildPlaceholder(String title, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 64, color: Colors.white10),
          const SizedBox(height: 24),
          Text(
            "$title Management",
            style: GoogleFonts.outfit(color: Colors.white38, fontSize: 18, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
