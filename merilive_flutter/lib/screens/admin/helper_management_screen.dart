import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class HelperManagementScreen extends StatefulWidget {
  const HelperManagementScreen({super.key});

  @override
  State<HelperManagementScreen> createState() => _HelperManagementScreenState();
}

class _HelperManagementScreenState extends State<HelperManagementScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  List<Map<String, dynamic>> _traders = [];
  List<Map<String, dynamic>> _applications = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final traders = await _api.getSupabase()
          .from('topup_helpers')
          .select('*, user:profiles(*)')
          .order('joined_at', ascending: false);
      
      final apps = await _api.getHelperApplications();

      setState(() {
        _traders = List<Map<String, dynamic>>.from(traders);
        _applications = apps;
      });
    } catch (e) {
      debugPrint("Helper load error: $e");
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _handleApprove(String appId, String userId) async {
    final res = await _api.updateHelperApplicationStatus(appId, 'approved', userId);
    if (res['success']) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Application Approved!")));
      _loadData();
    }
  }

  Future<void> _handleReject(String appId, String userId) async {
    final res = await _api.updateHelperApplicationStatus(appId, 'rejected', userId);
    if (res['success']) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Application Rejected")));
      _loadData();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));

    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 32),
          _buildTabs(),
          const SizedBox(height: 24),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildTraderList(),
                _buildHelperApplications(),
                _buildDiamondPricing(),
              ],
            ),
          ),
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
            Text("HELPER & TRADER MASTERY", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
            const Text("Manage diamond traders, helper requests, and special diamond rates", style: TextStyle(color: Colors.white38, fontSize: 13)),
          ],
        ),
        _buildActionBtn("ADD NEW TRADER", LucideIcons.userPlus, const Color(0xFF6366F1)),
      ],
    );
  }

  Widget _buildActionBtn(String label, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          Icon(icon, color: Colors.white, size: 16),
          const SizedBox(width: 8),
          Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      width: 600,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white70)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: const Color(0xFF6366F1), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
        unselectedLabelColor: Colors.white24,
        tabs: const [Tab(text: "Traders"), Tab(text: "Helper Apps"), Tab(text: "Pricing")],
      ),
    );
  }

  Widget _buildTraderList() {
    if (_traders.isEmpty) return _buildEmptyState("No active traders found");

    return ListView.builder(
      itemCount: _traders.length,
      itemBuilder: (context, index) {
        final t = _traders[index];
        final user = t['user'];
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.1))),
            child: Row(
              children: [
                CircleAvatar(radius: 24, backgroundImage: NetworkImage(user?['avatar_url'] ?? ''), backgroundColor: Colors.white12),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user?['display_name'] ?? "Unknown Trader", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                      Text("Stock: ${NumberFormat('#,###').format(t['wallet_balance'] ?? 0)} 💎 \u2022 Level: ${t['trader_level']}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                    ],
                  ),
                ),
                _buildActionIcon(LucideIcons.edit3),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildHelperApplications() {
    if (_applications.isEmpty) return _buildEmptyState("No pending applications");

    return ListView.builder(
      itemCount: _applications.length,
      itemBuilder: (context, index) {
        final app = _applications[index];
        final user = app['user'];
        return FadeInUp(
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.orangeAccent.withOpacity(0.1))),
            child: Row(
              children: [
                CircleAvatar(radius: 24, backgroundImage: NetworkImage(user?['avatar_url'] ?? ''), backgroundColor: Colors.white12),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start, 
                    children: [
                      Text(user?['display_name'] ?? "Unknown User", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)), 
                      Text("Requesting '${app['requested_level'] ?? 'L5 Helper'}' Status", style: const TextStyle(color: Colors.white38, fontSize: 12))
                    ]
                  )
                ),
                Row(
                  children: [
                    _buildMiniActionBtn("REJECT", Colors.redAccent, () => _handleReject(app['id'], app['user_id'])),
                    const SizedBox(width: 8),
                    _buildMiniActionBtn("APPROVE", Colors.greenAccent, () => _handleApprove(app['id'], app['user_id'])),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildDiamondPricing() {
    return const Center(child: Text("Influencer Diamond Pricing Mastery - Parity Pending", style: TextStyle(color: Colors.white24)));
  }

  Widget _buildActionIcon(IconData icon) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
      child: Icon(icon, color: Colors.white38, size: 18),
    );
  }

  Widget _buildMiniActionBtn(String label, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.3))),
        child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildEmptyState(String msg) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(LucideIcons.inbox, color: Colors.white10, size: 64),
          const SizedBox(height: 16),
          Text(msg, style: const TextStyle(color: Colors.white24, fontSize: 14)),
        ],
      ),
    );
  }
}


