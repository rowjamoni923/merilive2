import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class TransferHistoryScreen extends StatefulWidget {
  const TransferHistoryScreen({super.key});

  @override
  State<TransferHistoryScreen> createState() => _TransferHistoryScreenState();
}

class _TransferHistoryScreenState extends State<TransferHistoryScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _transfers = [];
  Map<String, dynamic> _stats = {'count': 0, 'total': 0};

  @override
  void initState() {
    super.initState();
    _loadTransfers();
  }

  Future<void> _loadTransfers() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('agency_earnings_transfers').select('''
        *,
        agency:agencies(name, agency_code),
        host:profiles!agency_earnings_transfers_host_id_fkey(display_name, app_uid)
      ''').order('created_at', ascending: false).limit(100);
      
      final data = List<Map<String, dynamic>>.from(res);
      setState(() {
        _transfers = data;
        _stats = {
          'count': data.length,
          'total': data.fold(0, (sum, t) => sum + (t['amount'] ?? 0)),
        };
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading transfers: $e");
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
          const SizedBox(height: 32),
          Expanded(child: _buildTable()),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("TRANSFER LEDGER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              const Text("Platform-wide record of Host-to-Agency earnings settlements", style: TextStyle(color: Colors.white38, fontSize: 14)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: _loadTransfers,
            icon: const Icon(LucideIcons.refreshCw, size: 16),
            label: const Text("REFRESH LEDGER"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsRow() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        children: [
          _buildStatCard("Total Transfers", _stats['count'].toString(), LucideIcons.arrowUpDown, Colors.blueAccent),
          const SizedBox(width: 16),
          _buildStatCard("Volume Settled", "${_api.formatNumber(_stats['total'])} 💎", LucideIcons.trendingUp, Colors.greenAccent),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, String val, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: color.withOpacity(0.1))),
        child: Row(
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(width: 24),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(val, style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                Text(label.toUpperCase(), style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTable() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        children: [
          _buildTableHeader(),
          Expanded(
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 16),
              itemCount: _transfers.length,
              itemBuilder: (context, index) => _buildTableRow(_transfers[index], index),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTableHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 20),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: const BorderRadius.vertical(top: Radius.circular(32))),
      child: Row(
        children: const [
          Expanded(flex: 2, child: Text("DATE / TIME", style: TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold))),
          Expanded(flex: 3, child: Text("HOST DETAILS", style: TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold))),
          Expanded(flex: 3, child: Text("AGENCY", style: TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold))),
          Expanded(flex: 2, child: Text("AMOUNT", style: TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold))),
          Expanded(flex: 1, child: Text("STATUS", style: TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold))),
        ],
      ),
    );
  }

  Widget _buildTableRow(Map<String, dynamic> t, int index) {
    final host = t['host'] ?? {};
    final agency = t['agency'] ?? {};
    final date = DateTime.parse(t['created_at']);

    return FadeInUp(
      delay: Duration(milliseconds: 20 * index),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
        decoration: BoxDecoration(border: Border(bottom: BorderSide(color: Colors.white.withOpacity(0.02)))),
        child: Row(
          children: [
            Expanded(
              flex: 2,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(DateFormat('MMM dd, yyyy').format(date), style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold)),
                  Text(DateFormat('hh:mm a').format(date), style: const TextStyle(color: Colors.white24, fontSize: 11)),
                ],
              ),
            ),
            Expanded(
              flex: 3,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(host['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  Text("UID: ${host['app_uid'] ?? 'N/A'}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                ],
              ),
            ),
            Expanded(
              flex: 3,
              child: Row(
                children: [
                  const Icon(LucideIcons.building2, color: Colors.white10, size: 14),
                  const SizedBox(width: 8),
                  Text(agency['name'] ?? 'Unknown Agency', style: const TextStyle(color: Colors.white70, fontSize: 13)),
                ],
              ),
            ),
            Expanded(
              flex: 2,
              child: Text("${_api.formatNumber(t['amount'])} 💎", style: GoogleFonts.robotoMono(color: Colors.greenAccent, fontWeight: FontWeight.bold)),
            ),
            Expanded(
              flex: 1,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(color: Colors.greenAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                child: const Center(child: Text("✓ SUCCESS", style: TextStyle(color: Colors.greenAccent, fontSize: 8, fontWeight: FontWeight.bold))),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
