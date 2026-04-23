import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';
import 'traders/admin_traders_tab.dart';
import 'finance/admin_currency_tab.dart'; // Reuse currency tab

class AdminDiamondTraderHubScreen extends StatefulWidget {
  const AdminDiamondTraderHubScreen({super.key});

  @override
  State<AdminDiamondTraderHubScreen> createState() => _AdminDiamondTraderHubScreenState();
}

class _AdminDiamondTraderHubScreenState extends State<AdminDiamondTraderHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, dynamic> _stats = {
    'activeHelpers': 0,
    'pendingOrders': 0,
    'todayTransactions': 0,
    'paymentMethods': 0
  };

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 6, vsync: this);
    _loadStats();
  }

  Future<void> _loadStats() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final today = DateTime.now().toIso8601String().split('T')[0];

      final results = await Future.wait([
        supa.from('topup_helpers').select('id', count: CountOption.exact).eq('is_active', true).eq('is_verified', true),
        supa.from('helper_orders').select('id', count: CountOption.exact).eq('status', 'pending'),
        supa.from('helper_transactions').select('id', count: CountOption.exact).gte('created_at', today),
        supa.from('topup_payment_methods').select('id', count: CountOption.exact).eq('is_active', true),
      ]);

      if (mounted) {
        setState(() {
          _stats['activeHelpers'] = results[0].count ?? 0;
          _stats['pendingOrders'] = results[1].count ?? 0;
          _stats['todayTransactions'] = results[2].count ?? 0;
          _stats['paymentMethods'] = results[3].count ?? 0;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Error loading trader stats: $e");
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
                const AdminTradersTab(),
                const Center(child: Text("Trader Orders", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("Trader Transactions", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("Payment Methods", style: TextStyle(color: Colors.white24))),
                const Center(child: Text("Manual Topup", style: TextStyle(color: Colors.white24))),
                const AdminCurrencyTab(), // Packages/Pricing
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
          colors: [Colors.amberAccent.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          FadeInLeft(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.amber, Colors.orangeAccent]), borderRadius: BorderRadius.circular(16)),
              child: const Icon(LucideIcons.coins, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(width: 24),
          FadeInDown(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("DIAMOND TRADER HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                const Text("Centralized governance for traders, orders, and payment infrastructure", style: TextStyle(color: Colors.white24, fontSize: 13)),
              ],
            ),
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
          _statCard("ACTIVE HELPERS", _stats['activeHelpers'].toString(), LucideIcons.users, Colors.greenAccent),
          const SizedBox(width: 16),
          _statCard("PENDING ORDERS", _stats['pendingOrders'].toString(), LucideIcons.package, Colors.yellowAccent),
          const SizedBox(width: 16),
          _statCard("TODAY'S TXNS", _stats['todayTransactions'].toString(), LucideIcons.activity, Colors.blueAccent),
          const SizedBox(width: 16),
          _statCard("PAYMENT METHODS", _stats['paymentMethods'].toString(), LucideIcons.creditCard, Colors.purpleAccent),
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
      child: TabBar(
        controller: _tabController,
        isScrollable: true,
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.amber, Colors.orangeAccent]), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "TRADERS"),
          Tab(text: "ORDERS"),
          Tab(text: "TRANSACTIONS"),
          Tab(text: "PAYMENT METHODS"),
          Tab(text: "MANUAL TOPUP"),
          Tab(text: "PACKAGES"),
        ],
      ),
    );
  }
}
