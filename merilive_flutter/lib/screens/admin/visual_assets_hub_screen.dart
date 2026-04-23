import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'admin_avatar_frames_screen.dart';
import 'admin_chat_bubbles_screen.dart';
import 'admin_entry_effects_screen.dart';
import 'admin_gifts_screen.dart';
import 'admin_role_frames_screen.dart';
import 'admin_shop_screen.dart';
import '../../services/api_service.dart';

class VisualAssetsHubScreen extends StatefulWidget {
  const VisualAssetsHubScreen({super.key});

  @override
  State<VisualAssetsHubScreen> createState() => _VisualAssetsHubScreenState();
}

class _VisualAssetsHubScreenState extends State<VisualAssetsHubScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  
  Map<String, int> _stats = {
    'frames': 0,
    'roleFrames': 0,
    'bubbles': 0,
    'gifts': 0,
    'shop': 0,
    'entry': 0,
  };

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      final results = await Future.wait([
        supa.from('avatar_frames').select('id', const FetchOptions(count: CountOption.exact, head: true)),
        supa.from('role_frames').select('id', const FetchOptions(count: CountOption.exact, head: true)),
        supa.from('gifts').select('id', const FetchOptions(count: CountOption.exact, head: true)),
        supa.from('shop_items').select('id', const FetchOptions(count: CountOption.exact, head: true)),
        supa.from('entry_banners').select('id', const FetchOptions(count: CountOption.exact, head: true)),
      ]);

      setState(() {
        _stats = {
          'frames': results[0].count ?? 0,
          'roleFrames': results[1].count ?? 0,
          'bubbles': 0, // chat_bubbles placeholder
          'gifts': results[2].count ?? 0,
          'shop': results[3].count ?? 0,
          'entry': results[4].count ?? 0,
        };
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading asset stats: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        children: [
          _buildHeader(),
          _buildStatsRow(),
          _buildTabs(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildGiftsModule(),
                _buildFramesModule(),
                _buildRoleFramesModule(),
                _buildShopModule(),
                _buildEntryEffectsModule(),
                _buildBubblesModule(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(48),
      margin: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFDB2777), Color(0xFF9333EA), Color(0xFF4F46E5)]),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [BoxShadow(color: Colors.purple.withOpacity(0.2), blurRadius: 40, offset: const Offset(0, 20))],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.palette, color: Colors.white, size: 32),
                  const SizedBox(width: 20),
                  Text("VISUAL ASSETS HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                ],
              ),
              const Text("High-fidelity management of skins, animations, and virtual economy assets", style: TextStyle(color: Colors.white70)),
            ],
          ),
          _buildActionButtons(),
        ],
      ),
    );
  }

  Widget _buildActionButtons() {
    return Row(
      children: [
        ElevatedButton.icon(
          onPressed: _loadStats,
          icon: const Icon(LucideIcons.refreshCw, size: 16),
          label: const Text("REFRESH"),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.white.withOpacity(0.1), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
        ),
        const SizedBox(width: 12),
        ElevatedButton.icon(
          onPressed: () {},
          icon: const Icon(LucideIcons.plus, size: 16),
          label: const Text("NEW ASSET"),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
        ),
      ],
    );
  }

  Widget _buildStatsRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        children: [
          _statItem("GIFTS", _stats['gifts'].toString(), Colors.pinkAccent, LucideIcons.gift),
          const SizedBox(width: 12),
          _statItem("FRAMES", _stats['frames'].toString(), Colors.blueAccent, LucideIcons.image),
          const SizedBox(width: 12),
          _statItem("ROLES", _stats['roleFrames'].toString(), Colors.purpleAccent, LucideIcons.userCog),
          const SizedBox(width: 12),
          _statItem("SHOP", _stats['shop'].toString(), Colors.greenAccent, LucideIcons.shoppingBag),
          const SizedBox(width: 12),
          _statItem("ENTRY", _stats['entry'].toString(), Colors.orangeAccent, LucideIcons.zap),
        ],
      ),
    );
  }

  Widget _statItem(String label, String val, Color color, IconData icon) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 20),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.1))),
        child: Column(
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(height: 12),
            Text(val, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 24)),
            Text(label, style: TextStyle(color: color, fontSize: 8, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
          ],
        ),
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
      child: TabBar(
        controller: _tabController,
        isScrollable: false,
        indicatorColor: Colors.pinkAccent,
        indicatorWeight: 4,
        dividerColor: Colors.white.withOpacity(0.05),
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "GIFTS"),
          Tab(text: "FRAMES"),
          Tab(text: "ROLES"),
          Tab(text: "SHOP"),
          Tab(text: "ENTRY"),
          Tab(text: "BUBBLES"),
        ],
      ),
    );
  }

  // --- SUB-MODULES ---
  Widget _buildGiftsModule() => const AdminGiftsScreen();
  Widget _buildFramesModule() => const AdminAvatarFramesScreen();
  Widget _buildRoleFramesModule() => const AdminRoleFramesScreen();
  Widget _buildShopModule() => const AdminShopScreen();
  Widget _buildEntryEffectsModule() => const AdminEntryEffectsScreen();
  Widget _buildBubblesModule() => const AdminChatBubblesScreen();
}
