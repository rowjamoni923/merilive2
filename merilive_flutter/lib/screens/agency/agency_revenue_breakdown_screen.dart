import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';

class AgencyRevenueBreakdownScreen extends StatefulWidget {
  const AgencyRevenueBreakdownScreen({super.key});

  @override
  State<AgencyRevenueBreakdownScreen> createState() => _AgencyRevenueBreakdownScreenState();
}

class _AgencyRevenueBreakdownScreenState extends State<AgencyRevenueBreakdownScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _breakdown = [];
  Map<String, dynamic> _summary = {
    'total_comm': 0,
    'host_share': 0,
    'sub_agent_share': 0,
  };

  @override
  void initState() {
    super.initState();
    _loadBreakdown();
  }

  Future<void> _loadBreakdown() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      final agencyId = profile?['agency_id'];
      if (agencyId != null) {
        final transactions = await _api.getSupabase()
            .from('agency_transactions')
            .select('*, sender:profiles(display_name, avatar_url, app_uid)')
            .eq('agency_id', agencyId)
            .order('created_at', ascending: false)
            .limit(50);
        
        setState(() {
          _breakdown = List<Map<String, dynamic>>.from(transactions);
          _summary['total_comm'] = _breakdown.fold(0, (sum, e) => sum + ((e['amount'] ?? 0) as num).toInt());
          _summary['host_share'] = (_summary['total_comm'] * 0.7).toInt();
          _summary['sub_agent_share'] = (_summary['total_comm'] * 0.1).toInt();
        });
      }
    } catch (e) {
      debugPrint("Parity Breakdown Error: $e");
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
                    ? const Center(child: CircularProgressIndicator(color: Colors.pinkAccent))
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
              Text("Revenue Breakdown", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              Text("Master Copy • Financial Settlements", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
            ],
          ),
          const Spacer(),
          IconButton(icon: const Icon(LucideIcons.fileSpreadsheet, color: Colors.white24, size: 18), onPressed: _loadBreakdown),
        ],
      ),
    );
  }

  Widget _buildContent() {
    return Column(
      children: [
        _buildSummaryHeader(),
        const SizedBox(height: 24),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("DETAILED LEDGER", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1.5)),
              const Icon(LucideIcons.filter, color: Colors.white24, size: 14),
            ],
          ),
        ),
        Expanded(
          child: _breakdown.isEmpty 
            ? _buildEmptyState()
            : ListView.builder(
                padding: const EdgeInsets.all(24),
                physics: const BouncingScrollPhysics(),
                itemCount: _breakdown.length,
                itemBuilder: (context, index) => FadeInUp(
                  delay: Duration(milliseconds: 30 * (index % 10)),
                  child: _buildTransactionTile(_breakdown[index]),
                ),
              ),
        ),
      ],
    );
  }

  Widget _buildSummaryHeader() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFA855F7)]),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [BoxShadow(color: Colors.indigo.withOpacity(0.3), blurRadius: 40, offset: const Offset(0, 10))],
      ),
      child: Column(
        children: [
          Text("SETTLED REVENUE (7D)", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
          const SizedBox(height: 12),
          Text(_api.formatNumber(_summary['total_comm']), style: GoogleFonts.outfit(color: Colors.white, fontSize: 36, fontWeight: FontWeight.w900)),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _buildMiniSummary("Hosts Share", "70%", Colors.greenAccent),
              _buildMiniSummary("Sub-Agents", "10%", Colors.amberAccent),
              _buildMiniSummary("Net Profit", "20%", Colors.cyanAccent),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMiniSummary(String label, String percent, Color color) {
    return Column(
      children: [
        Text(percent, style: GoogleFonts.outfit(color: color, fontWeight: FontWeight.w900, fontSize: 16)),
        Text(label, style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 9, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.helpCircle, color: Colors.white10, size: 64),
          const SizedBox(height: 16),
          Text("No settlements found", style: TextStyle(color: Colors.white.withOpacity(0.2))),
        ],
      ),
    );
  }

  Widget _buildTransactionTile(Map<String, dynamic> tx) {
    final sender = tx['sender'] ?? {};
    final amount = tx['amount'] ?? 0;
    final type = tx['type'] ?? 'income';
    final date = DateTime.tryParse(tx['created_at'] ?? '') ?? DateTime.now();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(2),
            decoration: const BoxDecoration(color: Colors.cyanAccent, shape: BoxShape.circle),
            child: CircleAvatar(radius: 20, backgroundImage: sender['avatar_url'] != null ? NetworkImage(sender['avatar_url']) : null, backgroundColor: const Color(0xFF1E293B)),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(sender['display_name'] ?? "System Settlement", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
                Text(DateFormat('MMM dd • hh:mm a').format(date), style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 10)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text("+${_api.formatNumber(amount)}", style: GoogleFonts.outfit(color: Colors.greenAccent, fontWeight: FontWeight.w900, fontSize: 16)),
              Text(type.toUpperCase(), style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 8, fontWeight: FontWeight.bold)),
            ],
          ),
        ],
      ),
    );
  }
}


