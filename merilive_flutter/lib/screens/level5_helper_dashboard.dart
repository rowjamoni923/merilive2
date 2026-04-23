import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import 'package:image_picker/image_picker.dart';
import '../services/api_service.dart';

class Level5HelperDashboard extends StatefulWidget {
  const Level5HelperDashboard({super.key});

  @override
  State<Level5HelperDashboard> createState() => _Level5HelperDashboardState();
}

class _Level5HelperDashboardState extends State<Level5HelperDashboard> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  Map<String, dynamic>? _helperData;
  List<Map<String, dynamic>> _agencyWithdrawals = [];
  List<Map<String, dynamic>> _orders = [];
  List<Map<String, dynamic>> _inbox = [];
  List<Map<String, dynamic>> _methods = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
    _loadAllData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _loadAllData() async {
    setState(() => _isLoading = true);
    try {
      final me = await _api.getMyProfile();
      if (me == null) return;

      final results = await Future.wait([
        _api.getSupabase().from('topup_helpers').select().eq('user_id', me['id']).maybeSingle(),
        _api.getSupabase().from('agency_withdrawals').select('*, agency:agencies(name, agency_code, logo_url)').inFilter('status', ['pending', 'processing']).order('requested_at'),
        _api.getSupabase().from('helper_orders').select('*, user:profiles(display_name, avatar_url, app_uid)').order('created_at', ascending: false).limit(20),
        _api.getSupabase().from('helper_admin_messages').select().order('created_at', ascending: false).limit(10),
        _api.getSupabase().from('helper_country_payment_methods').select().eq('user_id', me['id']),
      ]);

      if (mounted) {
        setState(() {
          _helperData = results[0];
          _agencyWithdrawals = List<Map<String, dynamic>>.from(results[1]);
          _orders = List<Map<String, dynamic>>.from(results[2]);
          _inbox = List<Map<String, dynamic>>.from(results[3]);
          _methods = List<Map<String, dynamic>>.from(results[4]);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("L5 Dashboard Load Error: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Color(0xFF0F172A), body: Center(child: CircularProgressIndicator(color: Colors.cyanAccent)));
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                _buildStatsHero(),
                _buildTabBar(),
                Expanded(
                  child: TabBarView(
                    controller: _tabController,
                    children: [
                      _buildAgencyWithdrawalsTab(),
                      _buildWalletBreakdownTab(),
                      _buildOrdersTab(),
                      _buildMethodsTab(),
                      _buildHistoryTab(),
                      _buildInboxTab(),
                    ],
                  ),
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
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Supervisor Dashboard", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                Row(
                  children: [
                    Container(width: 8, height: 8, decoration: const BoxDecoration(color: Colors.greenAccent, shape: BoxShape.circle)),
                    const SizedBox(width: 6),
                    Text("Payroll System Online", style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 11)),
                  ],
                ),
              ],
            ),
          ),
          IconButton(icon: const Icon(LucideIcons.refreshCw, color: Colors.white38, size: 20), onPressed: _loadAllData),
        ],
      ),
    );
  }

  Widget _buildStatsHero() {
    final int totalDiamonds = (_helperData?['wallet_balance'] ?? 0) + (_helperData?['level1_balance'] ?? 0) + (_helperData?['level2_balance'] ?? 0) + (_helperData?['level3_balance'] ?? 0) + (_helperData?['level4_balance'] ?? 0) + (_helperData?['exchange_balance'] ?? 0);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF06B6D4), Color(0xFF3B82F6)], begin: Alignment.topLeft, end: Alignment.bottomRight),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [BoxShadow(color: Colors.cyan.withOpacity(0.3), blurRadius: 20, offset: const Offset(0, 10))],
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("TOTAL TRADER ASSETS", style: TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
                  const SizedBox(height: 4),
                  Text(NumberFormat('#,###').format(totalDiamonds), style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                ],
              ),
              const Icon(LucideIcons.shieldCheck, color: Colors.white, size: 40),
            ],
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              Expanded(child: _buildMiniStat("Claims", "${_agencyWithdrawals.length}", LucideIcons.downloadCloud)),
              Container(width: 1, height: 20, color: Colors.white24),
              Expanded(child: _buildMiniStat("Orders", "${_orders.length}", LucideIcons.shoppingBag)),
              Container(width: 1, height: 20, color: Colors.white24),
              Expanded(child: _buildMiniStat("Profit", "12.5%", LucideIcons.trendingUp)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMiniStat(String label, String val, IconData icon) {
    return Column(
      children: [
        Icon(icon, color: Colors.white70, size: 14),
        const SizedBox(height: 4),
        Text(val, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
        Text(label, style: const TextStyle(color: Colors.white60, fontSize: 9)),
      ],
    );
  }

  Widget _buildTabBar() {
    return TabBar(
      controller: _tabController,
      isScrollable: true,
      indicatorColor: Colors.cyanAccent,
      indicatorWeight: 3,
      labelColor: Colors.white,
      unselectedLabelColor: Colors.white38,
      labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
      tabs: const [
        Tab(text: "WITHDRAWALS"),
        Tab(text: "WALLET"),
        Tab(text: "ORDERS"),
        Tab(text: "METHODS"),
        Tab(text: "HISTORY"),
        Tab(text: "NOTICES"),
      ],
    );
  }

  Widget _buildAgencyWithdrawalsTab() {
    if (_agencyWithdrawals.isEmpty) return _buildEmptyState("No pending claims", LucideIcons.inbox);
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: _agencyWithdrawals.length,
      itemBuilder: (context, index) {
        final w = _agencyWithdrawals[index];
        final agency = w['agency'];
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white10)),
          child: Row(
            children: [
              CircleAvatar(radius: 24, backgroundImage: NetworkImage(agency?['logo_url'] ?? ''), backgroundColor: Colors.white10),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(agency?['name'] ?? 'Agency', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text("${NumberFormat('#,###').format(w['beans_amount'])} Beans", style: const TextStyle(color: Colors.cyanAccent, fontSize: 13, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              ElevatedButton(
                onPressed: () => _handleClaim(w['id']),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.white, foregroundColor: Colors.black, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                child: const Text("CLAIM", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildWalletBreakdownTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: [
          _buildWalletRow("Main Balance", _helperData?['wallet_balance'] ?? 0, LucideIcons.wallet, Colors.cyanAccent),
          _buildWalletRow("Exchange Bucket", _helperData?['exchange_balance'] ?? 0, LucideIcons.refreshCw, Colors.amberAccent),
          _buildWalletRow("Level 1 Assets", _helperData?['level1_balance'] ?? 0, LucideIcons.user, Colors.orangeAccent),
          _buildWalletRow("Level 2 Assets", _helperData?['level2_balance'] ?? 0, LucideIcons.users, Colors.purpleAccent),
          _buildWalletRow("Level 3 Assets", _helperData?['level3_balance'] ?? 0, LucideIcons.userPlus, Colors.blueAccent),
          _buildWalletRow("Level 4 Assets", _helperData?['level4_balance'] ?? 0, LucideIcons.shield, Colors.greenAccent),
        ],
      ),
    );
  }

  Widget _buildWalletRow(String label, int val, IconData icon, Color color) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white10)),
      child: Row(
        children: [
          Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle), child: Icon(icon, color: color, size: 18)),
          const SizedBox(width: 16),
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.w500)),
          const Spacer(),
          Text(NumberFormat('#,###').format(val), style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildOrdersTab() {
    if (_orders.isEmpty) return _buildEmptyState("No recent orders", LucideIcons.shoppingCart);
    return ListView.builder(
      padding: const EdgeInsets.all(20),
      itemCount: _orders.length,
      itemBuilder: (context, index) {
        final order = _orders[index];
        final user = order['user'];
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(24)),
          child: Row(
            children: [
              CircleAvatar(radius: 20, backgroundImage: NetworkImage(user?['avatar_url'] ?? ''), backgroundColor: Colors.white10),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user?['display_name'] ?? 'User', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text("Order #${order['id'].toString().substring(0, 8)}", style: const TextStyle(color: Colors.white38, fontSize: 10)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text("+${NumberFormat('#,###').format(order['diamond_amount'])}", style: const TextStyle(color: Colors.greenAccent, fontWeight: FontWeight.bold)),
                  Text(order['status'].toUpperCase(), style: TextStyle(color: order['status'] == 'pending' ? Colors.amber : Colors.green, fontSize: 9, fontWeight: FontWeight.bold)),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildMethodsTab() {
    return _buildEmptyState("Payment methods linked", LucideIcons.creditCard);
  }

  Widget _buildHistoryTab() {
    return _buildEmptyState("Transaction history", LucideIcons.history);
  }

  Widget _buildInboxTab() {
    return _buildEmptyState("System notifications", LucideIcons.bell);
  }

  Widget _buildEmptyState(String msg, IconData icon) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, color: Colors.white12, size: 48),
          const SizedBox(height: 16),
          Text(msg, style: const TextStyle(color: Colors.white24, fontSize: 14)),
        ],
      ),
    );
  }

  Future<void> _handleClaim(String withdrawalId) async {
    final supa = _api.getSupabase();
    try {
      final res = await supa.rpc('claim_agency_withdrawal', params: {'_withdrawal_id': withdrawalId, '_helper_id': _helperData?['id']});
      if (res['success'] == true) {
        _showSuccess("Claimed Successfully!");
        _loadAllData();
      } else {
        _showError(res['error'] ?? "Claim failed");
      }
    } catch (e) {
      _showError(e.toString());
    }
  }

  void _showError(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.redAccent));
  }

  void _showSuccess(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.greenAccent));
  }
}
