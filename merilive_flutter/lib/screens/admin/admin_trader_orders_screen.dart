import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminTraderOrdersScreen extends StatefulWidget {
  const AdminTraderOrdersScreen({super.key});

  @override
  State<AdminTraderOrdersScreen> createState() => _AdminTraderOrdersScreenState();
}

class _AdminTraderOrdersScreenState extends State<AdminTraderOrdersScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _orders = [];

  @override
  void initState() {
    super.initState();
    _loadOrders();
  }

  Future<void> _loadOrders() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('trader_orders').select('*, user:profiles!trader_orders_user_id_fkey(display_name, app_uid), trader:profiles!trader_orders_trader_id_fkey(display_name, app_uid)').order('created_at', ascending: false).limit(100);
      if (mounted) {
        setState(() {
          _orders = List<Map<String, dynamic>>.from(res);
          _isLoading = false;
        });
      }
    } catch (e) {
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
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.blueAccent))
              : _buildOrdersList(),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(40),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              FadeInLeft(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.indigoAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.shoppingCart, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("TRADER PURCHASE ORDERS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Monitor diamond purchase requests handled by official traders and helpers", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          _buildRefreshBtn(),
        ],
      ),
    );
  }

  Widget _buildRefreshBtn() {
    return ElevatedButton.icon(
      onPressed: _loadOrders,
      icon: const Icon(LucideIcons.refreshCw, size: 16),
      label: const Text("REFRESH ORDERS"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildOrdersList() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _orders.length,
      itemBuilder: (context, index) {
        final order = _orders[index];
        final user = order['user'] ?? {};
        final trader = order['trader'] ?? {};
        final bool isCompleted = order['status'] == 'completed';

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(user['display_name'] ?? 'Buyer', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                        const Padding(padding: EdgeInsets.symmetric(horizontal: 8), child: Icon(LucideIcons.arrowRight, color: Colors.white10, size: 12)),
                        Text(trader['display_name'] ?? 'Trader', style: const TextStyle(color: Colors.blueAccent, fontWeight: FontWeight.bold, fontSize: 14)),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text("User ID: ${user['app_uid']} • Trader ID: ${trader['app_uid']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text("${order['diamond_amount'] ?? 0} Diamonds", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  Text("${order['price'] ?? 0} BDT", style: const TextStyle(color: Colors.emeraldAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(width: 40),
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: (isCompleted ? Colors.emeraldAccent : Colors.amberAccent).withOpacity(0.1), borderRadius: BorderRadius.circular(6)), child: Text(order['status']?.toString().toUpperCase() ?? 'PENDING', style: TextStyle(color: isCompleted ? Colors.emeraldAccent : Colors.amberAccent, fontSize: 9, fontWeight: FontWeight.bold))),
            ],
          ),
        );
      },
    );
  }
}
