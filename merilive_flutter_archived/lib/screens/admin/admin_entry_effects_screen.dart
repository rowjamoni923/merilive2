import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminEntryEffectsScreen extends StatefulWidget {
  const AdminEntryEffectsScreen({super.key});

  @override
  State<AdminEntryEffectsScreen> createState() => _AdminEntryEffectsScreenState();
}

class _AdminEntryEffectsScreenState extends State<AdminEntryEffectsScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, int> _stats = {'banners': 0, 'bars': 0, 'names': 0, 'vehicles': 0};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final results = await Future.wait([
        supa.from('entry_banners').select('id', const FetchOptions(count: CountOption.exact)),
        supa.from('level_privileges').select('id', const FetchOptions(count: CountOption.exact)).eq('privilege_type', 'entry_bar'),
        supa.from('level_privileges').select('id', const FetchOptions(count: CountOption.exact)).eq('privilege_type', 'entry_name_bar'),
        supa.from('vehicle_entrances').select('id', const FetchOptions(count: CountOption.exact)),
      ]);

      setState(() {
        _stats = {
          'banners': results[0].count ?? 0,
          'bars': results[1].count ?? 0,
          'names': results[2].count ?? 0,
          'vehicles': results[3].count ?? 0,
        };
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading entry stats: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildStatsRow(),
        _buildSubTabBar(),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildBannersTab(),
              _buildBarsTab(),
              _buildNamesTab(),
              _buildVehiclesTab(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildStatsRow() {
    return Container(
      padding: const EdgeInsets.all(32),
      child: Row(
        children: [
          _statCard(LucideIcons.zap, "Banners", _stats['banners']!, Colors.amberAccent),
          const SizedBox(width: 16),
          _statCard(LucideIcons.sparkles, "Entry Bars", _stats['bars']!, Colors.blueAccent),
          const SizedBox(width: 16),
          _statCard(LucideIcons.type, "Name Bars", _stats['names']!, Colors.purpleAccent),
          const SizedBox(width: 16),
          _statCard(LucideIcons.car, "Vehicles", _stats['vehicles']!, Colors.pinkAccent),
        ],
      ),
    );
  }

  Widget _statCard(IconData icon, String label, int value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: color.withOpacity(0.05),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: color.withOpacity(0.1)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(height: 12),
            Text(value.toString(), style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _buildSubTabBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
        labelColor: Colors.amberAccent,
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "BANNERS"),
          Tab(text: "BARS"),
          Tab(text: "NAME BARS"),
          Tab(text: "VEHICLES"),
        ],
      ),
    );
  }

  Widget _buildBannersTab() => _placeholderList("Entry Banners");
  Widget _buildBarsTab() => _placeholderList("Entrance Bars");
  Widget _buildNamesTab() => _placeholderList("User Name Bars");
  Widget _buildVehiclesTab() => _placeholderList("Luxury Vehicles");

  Widget _placeholderList(String title) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.layout, color: Colors.white10, size: 48),
          const SizedBox(height: 16),
          Text("Manage $title", style: const TextStyle(color: Colors.white24, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Text("Configure visual arrival animations for high-level users", style: const TextStyle(color: Colors.white10, fontSize: 12)),
        ],
      ),
    );
  }
}
