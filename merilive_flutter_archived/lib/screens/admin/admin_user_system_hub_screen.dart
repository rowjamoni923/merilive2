import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';
import 'user_hub_screen.dart'; // Reuse the existing detailed list but wrap in hub

class AdminUserSystemHubScreen extends StatefulWidget {
  const AdminUserSystemHubScreen({super.key});

  @override
  State<AdminUserSystemHubScreen> createState() => _AdminUserSystemHubScreenState();
}

class _AdminUserSystemHubScreenState extends State<AdminUserSystemHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, dynamic> _stats = {
    'total': 0, 'verified': 0, 'active': 0, 'banned': 0, 'online': 0, 'newToday': 0
  };

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
      final todayStart = DateTime.now().copyWith(hour: 0, minute: 0, second: 0, millisecond: 0).toIso8601String();
      
      final [totalRes, bannedRes, verifiedRes, onlineRes, newRes] = await Future.wait([
        supa.from('profiles').select('id', count: CountOption.exact),
        supa.from('profiles').select('id', count: CountOption.exact).eq('is_blocked', true),
        supa.from('profiles').select('id', count: CountOption.exact).eq('is_face_verified', true),
        supa.from('profiles').select('id', count: CountOption.exact).eq('is_online', true),
        supa.from('profiles').select('id', count: CountOption.exact).gte('created_at', todayStart),
      ]);

      setState(() {
        _stats['total'] = totalRes.count ?? 0;
        _stats['banned'] = bannedRes.count ?? 0;
        _stats['verified'] = verifiedRes.count ?? 0;
        _stats['online'] = onlineRes.count ?? 0;
        _stats['newToday'] = newRes.count ?? 0;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading user stats: $e");
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
                const UserHubScreen(), // This already has the search and list logic
                const Center(child: Text("Online Users Map", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("Registration Analytics", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("User Support History", style: TextStyle(color: Colors.white24))),
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
          colors: [Colors.purpleAccent.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.purpleAccent, Colors.violetAccent]), borderRadius: BorderRadius.circular(16)),
                child: const Icon(LucideIcons.users, color: Colors.white, size: 28),
              ),
              const SizedBox(width: 24),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("USER MANAGEMENT HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                  const Text("Real-time monitoring, account auditing, and user distribution tracking center", style: TextStyle(color: Colors.white24, fontSize: 13)),
                ],
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white10)),
            child: Row(
              children: [
                Container(width: 8, height: 8, decoration: const BoxDecoration(color: Colors.greenAccent, shape: BoxShape.circle)),
                const SizedBox(width: 12),
                Text("${_stats['online']} ONLINE NOW", style: GoogleFonts.outfit(color: Colors.greenAccent, fontSize: 10, fontWeight: FontWeight.bold)),
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
          _statCard("TOTAL USERS", _stats['total'].toString(), LucideIcons.users, Colors.blueAccent),
          const SizedBox(width: 16),
          _statCard("FACE VERIFIED", _stats['verified'].toString(), LucideIcons.scanFace, Colors.greenAccent),
          const SizedBox(width: 16),
          _statCard("NEW TODAY", "+${_stats['newToday']}", LucideIcons.userPlus, Colors.purpleAccent),
          const SizedBox(width: 16),
          _statCard("BANNED ACCOUNTS", _stats['banned'].toString(), LucideIcons.ban, Colors.redAccent),
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
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.purpleAccent, Colors.violetAccent]), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "USER DIRECTORY"),
          Tab(text: "LIVE TRACKING"),
          Tab(text: "ANALYTICS"),
          Tab(text: "SUPPORT LOGS"),
        ],
      ),
    );
  }
}
