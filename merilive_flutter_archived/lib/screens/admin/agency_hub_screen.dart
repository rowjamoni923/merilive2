import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AgencyHubScreen extends StatefulWidget {
  const AgencyHubScreen({super.key});

  @override
  State<AgencyHubScreen> createState() => _AgencyHubScreenState();
}

class _AgencyHubScreenState extends State<AgencyHubScreen> {
  final ApiService _api = ApiService();
  List<Map<String, dynamic>> _agencies = [];
  Map<String, dynamic> _stats = {};
  bool _isLoading = true;
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _loadAgencies();
  }

  Future<void> _loadAgencies() async {
    setState(() => _isLoading = true);
    final results = await Future.wait([
      _api.getAdminAgencies(),
      _api.getAdminDashboardStats(),
    ]);
    setState(() {
      _agencies = results[0] as List<Map<String, dynamic>>;
      _stats = results[1] as Map<String, dynamic>;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 40),
          _buildStatsRow(),
          const SizedBox(height: 40),
          Text(
            "AGENCY DIRECTORY",
            style: GoogleFonts.outfit(
              color: Colors.white38,
              fontSize: 12,
              fontWeight: FontWeight.w900,
              letterSpacing: 2,
            ),
          ),
          const SizedBox(height: 20),
          Expanded(child: _buildAgencyGrid()),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              "AGENCY MANAGEMENT",
              style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900),
            ),
            const Text(
              "Monitor and manage enterprise-level host agencies and their performance",
              style: TextStyle(color: Colors.white38, fontSize: 14),
            ),
          ],
        ),
        Container(
          width: 350,
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white10),
          ),
          child: TextField(
            style: const TextStyle(color: Colors.white, fontSize: 14),
            decoration: const InputDecoration(
              hintText: "Search agencies by name or code...",
              hintStyle: TextStyle(color: Colors.white24, fontSize: 14),
              prefixIcon: Icon(LucideIcons.search, color: Colors.white24, size: 18),
              border: InputBorder.none,
            ),
            onChanged: (v) => setState(() => _searchQuery = v),
          ),
        ),
      ],
    );
  }

  Widget _buildStatsRow() {
    return Row(
      children: [
        _buildStatCard("Total Agencies", (_stats['total_agencies'] ?? _stats['active_agencies'] ?? _agencies.length).toString(), LucideIcons.building2, Colors.blueAccent),
        const SizedBox(width: 24),
        _buildStatCard("Today Revenue", "\$${_api.formatNumber(_stats['today_revenue'] ?? _stats['daily_income'] ?? 0)}", LucideIcons.trendingUp, Colors.greenAccent),
        const SizedBox(width: 24),
        _buildStatCard("Pending Hosts", (_stats['pending_host_applications'] ?? _stats['pending_hosts'] ?? 0).toString(), LucideIcons.clock, Colors.orangeAccent),
      ],
    );
  }

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: color.withOpacity(0.03),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: color.withOpacity(0.1)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 20),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                Text(
                  label.toUpperCase(),
                  style: GoogleFonts.outfit(color: color.withOpacity(0.6), fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAgencyGrid() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    
    final filtered = _agencies.where((a) => (a['name'] ?? '').toString().toLowerCase().contains(_searchQuery.toLowerCase())).toList();

    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 3,
        childAspectRatio: 1.4,
        crossAxisSpacing: 24,
        mainAxisSpacing: 24,
      ),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final a = filtered[index];
        return _buildAgencyCard(a, index);
      },
    );
  }

  Widget _buildAgencyCard(Map<String, dynamic> a, int index) {
    return FadeInUp(
      delay: Duration(milliseconds: 50 * index),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () {},
          child: Column(
            children: [
              Container(
                height: 6,
                width: double.infinity,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFA855F7)]),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  children: [
                    Row(
                      children: [
                         CircleAvatar(
                           radius: 30,
                           backgroundImage: a['owner']?['avatar_url'] != null ? NetworkImage(a['owner']?['avatar_url']) : null,
                           backgroundColor: Colors.white10,
                           child: a['owner']?['avatar_url'] == null ? const Icon(LucideIcons.user, color: Colors.white24) : null,
                         ),
                         const SizedBox(width: 20),
                         Expanded(
                           child: Column(
                             crossAxisAlignment: CrossAxisAlignment.start,
                             children: [
                               Text(a['name'] ?? 'Agency', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                               Text("CODE: ${a['agency_code']}", style: const TextStyle(color: Colors.white38, fontSize: 12, letterSpacing: 1)),
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
                        _buildSmallStat("HOSTS", "${a['total_hosts'] ?? 0}"),
                        _buildSmallStat("REVENUE", "\$${a['today_revenue'] ?? 0}"),
                        _buildSmallStat("STATUS", a['is_blocked'] == true ? "Blocked" : "Active", color: a['is_blocked'] == true ? Colors.redAccent : Colors.greenAccent),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildSmallStat(String label, String value, {Color? color}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1)),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(color: color ?? Colors.white70, fontSize: 15, fontWeight: FontWeight.w900)),
      ],
    );
  }
}
