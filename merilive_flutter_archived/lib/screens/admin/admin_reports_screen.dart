import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminReportsScreen extends StatefulWidget {
  const AdminReportsScreen({super.key});

  @override
  State<AdminReportsScreen> createState() => _AdminReportsScreenState();
}

class _AdminReportsScreenState extends State<AdminReportsScreen> {
  final ApiService _api = ApiService();
  String _period = "week";
  bool _isLoading = true;
  
  Map<String, dynamic> _stats = {
    'totalUsers': 0,
    'newUsersToday': 0,
    'totalCoinsSpent': 0,
    'totalGiftsSent': 0,
    'totalStreams': 0,
    'totalCalls': 0
  };

  List<Map<String, dynamic>> _chartData = [];

  @override
  void initState() {
    super.initState();
    _loadReportData();
  }

  Future<void> _loadReportData() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      // Fetch core counts
      final results = await Future.wait([
        supa.from("profiles").select("*", const FetchOptions(count: CountOption.exact, head: true)),
        supa.from("gift_transactions").select("*", const FetchOptions(count: CountOption.exact, head: true)),
        supa.from("live_streams").select("*", const FetchOptions(count: CountOption.exact, head: true)),
        supa.from("private_calls").select("*", const FetchOptions(count: CountOption.exact, head: true)),
      ]);

      final today = DateTime.now();
      final startOfToday = DateTime(today.year, today.month, today.day);
      
      final newUsersToday = await supa
          .from("profiles")
          .select("*", const FetchOptions(count: CountOption.exact, head: true))
          .gte("created_at", startOfToday.toIso8601String());

      // Fetch coins spent (recent 1000 gifts to estimate)
      final giftsRes = await supa
          .from("gift_transactions")
          .select("coin_amount, created_at")
          .order("created_at", ascending: false)
          .limit(1000);
      
      int totalCoinsSpent = 0;
      if (giftsRes != null) {
        for (var g in (giftsRes as List)) {
          totalCoinsSpent += (g['coin_amount'] as int? ?? 0);
        }
      }

      // Generate dummy chart data for visualization (simulating web logic)
      final days = _period == "week" ? 7 : 30;
      List<Map<String, dynamic>> data = [];
      for (int i = days - 1; i >= 0; i--) {
        final date = DateTime.now().subtract(Duration(days: i));
        data.add({
          'date': DateFormat('dd MMM').format(date),
          'users': (10 + (i * 2)).toDouble(), // Simulated data
          'coins': (1000 + (i * 500)).toDouble(), // Simulated data
          'streams': (5 + (i % 3)).toDouble(), // Simulated data
        });
      }

