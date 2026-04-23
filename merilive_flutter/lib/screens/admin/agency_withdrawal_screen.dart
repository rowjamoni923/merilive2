import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AgencyWithdrawalScreen extends StatefulWidget {
  const AgencyWithdrawalScreen({super.key});

  @override
  State<AgencyWithdrawalScreen> createState() => _AgencyWithdrawalScreenState();
}

class _AgencyWithdrawalScreenState extends State<AgencyWithdrawalScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  bool _isLoading = true;
  List<Map<String, dynamic>> _withdrawals = [];
  Map<String, int> _counts = {'pending': 0, 'approved': 0, 'rejected': 0};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadWithdrawals();
  }

  Future<void> _loadWithdrawals() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('agency_withdrawals').select('''
        *,
        agency:agencies(id, name, agency_code, owner_id)
      ''').order('requested_at', ascending: false).limit(100);
      
      final data = List<Map<String, dynamic>>.from(res);
      setState(() {
        _withdrawals = data;
        _counts = {
          'pending': data.where((w) => w['status'] == 'pending').length,
          'approved': data.where((w) => w['status'] == 'approved' || w['status'] == 'completed').length,
          'rejected': data.where((w) => w['status'] == 'rejected').length,
        };
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading withdrawals: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _processWithdrawal(String id, String status) async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      await supa.rpc('admin_process_withdrawal', params: {
        '_withdrawal_id': id,
        '_status': status,
        '_notes': "Processed via Admin App"
      });
      _loadWithdrawals();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Withdrawal $status successfully! ✅")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 32),
          _buildStatsRow(),
          const SizedBox(height: 32),
          _buildTabs(),
          const SizedBox(height: 32),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildWithdrawalList('all'),
                _buildWithdrawalList('pending'),
                _buildWithdrawalList('approved'),
                _buildWithdrawalList('rejected'),
              ],
            ),
          ),
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
              Text("AGENCY SETTLEMENTS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              const Text("Review and approve agency Bean-to-Cash withdrawal requests", style: TextStyle(color: Colors.white38, fontSize: 14)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: _loadWithdrawals,
            icon: const Icon(LucideIcons.refreshCw, size: 16),
            label: const Text("REFRESH AUDIT"),
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
          _buildStatCard("Pending Requests", _counts['pending']!, Colors.amberAccent),
          const SizedBox(width: 16),
          _buildStatCard("Completed Today", _counts['approved']!, Colors.greenAccent),
          const SizedBox(width: 16),
          _buildStatCard("Rejected", _counts['rejected']!, Colors.redAccent),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, int count, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.1))),
        child: Column(
          children: [
            Text(count.toString(), style: GoogleFonts.outfit(color: color, fontSize: 24, fontWeight: FontWeight.bold)),
            Text(label.toUpperCase(), style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
          ],
        ),
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: const Color(0xFF6366F1), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13),
        unselectedLabelColor: Colors.white24,
        tabs: const [Tab(text: "All Requests"), Tab(text: "Pending"), Tab(text: "Completed"), Tab(text: "Rejected")],
      ),
    );
  }

  Widget _buildWithdrawalList(String status) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    final filtered = status == 'all' ? _withdrawals : _withdrawals.where((w) {
      if (status == 'approved') return w['status'] == 'approved' || w['status'] == 'completed';
      return w['status'] == status;
    }).toList();

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final withdrawal = filtered[index];
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: _buildWithdrawalCard(withdrawal),
        );
      },
    );
  }

  Widget _buildWithdrawalCard(Map<String, dynamic> w) {
    final status = w['status'].toString().toUpperCase();
    final Color statusColor = status == 'PENDING' ? Colors.amberAccent : (status == 'APPROVED' || status == 'COMPLETED' ? Colors.greenAccent : Colors.redAccent);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        children: [
          _buildAgencyAvatar(w['agency']),
          const SizedBox(width: 24),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(w['agency']?['name'] ?? 'Unknown Agency', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                Text("CODE: ${w['agency']?['agency_code'] ?? 'N/A'} \u2022 METHOD: ${w['payment_method']}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text("${_api.formatNumber(w['amount'])} Beans", style: GoogleFonts.outfit(color: Colors.amberAccent, fontSize: 20, fontWeight: FontWeight.bold)),
              Text("\$${_api.formatNumber(w['amount'] / 10000)} USD", style: const TextStyle(color: Colors.white38, fontSize: 12)),
            ],
          ),
          const SizedBox(width: 32),
          _buildStatusBadge(status, statusColor),
          const SizedBox(width: 24),
          if (status == 'PENDING') _buildActionButtons(w),
        ],
      ),
    );
  }

  Widget _buildAgencyAvatar(dynamic agency) {
    return Container(
      width: 56,
      height: 56,
      decoration: BoxDecoration(color: const Color(0xFF6366F1).withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
      child: const Icon(LucideIcons.building2, color: Color(0xFF6366F1)),
    );
  }

  Widget _buildStatusBadge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.2))),
      child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildActionButtons(Map<String, dynamic> w) {
    return Row(
      children: [
        _buildCircleBtn(LucideIcons.check, Colors.greenAccent, () => _processWithdrawal(w['id'], 'approved')),
        const SizedBox(width: 12),
        _buildCircleBtn(LucideIcons.x, Colors.redAccent, () => _processWithdrawal(w['id'], 'rejected')),
      ],
    );
  }

  Widget _buildCircleBtn(IconData icon, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle, border: Border.all(color: color.withOpacity(0.2))),
        child: Icon(icon, color: color, size: 16),
      ),
    );
  }
}
