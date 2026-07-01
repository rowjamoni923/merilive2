import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';
import 'finance/admin_withdrawals_tab.dart';
import 'finance/admin_currency_tab.dart';
import 'finance/admin_balance_deduction_tab.dart';

class AdminFinanceSystemHubScreen extends StatefulWidget {
  const AdminFinanceSystemHubScreen({super.key});

  @override
  State<AdminFinanceSystemHubScreen> createState() => _AdminFinanceSystemHubScreenState();
}

class _AdminFinanceSystemHubScreenState extends State<AdminFinanceSystemHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, dynamic> _stats = {
    'pendingWithdrawals': 0,
    'pendingPayroll': 0,
    'todayTransfers': 0,
    'pendingEpay': 0
  };

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 8, vsync: this);
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final today = DateTime.now().toIso8601String().split('T')[0];

      final results = await Future.wait([
        supa.from('agency_withdrawals').select('id', count: CountOption.exact).eq('status', 'pending'),
        supa.from('coin_transfers').select('id', count: CountOption.exact).gte('created_at', today),
        supa.from('agency_withdrawals').select('id', count: CountOption.exact).eq('status', 'pending').eq('payment_method', 'epay'),
        supa.from('payroll_orders').select('id', count: CountOption.exact).eq('status', 'pending'),
      ]);

      setState(() {
        _stats['pendingWithdrawals'] = results[0].count ?? 0;
        _stats['todayTransfers'] = results[1].count ?? 0;
        _stats['pendingEpay'] = results[2].count ?? 0;
        _stats['pendingPayroll'] = results[3].count ?? 0;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading finance stats: $e");
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
                const AdminWithdrawalsTab(),
                const Center(child: Text("Payroll Governance", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("Transfer History", style: TextStyle(color: Colors.white24))),
                const AdminCurrencyTab(),
                const AdminBalanceDeductionTab(),
                const Center(child: Text("Commission Calculator", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("Helper Messaging", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("ePay Processing", style: TextStyle(color: Colors.white24))),
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
          colors: [Colors.emeraldAccent.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.emerald, Colors.tealAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.dollarSign, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("FINANCE GOVERNANCE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Unified control for agency withdrawals, payroll, currency pricing and balance adjustments", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
          _statCard("PENDING WITHDRAWALS", _stats['pendingWithdrawals'].toString(), LucideIcons.wallet, Colors.orangeAccent),
          const SizedBox(width: 16),
          _statCard("PENDING PAYROLL", _stats['pendingPayroll'].toString(), LucideIcons.creditCard, Colors.blueAccent),
          const SizedBox(width: 16),
          _statCard("TODAY'S TRANSFERS", _stats['todayTransfers'].toString(), LucideIcons.repeat, Colors.greenAccent),
          const SizedBox(width: 16),
          _statCard("EPAY PENDING", _stats['pendingEpay'].toString(), LucideIcons.globe, Colors.purpleAccent),
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
          indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.emerald, Colors.tealAccent]), borderRadius: BorderRadius.circular(12)),
          dividerColor: Colors.transparent,
          labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
          unselectedLabelColor: Colors.white24,
          tabs: const [
            Tab(text: "WITHDRAWALS"),
            Tab(text: "PAYROLL"),
            Tab(text: "TRANSFERS"),
            Tab(text: "CURRENCY"),
            Tab(text: "DEDUCTION"),
            Tab(text: "CALCULATOR"),
            Tab(text: "HELPERS"),
            Tab(text: "EPAY"),
          ],
        ),
      ),
    );
  }
}
