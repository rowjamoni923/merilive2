import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class PayrollOrdersScreen extends StatefulWidget {
  const PayrollOrdersScreen({super.key});

  @override
  State<PayrollOrdersScreen> createState() => _PayrollOrdersScreenState();
}

class _PayrollOrdersScreenState extends State<PayrollOrdersScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  bool _isLoading = true;
  List<Map<String, dynamic>> _orders = [];
  Map<String, dynamic> _stats = {
    'total': 0,
    'pending': 0,
    'processing': 0,
    'completed': 0,
    'cancelled': 0,
  };

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 5, vsync: this);
    _loadOrders();
  }

  Future<void> _loadOrders() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      // 1. Fetch Helper Orders
      final helperOrders = await supa.from('helper_orders').select('''
        *,
        user:profiles!helper_orders_user_id_fkey(id, display_name, avatar_url, app_uid),
        helper:topup_helpers!helper_orders_helper_id_fkey(
          id,
          user:profiles!topup_helpers_user_id_fkey(id, display_name, avatar_url, app_uid)
        )
      ''').order('created_at', ascending: false).limit(100);

      // 2. Fetch Agency Withdrawals (Status: processing)
      final agencyOrders = await supa.from('agency_withdrawals').select('''
        *,
        agency:agencies(name, agency_code, logo_url),
        helper:topup_helpers!agency_withdrawals_assigned_helper_id_fkey(
          id,
          user:profiles!topup_helpers_user_id_fkey(id, display_name, avatar_url, app_uid)
        )
      ''').inFilter('status', ['processing', 'approved', 'rejected']).limit(100);

      // Combine and Transform (1:1 with Web logic)
      List<Map<String, dynamic>> allOrders = [];
      for (var o in helperOrders) {
        allOrders.add({...o, 'type': 'HELPER_ORDER'});
      }
      for (var o in agencyOrders) {
        allOrders.add({
          'id': o['id'],
          'coin_amount': o['amount'],
          'amount_usd': o['amount'],
          'status': o['status'],
          'created_at': o['requested_at'],
          'user': {'display_name': o['agency']?['name'], 'avatar_url': o['agency']?['logo_url'], 'app_uid': o['agency']?['agency_code']},
          'helper': o['helper'],
          'type': 'AGENCY_WITHDRAWAL'
        });
      }

      allOrders.sort((a, b) => b['created_at'].compareTo(a['created_at']));

      setState(() {
        _orders = allOrders;
        _stats = {
          'total': allOrders.length,
          'pending': allOrders.where((o) => o['status'] == 'pending').length,
          'processing': allOrders.where((o) => o['status'] == 'processing').length,
          'completed': allOrders.where((o) => o['status'] == 'completed' || o['status'] == 'approved').length,
          'cancelled': allOrders.where((o) => o['status'] == 'cancelled' || o['status'] == 'rejected').length,
        };
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading payroll orders: $e");
      if (mounted) setState(() => _isLoading = false);
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
          _buildStatsStrip(),
          const SizedBox(height: 32),
          _buildTabs(),
          const SizedBox(height: 32),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildOrderList('all'),
                _buildOrderList('pending'),
                _buildOrderList('processing'),
                _buildOrderList('completed'),
                _buildOrderList('cancelled'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("PAYROLL SETTLEMENT HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              const Text("Audit helper orders, agency withdrawals, and local currency top-up proofs", style: TextStyle(color: Colors.white38, fontSize: 14)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: _loadOrders,
            icon: const Icon(LucideIcons.refreshCw, size: 16),
            label: const Text("REFRESH DATA"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsStrip() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        children: [
          _buildMiniStat("Total Orders", _stats['total'], Colors.blueAccent),
          const SizedBox(width: 16),
          _buildMiniStat("Pending", _stats['pending'], Colors.amberAccent),
          const SizedBox(width: 16),
          _buildMiniStat("Processing", _stats['processing'], Colors.cyanAccent),
          const SizedBox(width: 16),
          _buildMiniStat("Completed", _stats['completed'], Colors.greenAccent),
          const SizedBox(width: 16),
          _buildMiniStat("Cancelled", _stats['cancelled'], Colors.redAccent),
        ],
      ),
    );
  }

  Widget _buildMiniStat(String label, int value, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.1))),
        child: Column(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Text(value.toString(), style: GoogleFonts.outfit(color: color, fontSize: 20, fontWeight: FontWeight.bold)),
          Text(label.toUpperCase(), style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1)),
        ]),
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
        tabs: const [Tab(text: "All Orders"), Tab(text: "Pending"), Tab(text: "Processing"), Tab(text: "Completed"), Tab(text: "Cancelled")],
      ),
    );
  }

  Widget _buildOrderList(String status) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    final filtered = status == 'all' ? _orders : _orders.where((o) {
      if (status == 'completed') return o['status'] == 'completed' || o['status'] == 'approved';
      if (status == 'cancelled') return o['status'] == 'cancelled' || o['status'] == 'rejected';
      return o['status'] == status;
    }).toList();

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final order = filtered[index];
        return FadeInUp(
          delay: Duration(milliseconds: 30 * index),
          child: _buildOrderCard(order),
        );
      },
    );
  }

  Widget _buildOrderCard(Map<String, dynamic> o) {
    final bool isAgency = o['type'] == 'AGENCY_WITHDRAWAL';
    final status = o['status'].toString().toUpperCase();
    final color = status == 'COMPLETED' || status == 'APPROVED' ? Colors.greenAccent : (status == 'PENDING' ? Colors.amberAccent : (status == 'PROCESSING' ? Colors.cyanAccent : Colors.redAccent));

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        children: [
          CircleAvatar(radius: 24, backgroundImage: CachedNetworkImageProvider(o['user']?['avatar_url'] ?? "")),
          const SizedBox(width: 20),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Text(o['user']?['display_name'] ?? 'User', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                const SizedBox(width: 8),
                if (isAgency) Container(padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: Colors.purpleAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(4)), child: const Text("AGENCY", style: TextStyle(color: Colors.purpleAccent, fontSize: 8, fontWeight: FontWeight.bold))),
              ]),
              Text("ID: ${o['user']?['app_uid'] ?? '-'} \u2022 Method: ${o['payment_method'] ?? 'Manual'}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text("${_api.formatNumber(o['coin_amount'] ?? 0)} ${isAgency ? 'Beans' : '💎'}", style: GoogleFonts.outfit(color: isAgency ? Colors.purpleAccent : Colors.greenAccent, fontSize: 18, fontWeight: FontWeight.bold)),
            Text("\$${_api.formatNumber(o['amount_usd'] ?? 0)} USD", style: const TextStyle(color: Colors.white38, fontSize: 11)),
          ]),
          const SizedBox(width: 32),
          _buildBadge(status, color),
          const SizedBox(width: 24),
          IconButton(icon: const Icon(LucideIcons.eye, color: Colors.white24, size: 20), onPressed: () {}),
        ],
      ),
    );
  }

  Widget _buildBadge(String label, Color color) {
    return Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6), decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.2))), child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.bold)));
  }
}
