import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../../services/api_service.dart';

class AdminEntryAssetsHubScreen extends StatefulWidget {
  const AdminEntryAssetsHubScreen({super.key});

  @override
  State<AdminEntryAssetsHubScreen> createState() => _AdminEntryAssetsHubScreenState();
}

class _AdminEntryAssetsHubScreenState extends State<AdminEntryAssetsHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: Column(
        children: [
          _buildHeader(),
          _buildTabHeader(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildAssetGrid('entry_banners', 'Entry Banners'),
                _buildAssetGrid('entry_bars', 'Entry Bars'),
                _buildAssetGrid('entry_effects', 'Entry Effects'),
                _buildAssetGrid('entry_name_bars', 'Entry Name Bars'),
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
      child: Row(
        children: [
          FadeInLeft(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.orange, Colors.redAccent]), borderRadius: BorderRadius.circular(16)),
              child: const Icon(LucideIcons.sparkles, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(width: 24),
          FadeInDown(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("ENTRY ASSETS HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                const Text("Manage visual entrance animations, banners, and effects", style: TextStyle(color: Colors.white24, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabHeader() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 40),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.orange, Colors.redAccent]), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11),
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "BANNERS"),
          Tab(text: "BARS"),
          Tab(text: "EFFECTS"),
          Tab(text: "NAME BARS"),
        ],
      ),
    );
  }

  Widget _buildAssetGrid(String table, String title) {
    return StreamBuilder(
      stream: _api.getSupabase().from(table).stream(primaryKey: ['id']).order('created_at'),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) return const Center(child: CircularProgressIndicator());
        final assets = snapshot.data ?? [];
        
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(40),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text("MANAGE $title", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  ElevatedButton.icon(
                    onPressed: () {},
                    icon: const Icon(LucideIcons.plus, size: 16),
                    label: const Text("UPLOAD NEW"),
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  ),
                ],
              ),
            ),
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, crossAxisSpacing: 20, mainAxisSpacing: 20, childAspectRatio: 0.8),
                itemCount: assets.length,
                itemBuilder: (context, index) {
                  final a = assets[index];
                  return Container(
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
                    child: Column(
                      children: [
                        Expanded(child: ClipRRect(borderRadius: const BorderRadius.vertical(top: Radius.circular(20)), child: Image.network(_api.resolveAssetUrl(a['image_url'] ?? '', bucket: 'assets'), fit: BoxFit.cover, errorBuilder: (c, e, s) => const Icon(LucideIcons.image, color: Colors.white10)))),
                        Padding(
                          padding: const EdgeInsets.all(16),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(a['name'] ?? 'Unnamed', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                              Text("${a['price'] ?? 0} 💎", style: const TextStyle(color: Colors.amberAccent, fontSize: 10)),
                              const SizedBox(height: 12),
                              Row(
                                children: [
                                  _actionIconButton(LucideIcons.edit2, Colors.blueAccent),
                                  const SizedBox(width: 8),
                                  _actionIconButton(LucideIcons.trash2, Colors.redAccent),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _actionIconButton(IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
      child: Icon(icon, color: color, size: 14),
    );
  }
}
