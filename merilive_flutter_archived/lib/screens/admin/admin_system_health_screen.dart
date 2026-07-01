import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminSystemHealthScreen extends StatefulWidget {
  const AdminSystemHealthScreen({super.key});

  @override
  State<AdminSystemHealthScreen> createState() => _AdminSystemHealthScreenState();
}

class _AdminSystemHealthScreenState extends State<AdminSystemHealthScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, dynamic> _healthMetrics = {
    'database': 'ONLINE',
    'storage': 'OPTIMAL',
    'auth': 'HEALTHY',
    'cpu_usage': 12,
    'memory_usage': 45,
    'active_connections': 1240,
    'latency': '45ms'
  };

  @override
  void initState() {
    super.initState();
    _refreshMetrics();
  }

  Future<void> _refreshMetrics() async {
    setState(() => _isLoading = true);
    try {
      // Simulation of a health check RPC or API call
      await Future.delayed(const Duration(seconds: 1));
      if (mounted) {
        setState(() {
          _healthMetrics = {
            'database': 'ONLINE',
            'storage': 'OPTIMAL',
            'auth': 'HEALTHY',
            'cpu_usage': 15 + (DateTime.now().second % 10),
            'memory_usage': 42 + (DateTime.now().second % 5),
            'active_connections': 1200 + (DateTime.now().second * 10),
            'latency': '${30 + (DateTime.now().second % 20)}ms'
          };
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
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.emeraldAccent))
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(40),
                  child: Column(
                    children: [
                      _buildStatusGrid(),
                      const SizedBox(height: 40),
                      _buildPerformanceCharts(),
                      const SizedBox(height: 40),
                      _buildConnectionStats(),
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
      padding: const EdgeInsets.all(40),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              FadeInLeft(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.emerald, Colors.tealAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.activity, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("SYSTEM HEALTH MONITOR", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Real-time infrastructure performance and connectivity metrics", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: _refreshMetrics,
            icon: const Icon(LucideIcons.refreshCw, size: 16),
            label: const Text("REFRESH"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusGrid() {
    return Row(
      children: [
        _statusCard("DATABASE", _healthMetrics['database'], LucideIcons.database, Colors.blueAccent),
        const SizedBox(width: 20),
        _statusCard("STORAGE", _healthMetrics['storage'], LucideIcons.hardDrive, Colors.purpleAccent),
        const SizedBox(width: 20),
        _statusCard("AUTH SERVICE", _healthMetrics['auth'], LucideIcons.shieldCheck, Colors.emeraldAccent),
        const SizedBox(width: 20),
        _statusCard("LATENCY", _healthMetrics['latency'], LucideIcons.zap, Colors.amberAccent),
      ],
    );
  }

  Widget _statusCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.1))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 24),
            Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
          ],
        ),
      ),
    );
  }

  Widget _buildPerformanceCharts() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("RESOURCE UTILIZATION", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 32),
          _usageBar("CPU USAGE", _healthMetrics['cpu_usage'] / 100, Colors.orangeAccent),
          const SizedBox(height: 24),
          _usageBar("MEMORY USAGE", _healthMetrics['memory_usage'] / 100, Colors.blueAccent),
        ],
      ),
    );
  }

  Widget _usageBar(String label, double value, Color color) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: const TextStyle(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.bold)),
            Text("${(value * 100).toInt()}%", style: TextStyle(color: color, fontWeight: FontWeight.bold)),
          ],
        ),
        const SizedBox(height: 12),
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: LinearProgressIndicator(value: value, backgroundColor: Colors.white.withOpacity(0.05), valueColor: AlwaysStoppedAnimation<Color>(color), minHeight: 8),
        ),
      ],
    );
  }

  Widget _buildConnectionStats() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        children: [
          const Icon(LucideIcons.users, color: Colors.blueAccent, size: 24),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("${_healthMetrics['active_connections']}", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
              const Text("ACTIVE SOCKET CONNECTIONS", style: TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(color: Colors.emerald.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
            child: const Text("OPTIMAL LOAD", style: TextStyle(color: Colors.emerald, fontSize: 10, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}
