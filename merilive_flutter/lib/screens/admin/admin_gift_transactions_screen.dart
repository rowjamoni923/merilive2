import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminGiftTransactionsScreen extends StatefulWidget {
  const AdminGiftTransactionsScreen({super.key});

  @override
  State<AdminGiftTransactionsScreen> createState() => _AdminGiftTransactionsScreenState();
}

class _AdminGiftTransactionsScreenState extends State<AdminGiftTransactionsScreen> {
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
      final res = await _api.getSupabase().from('gift_transactions').select('*, sender:profiles!gift_transactions_sender_id_fkey(display_name, app_uid), receiver:profiles!gift_transactions_receiver_id_fkey(display_name, app_uid), gift:gifts(name, price)').order('created_at', ascending: false).limit(100);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.pinkAccent))
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.pink, Colors.deepPurple]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.gift, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("GIFT TRANSACTION LEDGER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Monitor real-time virtual gifting activities, sender-receiver flows and platform circulation", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
        final sender = tx['sender'] ?? {};
        final receiver = tx['receiver'] ?? {};
        final gift = tx['gift'] ?? {};

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    _userSnippet(sender['display_name'] ?? 'Sender', sender['app_uid'] ?? 'N/A'),
                    const Padding(padding: EdgeInsets.symmetric(horizontal: 20), child: Icon(LucideIcons.arrowRight, color: Colors.white10, size: 16)),
                    _userSnippet(receiver['display_name'] ?? 'Receiver', receiver['app_uid'] ?? 'N/A', isReceiver: true),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text(gift['name'] ?? 'Virtual Gift', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                  Text("${gift['price'] ?? 0} 💎", style: const TextStyle(color: Colors.amberAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                ],
              ),
              const SizedBox(width: 40),
              Text(DateFormat('hh:mm a').format(DateTime.parse(tx['created_at'])), style: const TextStyle(color: Colors.white10, fontSize: 11)),
            ],
          ),
        );
      },
    );
  }

  Widget _userSnippet(String name, String uid, {bool isReceiver = false}) {
    return Column(
      crossAxisAlignment: isReceiver ? CrossAxisAlignment.start : CrossAxisAlignment.end,
      children: [
        Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
        Text("ID: $uid", style: const TextStyle(color: Colors.white24, fontSize: 11)),
      ],
    );
  }
}
