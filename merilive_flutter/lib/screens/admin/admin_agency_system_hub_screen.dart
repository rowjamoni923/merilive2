import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class AdminAgencySystemHubScreen extends StatefulWidget {
  const AdminAgencySystemHubScreen({super.key});

  @override
  State<AdminAgencySystemHubScreen> createState() => _AdminAgencySystemHubScreenState();
}

class _AdminAgencySystemHubScreenState extends State<AdminAgencySystemHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _agencies = [];
  Map<String, int> _stats = {'total': 0, 'active': 0, 'helpers': 0, 'level5': 0};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final agenciesRes = await supa.from('agencies').select('*').order('created_at', ascending: false);
      final helpersRes = await supa.from('topup_helpers').select('id', count: CountOption.exact).eq('is_active', true);
      final level5Res = await supa.from('topup_helpers').select('id', count: CountOption.exact).eq('trader_level', 5);

      setState(() {
        _agencies = List<Map<String, dynamic>>.from(agenciesRes);
        _stats['total'] = _agencies.length;
        _stats['active'] = _agencies.where((a) => a['is_active'] == true).length;
        _stats['helpers'] = helpersRes.count ?? 0;
        _stats['level5'] = level5Res.count ?? 0;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading agency system: $e");
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
                _buildAgenciesGrid(),
                const Center(child: Text("Helper Management", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("Level 5 Dashboard", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("Agency Policy Settings", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("Payout Scheduler", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("Transfer History", style: TextStyle(color: Colors.white24))),
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
          colors: [Colors.blueAccent.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.indigoAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.building2, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("AGENCY GOVERNANCE HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Unified management for enterprise agencies, traders, and commission structures", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
          _statCard("TOTAL AGENCIES", _stats['total'].toString(), LucideIcons.building2, Colors.blueAccent),
          const SizedBox(width: 16),
          _statCard("ACTIVE AGENCIES", _stats['active'].toString(), LucideIcons.checkCircle, Colors.greenAccent),
          const SizedBox(width: 16),
          _statCard("ACTIVE HELPERS", _stats['helpers'].toString(), LucideIcons.crown, Colors.purpleAccent),
          const SizedBox(width: 16),
          _statCard("LEVEL 5 TRADERS", _stats['level5'].toString(), LucideIcons.star, Colors.amberAccent),
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
          indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blueAccent, Colors.indigoAccent]), borderRadius: BorderRadius.circular(12)),
          dividerColor: Colors.transparent,
          labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
          unselectedLabelColor: Colors.white24,
          tabs: const [
            Tab(text: "AGENCIES"),
            Tab(text: "HELPERS"),
            Tab(text: "LEVEL 5"),
            Tab(text: "POLICY"),
            Tab(text: "SCHEDULER"),
            Tab(text: "HISTORY"),
          ],
        ),
      ),
    );
  }

  Widget _buildAgenciesGrid() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Colors.blueAccent));

    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        crossAxisSpacing: 24,
        mainAxisSpacing: 24,
        childAspectRatio: 1.5,
      ),
      itemCount: _agencies.length,
      itemBuilder: (context, index) {
        final a = _agencies[index];
        final bool isActive = a['is_active'] ?? false;

        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(color: isActive ? Colors.blueAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
            ),
            child: Column(
              children: [
                Container(
                  height: 6,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: isActive ? [Colors.blue, Colors.indigoAccent] : [Colors.white10, Colors.white10]),
                    borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          Container(
                            width: 60, height: 60,
                            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
                            child: const Icon(LucideIcons.building2, color: Colors.blueAccent, size: 28),
                          ),
                          const SizedBox(width: 20),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(a['name'] ?? 'Agency', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                                Text("CODE: ${a['agency_code']}", style: const TextStyle(color: Colors.white24, fontSize: 12, letterSpacing: 1)),
                              ],
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 24),
                      const Divider(color: Colors.white10),
                      const SizedBox(height: 16),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          _smallStat("HOSTS", "${a['total_hosts'] ?? 0}"),
                          _smallStat("REVENUE", "\$${a['today_revenue'] ?? 0}"),
                          _smallStat("STATUS", isActive ? "Active" : "Blocked", color: isActive ? Colors.greenAccent : Colors.redAccent),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _smallStat(String label, String value, {Color? color}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1)),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(color: color ?? Colors.white70, fontSize: 14, fontWeight: FontWeight.w900)),
      ],
    );
  }

  Widget _iconBtn(IconData icon, Color bg, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: Colors.white, size: 14),
      ),
    );
  }
}
