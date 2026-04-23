import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminBalanceDeductionScreen extends StatefulWidget {
  const AdminBalanceDeductionScreen({super.key});

  @override
  State<AdminBalanceDeductionScreen> createState() => _AdminBalanceDeductionScreenState();
}

class _AdminBalanceDeductionScreenState extends State<AdminBalanceDeductionScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _logs = [];

  @override
  void initState() {
    super.initState();
    _loadLogs();
  }

  Future<void> _loadLogs() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('admin_logs').select('*, user:profiles!admin_logs_target_id_fkey(display_name, app_uid)').eq('action_type', 'deduct_balance').order('created_at', ascending: false).limit(100);
      if (mounted) {
        setState(() {
          _logs = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.redAccent))
              : _buildLogsList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.red, Colors.deepOrange]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.minusCircle, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("BALANCE DEDUCTION PANEL", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Strict monitoring of manual diamond and bean deductions from user accounts for corrections or penalties", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.minus, size: 16),
            label: const Text("NEW DEDUCTION"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildLogsList() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _logs.length,
      itemBuilder: (context, index) {
        final log = _logs[index];
        final user = log['user'] ?? {};
        final details = log['details'] ?? {};

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              const Icon(LucideIcons.alertTriangle, color: Colors.redAccent, size: 18),
              const SizedBox(width: 24),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user['display_name'] ?? 'User', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                    Text("ID: ${user['app_uid']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text("-${details['amount'] ?? 0} ${details['type'] ?? 'Diamonds'}", style: const TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 14)),
                  Text(details['reason'] ?? 'Manual Correction', style: const TextStyle(color: Colors.white10, fontSize: 10)),
                ],
              ),
              const SizedBox(width: 40),
              Text(DateFormat('MMM dd, hh:mm a').format(DateTime.parse(log['created_at'])), style: const TextStyle(color: Colors.white10, fontSize: 11)),
            ],
          ),
        );
      },
    );
  }
}
