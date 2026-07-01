import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminTopupSystemScreen extends StatefulWidget {
  const AdminTopupSystemScreen({super.key});

  @override
  State<AdminTopupSystemScreen> createState() => _AdminTopupSystemScreenState();
}

class _AdminTopupSystemScreenState extends State<AdminTopupSystemScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  
  // State variables for various tabs
  List<Map<String, dynamic>> _helpers = [];
  List<Map<String, dynamic>> _orders = [];
  List<Map<String, dynamic>> _tiers = [];
  String _manualSearchQuery = "";
  List<Map<String, dynamic>> _searchResults = [];
  Map<String, dynamic>? _selectedUser;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadAllData();
  }

  Future<void> _loadAllData() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      // Load Helpers, Orders, and Tiers in parallel
      final results = await Future.wait([
        supa.from('topup_helpers').select('*, user:profiles(display_name, avatar_url, app_uid)').order('created_at', ascending: false),
        supa.from('helper_orders').select('*, user:profiles(display_name, avatar_url), helper:topup_helpers(user:profiles(display_name))').order('created_at', ascending: false).limit(50),
        supa.from('trader_level_tiers').select('*').order('level_number', ascending: true),
      ]);

      setState(() {
        _helpers = List<Map<String, dynamic>>.from(results[0].data);
        _orders = List<Map<String, dynamic>>.from(results[1].data);
        _tiers = List<Map<String, dynamic>>.from(results[2].data);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading topup data: $e");
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
          _buildTabs(),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.amberAccent))
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildManualTopupTab(),
                    _buildTradersTab(),
                    _buildOrdersTab(),
                    _buildTiersTab(),
                  ],
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
        gradient: const LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFD97706), Color(0xFFB45309)]),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [BoxShadow(color: Colors.amber.withOpacity(0.2), blurRadius: 40, offset: const Offset(0, 20))],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.diamond, color: Colors.white, size: 32),
                  const SizedBox(width: 20),
                  Text("DIAMONDS & TRADERS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                ],
              ),
              const Text("Platform injection system, trader governance and financial audit", style: TextStyle(color: Colors.white70)),
            ],
          ),
          _buildQuickStats(),
        ],
      ),
    );
  }

  Widget _buildQuickStats() {
    return Row(
      children: [
        _miniStat("TRADERS", _helpers.length.toString()),
        const SizedBox(width: 16),
        _miniStat("PENDING", _orders.where((o) => o['status'] == 'pending').length.toString()),
      ],
    );
  }

  Widget _miniStat(String label, String val) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
      child: Column(
        children: [
          Text(val, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
          Text(label, style: const TextStyle(color: Colors.white70, fontSize: 8, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      child: TabBar(
        controller: _tabController,
        indicatorColor: Colors.amberAccent,
        indicatorWeight: 4,
        dividerColor: Colors.white.withOpacity(0.05),
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "MANUAL TOPUP"),
          Tab(text: "TRADER HUB"),
          Tab(text: "ORDERS & LOGS"),
          Tab(text: "LEVEL TIERS"),
        ],
      ),
    );
  }

  // --- TAB 1: MANUAL TOPUP ---
  Widget _buildManualTopupTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          Container(
            padding: const EdgeInsets.all(48),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Column(
              children: [
                const Icon(LucideIcons.search, color: Colors.amberAccent, size: 48),
                const SizedBox(height: 24),
                Text("USER INJECTION", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
                const Text("Find a user by UID or Name to manually inject diamonds", style: TextStyle(color: Colors.white24)),
                const SizedBox(height: 32),
                _buildManualSearchBar(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildManualSearchBar() {
    return Container(
      height: 72,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      decoration: BoxDecoration(color: Colors.black, borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.amberAccent.withOpacity(0.2))),
      child: Row(
        children: [
          const Icon(LucideIcons.search, color: Colors.amberAccent, size: 20),
          const SizedBox(width: 16),
          Expanded(child: TextField(style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "Enter User UID or Display Name...", hintStyle: TextStyle(color: Colors.white10), border: InputBorder.none), onChanged: (v) => _manualSearchQuery = v)),
          ElevatedButton(onPressed: () => _performUserSearch(), style: ElevatedButton.styleFrom(backgroundColor: Colors.amberAccent, foregroundColor: Colors.black, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))), child: const Text("SEARCH")),
        ],
      ),
    );
  }

  // --- TAB 2: TRADERS HUB ---
  Widget _buildTradersTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(32),
      itemCount: _helpers.length,
      itemBuilder: (context, index) {
        final h = _helpers[index];
        final user = h['user'] ?? {};
        final int level = h['trader_level'] ?? 1;
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Row(
              children: [
                CircleAvatar(backgroundImage: NetworkImage(user['avatar_url'] ?? ''), radius: 24),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      Row(
                        children: [
                          Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: Colors.amberAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(4)), child: Text("LVL $level", style: const TextStyle(color: Colors.amberAccent, fontSize: 8, fontWeight: FontWeight.bold))),
                          const SizedBox(width: 8),
                          Text("UID: ${user['app_uid']}", style: const TextStyle(color: Colors.white24, fontSize: 10)),
                        ],
                      ),
                    ],
                  ),
                ),
                _helperStat("WALLET", h['wallet_balance'].toString()),
                const SizedBox(width: 32),
                _helperStat("TOTAL SOLD", h['total_sold'].toString()),
                const SizedBox(width: 32),
                Row(
                  children: [
                    _actionBtn(LucideIcons.plusCircle, Colors.blueAccent, () {}),
                    const SizedBox(width: 8),
                    _actionBtn(LucideIcons.arrowUpCircle, Colors.purpleAccent, () {}),
                    const SizedBox(width: 8),
                    _actionBtn(h['is_active'] ? LucideIcons.power : LucideIcons.play, h['is_active'] ? Colors.redAccent : Colors.greenAccent, () {}),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _helperStat(String label, String val) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Text(val, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 8, fontWeight: FontWeight.bold)),
      ],
    );
  }

  // --- TAB 3: ORDERS ---
  Widget _buildOrdersTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(32),
      itemCount: _orders.length,
      itemBuilder: (context, index) {
        final o = _orders[index];
        final user = o['user'] ?? {};
        final helperName = o['helper']?['user']?['display_name'] ?? 'System';
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              const Icon(LucideIcons.shoppingBag, color: Colors.white10, size: 16),
              const SizedBox(width: 16),
              Expanded(child: Text("${user['display_name']} bought ${o['coin_amount']} 💎 from $helperName", style: const TextStyle(color: Colors.white70, fontSize: 12))),
              Text(DateFormat('hh:mm a').format(DateTime.parse(o['created_at'])), style: const TextStyle(color: Colors.white10, fontSize: 10)),
              const SizedBox(width: 16),
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.greenAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(6)), child: Text(o['status'].toString().toUpperCase(), style: const TextStyle(color: Colors.greenAccent, fontSize: 8, fontWeight: FontWeight.bold))),
            ],
          ),
        );
      },
    );
  }

  // --- TAB 4: LEVEL TIERS ---
  Widget _buildTiersTab() {
    return GridView.builder(
      padding: const EdgeInsets.all(32),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 1.5),
      itemCount: _tiers.length,
      itemBuilder: (context, index) {
        final t = _tiers[index];
        return Container(
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(t['level_name'].toString().toUpperCase(), style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.w900, fontSize: 18)),
                  const Icon(LucideIcons.edit3, color: Colors.white24, size: 14),
                ],
              ),
              const Spacer(),
              _tierLine("UPGRADE COST", "\$${t['upgrade_cost_usd']}"),
              _tierLine("COMMISSION", "${t['commission_rate']}%"),
              _tierLine("DAILY LIMIT", "\$${t['max_withdrawal_amount']}"),
            ],
          ),
        );
      },
    );
  }

  Widget _tierLine(String label, String val) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold)),
          Text(val, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _actionBtn(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withOpacity(0.2))),
        child: Icon(icon, color: color, size: 14),
      ),
    );
  }

  void _performUserSearch() async {
    // Search logic for manual topup
  }
}
