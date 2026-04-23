import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class AdminVisualAssetsHubScreen extends StatefulWidget {
  const AdminVisualAssetsHubScreen({super.key});

  @override
  State<AdminVisualAssetsHubScreen> createState() => _AdminVisualAssetsHubScreenState();
}

class _AdminVisualAssetsHubScreenState extends State<AdminVisualAssetsHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, int> _stats = {'banners': 0, 'bubbles': 0, 'frames': 0, 'entryEffects': 0, 'nameBars': 0, 'vehicles': 0};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 7, vsync: this);
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      // Fetch counts for various asset types from shop_items
      final banners = await supa.from('app_banners').select('id', count: CountOption.exact);
      final shopItems = await supa.from('shop_items').select('category, id');
      
      final List<dynamic> items = shopItems as List<dynamic>;
      
      setState(() {
        _stats['banners'] = banners.count ?? 0;
        _stats['bubbles'] = items.where((i) => i['category'] == 'bubble').length;
        _stats['frames'] = items.where((i) => i['category'] == 'frame').length;
        _stats['entryEffects'] = items.where((i) => i['category'] == 'entry').length;
        _stats['nameBars'] = items.where((i) => i['category'] == 'name_bar').length;
        _stats['vehicles'] = items.where((i) => i['category'] == 'vehicle').length;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading visual assets stats: $e");
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
                _buildAssetManagementList("Banners", LucideIcons.image),
                _buildAssetManagementList("Chat Bubbles", LucideIcons.messageCircle),
                _buildAssetManagementList("Frames", LucideIcons.square),
                _buildAssetManagementList("Entry Effects", LucideIcons.zap),
                _buildAssetManagementList("Name Bars", LucideIcons.minus),
                _buildAssetManagementList("Vehicle Entrances", LucideIcons.car),
                _buildAssetManagementList("Animation Store", LucideIcons.shoppingBag),
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
          colors: [Colors.pinkAccent.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.fuchsia, Colors.pinkAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.sparkles, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("VISUAL ASSETS GOVERNANCE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Unified management for banners, entry effects, frames, and premium store animations", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatsOverview() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            _statCard("BANNERS", _stats['banners'].toString(), LucideIcons.image, Colors.blueAccent),
            const SizedBox(width: 16),
            _statCard("BUBBLES", _stats['bubbles'].toString(), LucideIcons.messageCircle, Colors.greenAccent),
            const SizedBox(width: 16),
            _statCard("FRAMES", _stats['frames'].toString(), LucideIcons.square, Colors.purpleAccent),
            const SizedBox(width: 16),
            _statCard("ENTRY EFFECTS", _stats['entryEffects'].toString(), LucideIcons.zap, Colors.amberAccent),
            const SizedBox(width: 16),
            _statCard("VEHICLES", _stats['vehicles'].toString(), LucideIcons.car, Colors.roseAccent),
          ],
        ),
      ),
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Container(
      width: 180,
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
    );
  }

  Widget _buildTabHeader() {
    return Container(
      margin: const EdgeInsets.all(40),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.fuchsia, Colors.pinkAccent]), borderRadius: BorderRadius.circular(12)),
          dividerColor: Colors.transparent,
          labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
          unselectedLabelColor: Colors.white24,
          tabs: const [
            Tab(text: "BANNERS"),
            Tab(text: "BUBBLES"),
            Tab(text: "FRAMES"),
            Tab(text: "ENTRY EFFECTS"),
            Tab(text: "NAME BARS"),
            Tab(text: "VEHICLES"),
            Tab(text: "ANIMATION STORE"),
          ],
        ),
      ),
    );
  }

  Widget _buildAssetManagementList(String title, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 64, color: Colors.white10),
          const SizedBox(height: 24),
          Text(
            "$title Management Module",
            style: GoogleFonts.outfit(color: Colors.white38, fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          const Text(
            "Access high-fidelity CRUD operations for this asset category",
            style: TextStyle(color: Colors.white12, fontSize: 12),
          ),
        ],
      ),
    );
  }
}