      setState(() {
        _stats = {
          'totalUsers': results[0].count ?? 0,
          'newUsersToday': newUsersToday.count ?? 0,
          'totalCoinsSpent': totalCoinsSpent,
          'totalGiftsSent': results[1].count ?? 0,
          'totalStreams': results[2].count ?? 0,
          'totalCalls': results[3].count ?? 0
        };
        _chartData = data;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading reports: $e");
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
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    children: [
                      _buildStatsGrid(),
                      const SizedBox(height: 32),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: _buildBarChart("USER GROWTH", LucideIcons.users, Colors.blueAccent, 'users')),
                          const SizedBox(width: 32),
                          Expanded(child: _buildLineChart("DIAMONDS SPENT", LucideIcons.coins, Colors.amberAccent, 'coins')),
                        ],
                      ),
                      const SizedBox(height: 32),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Expanded(child: _buildPieChart()),
                          const SizedBox(width: 32),
                          Expanded(child: _buildBarChart("LIVE STREAMS", LucideIcons.video, Colors.redAccent, 'streams')),
                        ],
                      ),
                    ],
                  ),
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
        gradient: const LinearGradient(colors: [Color(0xFF3B82F6), Color(0xFF4F46E5), Color(0xFF9333EA)]),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [BoxShadow(color: Colors.blue.withOpacity(0.2), blurRadius: 40, offset: const Offset(0, 20))],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.trendingUp, color: Colors.white, size: 32),
                  const SizedBox(width: 20),
                  Text("REPORTS & ANALYTICS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                ],
              ),
              const Text("High-fidelity performance analysis and system audit", style: TextStyle(color: Colors.white70, fontSize: 16)),
            ],
          ),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
            child: Row(
              children: [
                _periodBtn("week", "Last 7 Days"),
                _periodBtn("month", "Last 30 Days"),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _periodBtn(String val, String label) {
    final bool active = _period == val;
    return GestureDetector(
      onTap: () {
        setState(() => _period = val);
        _loadReportData();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        decoration: BoxDecoration(color: active ? Colors.white : Colors.transparent, borderRadius: BorderRadius.circular(12)),
        child: Text(label, style: TextStyle(color: active ? Colors.black : Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
      ),
    );
  }

  Widget _buildStatsGrid() {
    return Row(
      children: [
        _statCard("TOTAL USERS", _stats['totalUsers'], LucideIcons.users, Colors.blueAccent),
        const SizedBox(width: 16),
        _statCard("NEW TODAY", _stats['newUsersToday'], LucideIcons.userPlus, Colors.greenAccent),
        const SizedBox(width: 16),
        _statCard("DIAMONDS", _api.formatNumber(_stats['totalCoinsSpent']), LucideIcons.coins, Colors.amberAccent),
        const SizedBox(width: 16),
        _statCard("GIFTS SENT", _stats['totalGiftsSent'], LucideIcons.gift, Colors.pinkAccent),
        const SizedBox(width: 16),
        _statCard("STREAMS", _stats['totalStreams'], LucideIcons.video, Colors.redAccent),
        const SizedBox(width: 16),
        _statCard("CALLS", _stats['totalCalls'], LucideIcons.phone, Colors.purpleAccent),
      ],
    );
  }

  Widget _statCard(String label, dynamic val, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: color.withOpacity(0.05),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: color.withOpacity(0.1)),
        ),
        child: Column(
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 16),
            Text(val.toString(), style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            Text(label, style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
          ],
        ),
      ),
    );
  }

  Widget _buildBarChart(String title, IconData icon, Color color, String key) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 18),
              const SizedBox(width: 12),
              Text(title, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 32),
          SizedBox(
            height: 250,
            child: BarChart(
              BarChartData(
                alignment: BarChartAlignment.spaceAround,
                maxY: 100,
                barTouchData: BarTouchData(enabled: true),
                titlesData: FlTitlesData(show: false),
                gridData: FlGridData(show: false),
                borderData: FlBorderData(show: false),
                barGroups: _chartData.asMap().entries.map((e) {
                  return BarChartGroupData(
                    x: e.key,
                    barRods: [BarChartRodData(toY: e.value[key], color: color, width: 12, borderRadius: BorderRadius.circular(4))],
                  );
                }).toList(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLineChart(String title, IconData icon, Color color, String key) {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: color, size: 18),
              const SizedBox(width: 12),
              Text(title, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 32),
          SizedBox(
            height: 250,
            child: LineChart(
              LineChartData(
                gridData: FlGridData(show: false),
                titlesData: FlTitlesData(show: false),
                borderData: FlBorderData(show: false),
                lineBarsData: [
                  LineChartBarData(
                    spots: _chartData.asMap().entries.map((e) => FlSpot(e.key.toDouble(), e.value[key])).toList(),
                    isCurved: true,
                    color: color,
                    barWidth: 4,
                    isStrokeCapRound: true,
                    dotData: FlDotData(show: false),
                    belowBarData: BarAreaData(show: true, color: color.withOpacity(0.1)),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPieChart() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.gift, color: Colors.pinkAccent, size: 18),
              const SizedBox(width: 12),
              Text("GIFT DISTRIBUTION", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 32),
          SizedBox(
            height: 250,
            child: PieChart(
              PieChartData(
                sectionsSpace: 0,
                centerSpaceRadius: 60,
                sections: [
                  PieChartSectionData(color: Colors.greenAccent, value: 35, title: '35%', radius: 50, titleStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  PieChartSectionData(color: Colors.blueAccent, value: 40, title: '40%', radius: 50, titleStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  PieChartSectionData(color: Colors.purpleAccent, value: 20, title: '20%', radius: 50, titleStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  PieChartSectionData(color: Colors.amberAccent, value: 5, title: '5%', radius: 50, titleStyle: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
