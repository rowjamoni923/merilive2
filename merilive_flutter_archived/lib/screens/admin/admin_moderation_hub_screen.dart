import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminModerationHubScreen extends StatefulWidget {
  const AdminModerationHubScreen({super.key});

  @override
  State<AdminModerationHubScreen> createState() => _AdminModerationHubScreenState();
}

class _AdminModerationHubScreenState extends State<AdminModerationHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, int> _stats = {'reports': 0, 'banned': 0, 'liveBans': 0, 'pendingFace': 0};

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
      final reports = await supa.from('reports').select('id', count: CountOption.exact).eq('status', 'pending');
      final banned = await supa.from('profiles').select('id', count: CountOption.exact).eq('is_blocked', true);
      final face = await supa.from('profiles').select('id', count: CountOption.exact).eq('is_face_verified', false).not('face_data', 'is', null);

      setState(() {
        _stats['reports'] = reports.count ?? 0;
        _stats['banned'] = banned.count ?? 0;
        _stats['pendingFace'] = face.count ?? 0;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading moderation stats: $e");
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
                _buildModulePlaceholder("Reports & Violations", LucideIcons.flag),
                _buildModulePlaceholder("Banned Users", LucideIcons.ban),
                _buildModulePlaceholder("Live Stream Bans", LucideIcons.videoOff),
                _buildModulePlaceholder("Face Verification", LucideIcons.scanFace),
                _buildModulePlaceholder("Device Management", LucideIcons.smartphone),
                _buildModulePlaceholder("Number Sharing", LucideIcons.hash),
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
          colors: [Colors.redAccent.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.redAccent, Colors.deepOrangeAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.shieldAlert, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("MODERATION & TRUST", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Unified governance for user violations, face verification, and platform security", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
          _statCard("PENDING REPORTS", _stats['reports'].toString(), LucideIcons.flag, Colors.redAccent),
          const SizedBox(width: 16),
          _statCard("BANNED USERS", _stats['banned'].toString(), LucideIcons.users, Colors.orangeAccent),
          const SizedBox(width: 16),
          _statCard("FACE VERIFICATION", _stats['pendingFace'].toString(), LucideIcons.scanFace, Colors.blueAccent),
          const SizedBox(width: 16),
          _statCard("LIVE BANS", "0", LucideIcons.videoOff, Colors.purpleAccent),
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
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: TabBar(
          controller: _tabController,
          isScrollable: true,
          indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.redAccent, Colors.deepOrangeAccent]), borderRadius: BorderRadius.circular(12)),
          dividerColor: Colors.transparent,
          labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
          unselectedLabelColor: Colors.white24,
          tabs: const [
            Tab(text: "REPORTS"),
            Tab(text: "BANNED"),
            Tab(text: "LIVE BANS"),
            Tab(text: "VERIFICATION"),
            Tab(text: "DEVICES"),
            Tab(text: "SECURITY"),
          ],
        ),
      ),
    );
  }

  Widget _buildModulePlaceholder(String title, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 64, color: Colors.white10),
          const SizedBox(height: 24),
          Text(
            "$title Hub",
            style: GoogleFonts.outfit(color: Colors.white38, fontSize: 18, fontWeight: FontWeight.bold),
          ),
        ],
      ),
    );
  }
}
