import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:provider/provider.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';

class AgencyAnalyticsScreen extends StatefulWidget {
  const AgencyAnalyticsScreen({super.key});

  @override
  State<AgencyAnalyticsScreen> createState() => _AgencyAnalyticsScreenState();
}

class _AgencyAnalyticsScreenState extends State<AgencyAnalyticsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _dailyData = [];
  Map<String, dynamic> _stats = {
    'total_hosts': 0,
    'online_hosts': 0,
    'total_beans': 0,
    'avg_session': '0h',
  };

  @override
  void initState() {
    super.initState();
    _loadAnalytics();
  }

  Future<void> _loadAnalytics() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      final agencyId = profile?['agency_id'];
      if (agencyId != null) {
        final performance = await _api.getAgencyPerformanceHistory(agencyId);
        final onlineCount = await _api.getOnlineHostsCount(agencyId);
        final hosts = await _api.getAgencyHosts(agencyId, 'active');
        
        setState(() {
          _dailyData = List<Map<String, dynamic>>.from(performance);
          _stats['total_hosts'] = hosts.length;
          _stats['online_hosts'] = onlineCount;
          _stats['total_beans'] = _dailyData.fold<num>(0, (sum, e) => sum + (e['total_income'] ?? 0));
          _stats['avg_session'] = '4.8h'; 
        });
      }
    } catch (e) {
      debugPrint("Parity Analytics Error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
                    : _buildContent(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
              child: const Icon(LucideIcons.chevronLeft, color: Colors.white, size: 20),
            ),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("Performance Analytics", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              Text("Master Copy • Real-time Insights", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
            ],
          ),
          const Spacer(),
          IconButton(icon: const Icon(LucideIcons.refreshCcw, color: Colors.white24, size: 18), onPressed: _loadAnalytics),
        ],
      ),
    );
  }

  Widget _buildContent() {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      physics: const BouncingScrollPhysics(),
      children: [
        _buildMainChart(),
        const SizedBox(height: 24),
        _buildStatGrid(),
        const SizedBox(height: 32),
        _buildSectionHeader("Host Performance Highlights"),
        const SizedBox(height: 16),
        FadeInUp(delay: const Duration(milliseconds: 100), child: _buildHighlightCard("Top Earner Today", "Host_Elite_01", "52,400 BEANS", LucideIcons.trophy, Colors.amberAccent)),
        FadeInUp(delay: const Duration(milliseconds: 200), child: _buildHighlightCard("Longest Stream", "Maya_Queen", "8.2 Hours", LucideIcons.clock, Colors.cyanAccent)),
        FadeInUp(delay: const Duration(milliseconds: 300), child: _buildHighlightCard("Network Health", "Optimized", "100% Agency Sync", LucideIcons.activity, Colors.greenAccent)),
        const SizedBox(height: 40),
      ],
    );
  }

  Widget _buildMainChart() {
    return Container(
      height: 280,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(32),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("REVENUE TREND", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.greenAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: const Text("LIVE", style: TextStyle(color: Colors.greenAccent, fontSize: 8, fontWeight: FontWeight.bold))),
            ],
          ),
          const SizedBox(height: 24),
          Expanded(
            child: _dailyData.isEmpty 
              ? Center(child: Text("Initializing Trend Data...", style: TextStyle(color: Colors.white.withOpacity(0.1), fontSize: 12)))
              : LineChart(
                  LineChartData(
                    gridData: const FlGridData(show: false),
                    titlesData: const FlTitlesData(show: false),
                    borderData: FlBorderData(show: false),
                    lineBarsData: [
                      LineChartBarData(
                        spots: _dailyData.asMap().entries.map((e) => FlSpot(e.key.toDouble(), (e.value['total_income'] ?? 0).toDouble())).toList(),
                        isCurved: true,
                        gradient: const LinearGradient(colors: [Colors.cyanAccent, Colors.blueAccent]),
                        barWidth: 4,
                        isStrokeCapRound: true,
                        dotData: const FlDotData(show: false),
                        belowBarData: BarAreaData(
                          show: true,
                          gradient: LinearGradient(colors: [Colors.cyanAccent.withOpacity(0.15), Colors.cyanAccent.withOpacity(0)]),
                        ),
                      ),
                    ],
                  ),
                ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatGrid() {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 2,
      mainAxisSpacing: 16,
      crossAxisSpacing: 16,
      childAspectRatio: 1.4,
      children: [
        _buildStatCard("TOTAL BEANS", _api.formatNumber(_stats['total_beans']), LucideIcons.coins, Colors.amberAccent),
        _buildStatCard("ONLINE HOSTS", _stats['online_hosts'].toString(), LucideIcons.zap, Colors.greenAccent),
        _buildStatCard("TOTAL ASSETS", _stats['total_hosts'].toString(), LucideIcons.users, Colors.indigoAccent),
        _buildStatCard("AVG SESSION", _stats['avg_session'], LucideIcons.timer, Colors.pinkAccent),
      ],
    );
  }

  Widget _buildStatCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 12),
          Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900)),
          Text(label, style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Text(title.toUpperCase(), style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5));
  }

  Widget _buildHighlightCard(String title, String subtitle, String trail, IconData icon, Color color) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle), child: Icon(icon, color: color, size: 18)),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 10)),
                Text(subtitle, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
              ],
            ),
          ),
          Text(trail, style: GoogleFonts.outfit(color: color, fontSize: 12, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}


