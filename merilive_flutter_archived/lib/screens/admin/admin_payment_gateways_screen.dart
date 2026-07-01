import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminPaymentGatewaysScreen extends StatefulWidget {
  const AdminPaymentGatewaysScreen({super.key});

  @override
  State<AdminPaymentGatewaysScreen> createState() => _AdminPaymentGatewaysScreenState();
}

class _AdminPaymentGatewaysScreenState extends State<AdminPaymentGatewaysScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  List<Map<String, dynamic>> _gateways = [];
  List<Map<String, dynamic>> _transactions = [];
  String _statusFilter = "all";

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
      
      final results = await Future.wait([
        supa.from('payment_gateways').select('*').order('display_order', ascending: true),
        supa.from('payment_transactions').select('*, gateway:payment_gateways(name, gateway_code), user:profiles(display_name, avatar_url, app_uid)').order('created_at', ascending: false).limit(50),
      ]);

      setState(() {
        _gateways = List<Map<String, dynamic>>.from(results[0].data);
        _transactions = List<Map<String, dynamic>>.from(results[1].data);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading payment data: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _toggleGateway(String id, bool currentStatus) async {
    try {
      await _api.getSupabase().from('payment_gateways').update({'is_active': !currentStatus}).eq('id', id);
      _loadData();
    } catch (e) {
      debugPrint("Error toggling gateway: $e");
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
              ? const Center(child: CircularProgressIndicator(color: Colors.pinkAccent))
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildGatewaysTab(),
                    _buildTransactionsTab(),
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
        gradient: const LinearGradient(colors: [Color(0xFFEC4899), Color(0xFFBE185D)]),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [BoxShadow(color: Colors.pink.withOpacity(0.2), blurRadius: 40, offset: const Offset(0, 20))],
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.creditCard, color: Colors.white, size: 32),
                  const SizedBox(width: 20),
                  Text("PAYMENT SYSTEM", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                ],
              ),
              const Text("Manage global payment gateways and reconcile financial transactions", style: TextStyle(color: Colors.white70)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus),
            label: const Text("NEW GATEWAY"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white.withOpacity(0.2), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      child: TabBar(
        controller: _tabController,
        indicatorColor: Colors.pinkAccent,
        indicatorWeight: 4,
        dividerColor: Colors.white.withOpacity(0.05),
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white24,
        tabs: const [Tab(text: "CONFIGURED GATEWAYS"), Tab(text: "TRANSACTION AUDIT")],
      ),
    );
  }

  Widget _buildGatewaysTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(32),
      itemCount: _gateways.length,
      itemBuilder: (context, index) {
        final g = _gateways[index];
        final bool isActive = g['is_active'] ?? false;
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: isActive ? Colors.pinkAccent.withOpacity(0.02) : Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isActive ? Colors.pinkAccent.withOpacity(0.1) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                Container(
                  width: 64, height: 64,
                  decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
                  child: g['logo_url'] != null ? ClipRRect(borderRadius: BorderRadius.circular(16), child: Image.network(g['logo_url'], fit: BoxFit.cover)) : const Icon(LucideIcons.image, color: Colors.black12),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(g['name'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                      Text(g['gateway_type'] ?? 'Custom', style: const TextStyle(color: Colors.white24, fontSize: 10, letterSpacing: 1)),
                    ],
                  ),
                ),
                _gatewayDetail("CURRENCIES", (g['supported_currencies'] as List).join(", ")),
                const SizedBox(width: 48),
                _gatewayDetail("FEE", "${g['config']?['fee_percentage'] ?? 0}%"),
                const SizedBox(width: 48),
                Switch(value: isActive, onChanged: (v) => _toggleGateway(g['id'], isActive), activeColor: Colors.pinkAccent),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _gatewayDetail(String label, String val) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 8, fontWeight: FontWeight.bold)),
        Text(val, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
      ],
    );
  }

  Widget _buildTransactionsTab() {
    return ListView.builder(
      padding: const EdgeInsets.all(32),
      itemCount: _transactions.length,
      itemBuilder: (context, index) {
        final t = _transactions[index];
        final user = t['user'] ?? {};
        final gateway = t['gateway'] ?? {};
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              CircleAvatar(backgroundImage: NetworkImage(user['avatar_url'] ?? ''), radius: 20),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text("Ref: ${t['transaction_ref'] ?? '-'}", style: const TextStyle(color: Colors.white24, fontSize: 10)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text("\$${t['amount_usd']}", style: const TextStyle(color: Colors.greenAccent, fontWeight: FontWeight.bold)),
                  Text(gateway['name'] ?? 'System', style: const TextStyle(color: Colors.white24, fontSize: 9)),
                ],
              ),
              const SizedBox(width: 24),
              Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(8)), child: Text(t['status'].toString().toUpperCase(), style: const TextStyle(color: Colors.white38, fontSize: 8, fontWeight: FontWeight.bold))),
            ],
          ),
        );
      },
    );
  }
}
