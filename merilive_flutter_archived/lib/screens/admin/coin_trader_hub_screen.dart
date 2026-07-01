import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class CoinTraderHubScreen extends StatefulWidget {
  const CoinTraderHubScreen({super.key});

  @override
  State<CoinTraderHubScreen> createState() => _CoinTraderHubScreenState();
}

class _CoinTraderHubScreenState extends State<CoinTraderHubScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  bool _isLoading = true;
  List<Map<String, dynamic>> _traders = [];
  List<Map<String, dynamic>> _transactions = [];
  Map<String, dynamic> _stats = {'total': 0, 'active': 0, 'liquidity': 0};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      // Fetch Traders with Profile data
      final tradersRes = await supa.from('topup_helpers').select('''
        *,
        user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid)
      ''').order('created_at', ascending: false);
      
      // Fetch Recent Transactions
      final txRes = await supa.from('helper_transactions').select('''
        *,
        helper:topup_helpers(id, user_id, user:profiles!topup_helpers_user_id_fkey(display_name))
      ''').order('created_at', ascending: false).limit(50);

      final traders = List<Map<String, dynamic>>.from(tradersRes);
      
      setState(() {
        _traders = traders;
        _transactions = List<Map<String, dynamic>>.from(txRes);
        _stats = {
          'total': traders.length,
          'active': traders.where((t) => t['is_active'] == true).length,
          'liquidity': traders.fold(0, (sum, t) => sum + (t['wallet_balance'] ?? 0)),
        };
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading trader data: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _toggleTraderStatus(String id, bool currentStatus) async {
    try {
      final supa = _api.getSupabase();
      await supa.from('topup_helpers').update({'is_active': !currentStatus}).eq('id', id);
      _loadData();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Trader status updated! 🔄")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        children: [
          _buildHeader(),
          _buildStatsStrip(),
          const SizedBox(height: 32),
          _buildTabs(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildTraderList(),
                _buildTransactionList(),
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
              Text("DIAMOND TRADER HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              const Text("Manage Level 5 diamond liquidity, trader wallets, and sale records", style: TextStyle(color: Colors.white38, fontSize: 14)),
            ],
          ),
          Row(
            children: [
              _buildHeaderBtn(LucideIcons.plus, "ADD TRADER", const Color(0xFF6366F1), () {}),
              const SizedBox(width: 12),
              _buildHeaderBtn(LucideIcons.send, "BULK TRANSFER", Colors.white10, () {}),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildHeaderBtn(IconData icon, String label, Color color, VoidCallback onTap) {
    return ElevatedButton.icon(
      onPressed: onTap,
      icon: Icon(icon, size: 16),
      label: Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
      style: ElevatedButton.styleFrom(backgroundColor: color, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
    );
  }

  Widget _buildStatsStrip() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        children: [
          _buildStatItem("Active Traders", _stats['active'].toString(), LucideIcons.users, Colors.greenAccent),
          _buildStatItem("Global Liquidity", "${_api.formatNumber(_stats['liquidity'])} 💎", LucideIcons.wallet, Colors.amberAccent),
          _buildStatItem("Total Payouts", "\$42,800", LucideIcons.creditCard, Colors.blueAccent),
        ],
      ),
    );
  }

  Widget _buildStatItem(String label, String val, IconData icon, Color color) {
    return Expanded(
      child: Container(
        margin: const EdgeInsets.only(right: 16),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
        child: Row(
          children: [
            Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: color, size: 20)),
            const SizedBox(width: 20),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(val, style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                Text(label, style: const TextStyle(color: Colors.white24, fontSize: 11, fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      child: TabBar(
        controller: _tabController,
        indicatorColor: const Color(0xFF6366F1),
        indicatorWeight: 4,
        dividerColor: Colors.white.withOpacity(0.05),
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white24,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 14),
        tabs: const [Tab(text: "MANAGED TRADERS"), Tab(text: "TRANSACTION LEDGER")],
      ),
    );
  }

  Widget _buildTraderList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    return ListView.builder(
      padding: const EdgeInsets.all(32),
      itemCount: _traders.length,
      itemBuilder: (context, index) {
        final t = _traders[index];
        final profile = t['user'] ?? {};
        final bool isActive = t['is_active'] ?? false;
        final int balance = t['wallet_balance'] ?? 0;

        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Row(
              children: [
                CircleAvatar(radius: 28, backgroundImage: profile['avatar_url'] != null ? CachedNetworkImageProvider(profile['avatar_url']) : null, backgroundColor: Colors.white10),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(profile['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                      Text("ID: ${profile['app_uid'] ?? 'N/A'} \u2022 Level ${t['trader_level'] ?? 1}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
                    ],
                  ),
                ),
                _buildBalancePill(balance),
                const SizedBox(width: 32),
                Switch(value: isActive, activeColor: const Color(0xFF6366F1), onChanged: (v) => _toggleTraderStatus(t['id'], isActive)),
                const SizedBox(width: 12),
                IconButton(icon: const Icon(LucideIcons.moreVertical, color: Colors.white24), onPressed: () {}),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildBalancePill(int balance) {
    final bool lowStock = balance < 100000;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(color: (lowStock ? Colors.redAccent : Colors.greenAccent).withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: (lowStock ? Colors.redAccent : Colors.greenAccent).withOpacity(0.1))),
      child: Row(
        children: [
          Icon(LucideIcons.coins, color: lowStock ? Colors.redAccent : Colors.greenAccent, size: 14),
          const SizedBox(width: 8),
          Text(_api.formatNumber(balance), style: GoogleFonts.outfit(color: lowStock ? Colors.redAccent : Colors.greenAccent, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildTransactionList() {
    return ListView.builder(
      padding: const EdgeInsets.all(32),
      itemCount: _transactions.length,
      itemBuilder: (context, index) {
        final tx = _transactions[index];
        final type = tx['transaction_type'] ?? 'transfer';
        final Color typeColor = type == 'admin_transfer' ? Colors.blueAccent : Colors.greenAccent;

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16)),
          child: Row(
            children: [
              Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: typeColor.withOpacity(0.1), shape: BoxShape.circle), child: Icon(type == 'admin_transfer' ? LucideIcons.arrowDownLeft : LucideIcons.arrowUpRight, color: typeColor, size: 14)),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(tx['helper']?['user']?['display_name'] ?? 'Unknown Trader', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                    Text(type.toString().toUpperCase().replaceAll('_', ' '), style: TextStyle(color: typeColor.withOpacity(0.5), fontSize: 9, fontWeight: FontWeight.bold)),
                  ],
                ),
              ),
              Text("${_api.formatNumber(tx['coin_amount'])} 💎", style: GoogleFonts.robotoMono(color: Colors.white70, fontWeight: FontWeight.bold)),
              const SizedBox(width: 32),
              Text(DateFormat('hh:mm a').format(DateTime.parse(tx['created_at'])), style: const TextStyle(color: Colors.white10, fontSize: 10)),
            ],
          ),
        );
      },
    );
  }
}
