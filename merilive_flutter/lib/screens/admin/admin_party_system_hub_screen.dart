import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminPartySystemHubScreen extends StatefulWidget {
  const AdminPartySystemHubScreen({super.key});

  @override
  State<AdminPartySystemHubScreen> createState() => _AdminPartySystemHubScreenState();
}

class _AdminPartySystemHubScreenState extends State<AdminPartySystemHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, dynamic> _stats = {'activeRooms': 0, 'totalBackgrounds': 0, 'activeBanners': 0};

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
        supa.from('live_rooms').select('id', count: CountOption.exact).eq('is_active', true),
        supa.from('party_backgrounds').select('id', count: CountOption.exact),
        supa.from('party_banners').select('id', count: CountOption.exact).eq('is_active', true),
      ]);

      if (mounted) {
        setState(() {
          _stats['activeRooms'] = results[0].count ?? 0;
          _stats['totalBackgrounds'] = results[1].count ?? 0;
          _stats['activeBanners'] = results[2].count ?? 0;
          _isLoading = false;
        });
      }
    } catch (e) {
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
                _buildActiveRoomsTab(),
                _buildAssetsTab('party_backgrounds', 'Party Backgrounds'),
                _buildAssetsTab('party_banners', 'Party Banners'),
                _buildWelcomeMsgTab(),
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
              decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.purple, Colors.pinkAccent]), borderRadius: BorderRadius.circular(16)),
              child: const Icon(LucideIcons.partyPopper, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(width: 24),
          FadeInDown(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("PARTY SYSTEM HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                const Text("Unified governance for live rooms, backgrounds, banners and welcome logic", style: TextStyle(color: Colors.white24, fontSize: 13)),
              ],
            ),
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
          _statCard("ACTIVE ROOMS", _stats['activeRooms'].toString(), LucideIcons.radio, Colors.greenAccent),
          const SizedBox(width: 20),
          _statCard("BACKGROUNDS", _stats['totalBackgrounds'].toString(), LucideIcons.image, Colors.blueAccent),
          const SizedBox(width: 20),
          _statCard("ACTIVE BANNERS", _stats['activeBanners'].toString(), LucideIcons.layout, Colors.orangeAccent),
        ],
      ),
    );
  }

  Widget _statCard(String label, String val, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.1))),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(val, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
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
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.purple, Colors.pinkAccent]), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "LIVE ROOMS"),
          Tab(text: "BACKGROUNDS"),
          Tab(text: "BANNERS"),
          Tab(text: "WELCOME MSGS"),
        ],
      ),
    );
  }

  Widget _buildActiveRoomsTab() {
    return StreamBuilder(
      stream: _api.getSupabase().from('live_rooms').stream(primaryKey: ['id']).eq('is_active', true),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final rooms = snapshot.data!;
        return ListView.builder(
          padding: const EdgeInsets.symmetric(horizontal: 40),
          itemCount: rooms.length,
          itemBuilder: (context, index) {
            final room = rooms[index];
            return Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
              child: Row(
                children: [
                  const Icon(LucideIcons.radio, color: Colors.greenAccent, size: 20),
                  const SizedBox(width: 20),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(room['title'] ?? 'Untitled Room', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                        Text("Host: ${room['host_id']} • Type: ${room['room_type']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                      ],
                    ),
                  ),
                  _actionIconButton(LucideIcons.ban, Colors.redAccent, () {}),
                ],
              ),
            );
          },
        );
      },
    );
  }

  Widget _buildAssetsTab(String table, String title) {
    return StreamBuilder(
      stream: _api.getSupabase().from(table).stream(primaryKey: ['id']),
      builder: (context, snapshot) {
        if (!snapshot.hasData) return const Center(child: CircularProgressIndicator());
        final assets = snapshot.data!;
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text("MANAGE $title", style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
                  ElevatedButton.icon(
                    onPressed: () {},
                    icon: const Icon(LucideIcons.plus, size: 14),
                    label: const Text("UPLOAD NEW"),
                    style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  ),
                ],
              ),
            ),
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, crossAxisSpacing: 20, mainAxisSpacing: 20, childAspectRatio: 1),
                itemCount: assets.length,
                itemBuilder: (context, index) {
                  final a = assets[index];
                  return Container(
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
                    child: Column(
                      children: [
                        Expanded(child: ClipRRect(borderRadius: const BorderRadius.vertical(top: Radius.circular(20)), child: Image.network(_api.resolveAssetUrl(a['image_url'] ?? '', bucket: 'assets'), fit: BoxFit.cover, errorBuilder: (c, e, s) => const Icon(LucideIcons.image, color: Colors.white10)))),
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Text(a['name'] ?? 'Unnamed', style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                              _actionIconButton(LucideIcons.trash2, Colors.redAccent, () {}),
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

  Widget _buildWelcomeMsgTab() {
    return const Center(child: Text("Welcome Messages Logic Registry", style: TextStyle(color: Colors.white24)));
  }

  Widget _actionIconButton(IconData icon, Color color, VoidCallback onTap) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
      child: InkWell(onTap: onTap, child: Icon(icon, color: color, size: 16)),
    );
  }
}
