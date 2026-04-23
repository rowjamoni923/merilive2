import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminTraderTransactionsScreen extends StatefulWidget {
  const AdminTraderTransactionsScreen({super.key});

  @override
  State<AdminTraderTransactionsScreen> createState() => _AdminTraderTransactionsScreenState();
}

class _AdminTraderTransactionsScreenState extends State<AdminTraderTransactionsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _txs = [];

  @override
  void initState() {
    super.initState();
    _loadTransactions();
  }

  Future<void> _loadTransactions() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('trader_wallet_transactions').select('*, trader:profiles(display_name, app_uid)').order('created_at', ascending: false).limit(100);
      if (mounted) {
        setState(() {
          _txs = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.amberAccent))
              : _buildTxList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.amber, Colors.orange]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.history, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("TRADER WALLET LEDGER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Full audit trail of trader wallet balance changes, top-ups, and diamond distributions", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
      onPressed: _loadTransactions,
      icon: const Icon(LucideIcons.refreshCw, size: 16),
      label: const Text("REFRESH LEDGER"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildTxList() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _txs.length,
      itemBuilder: (context, index) {
        final tx = _txs[index];
        final trader = tx['trader'] ?? {};
        final bool isCredit = tx['transaction_type'] == 'credit' || tx['transaction_type'] == 'topup';

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.02))),
          child: Row(
            children: [
              Icon(isCredit ? LucideIcons.arrowUpRight : LucideIcons.arrowDownRight, color: isCredit ? Colors.emeraldAccent : Colors.redAccent, size: 16),
              const SizedBox(width: 24),
              SizedBox(width: 140, child: Text(DateFormat('MMM dd, hh:mm a').format(DateTime.parse(tx['created_at'])), style: const TextStyle(color: Colors.white24, fontSize: 11))),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(trader['display_name'] ?? 'Trader', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)), Text(tx['description'] ?? 'Balance Adjustment', style: const TextStyle(color: Colors.white10, fontSize: 11))])),
              Text("${isCredit ? '+' : '-'}${tx['amount'] ?? 0} Diamonds", style: GoogleFonts.outfit(color: isCredit ? Colors.emeraldAccent : Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 14)),
            ],
          ),
        );
      },
    );
  }
}
