import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class WithdrawalManagementScreen extends StatefulWidget {
  const WithdrawalManagementScreen({super.key});

  @override
  State<WithdrawalManagementScreen> createState() => _WithdrawalManagementScreenState();
}

class _WithdrawalManagementScreenState extends State<WithdrawalManagementScreen> {
  final ApiService _api = ApiService();
  List<Map<String, dynamic>> _withdrawals = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadWithdrawals();
  }

  Future<void> _loadWithdrawals() async {
    setState(() => _isLoading = true);
    final list = await _api.getAdminWithdrawals();
    setState(() {
      _withdrawals = list;
      _isLoading = false;
    });
  }

  Future<void> _processWithdrawal(String id, String status) async {
    final ok = await _api.processAdminWithdrawal(id, status);
    if (ok) {
      _loadWithdrawals();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text("Withdrawal marked as $status"),
        backgroundColor: status == 'completed' ? Colors.green : Colors.orange,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    if (_withdrawals.isEmpty) return const Center(child: Text("No withdrawal history", style: TextStyle(color: Colors.white24)));

    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text("PAYMENT REQUESTS", style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
              Text("${_withdrawals.length} Total", style: const TextStyle(color: Colors.greenAccent, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 20),
          Expanded(
            child: ListView.builder(
              itemCount: _withdrawals.length,
              itemBuilder: (context, index) {
                final w = _withdrawals[index];
                final agency = w['agency'] as Map<String, dynamic>?;
                final status = w['status'] ?? 'pending';
                bool isPending = status == 'pending' || status == 'processing';

                return FadeInUp(
                  delay: Duration(milliseconds: 50 * index),
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 16),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.white.withOpacity(0.03),
                      borderRadius: BorderRadius.circular(24),
                      border: Border.all(color: Colors.white70),
                    ),
                    child: Column(
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text("\$${w['amount_usd'].toStringAsFixed(2)}", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
                                Text("${NumberFormat('#,###').format(w['beans_amount'])} Beans", style: const TextStyle(color: Colors.white38, fontSize: 11)),
                              ],
                            ),
                            _buildStatusBadge(status),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Row(
                          children: [
                            const Icon(LucideIcons.building2, color: Colors.white24, size: 14),
                            const SizedBox(width: 8),
                            Text(agency?['name'] ?? 'N/A', style: const TextStyle(color: Colors.white70, fontSize: 12)),
                            const Spacer(),
                            Text("Via ${w['payment_method']}", style: const TextStyle(color: Color(0xFF6366F1), fontSize: 10, fontWeight: FontWeight.bold)),
                          ],
                        ),
                        if (isPending) ...[
                          const Padding(padding: EdgeInsets.symmetric(vertical: 16), child: Divider(color: Colors.white70, height: 1)),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.end,
                            children: [
                              _buildActionBtn("Reject", Colors.redAccent, () => _processWithdrawal(w['id'], 'rejected')),
                              const SizedBox(width: 12),
                              _buildActionBtn("Process", Colors.orangeAccent, () => _processWithdrawal(w['id'], 'processing')),
                              const SizedBox(width: 12),
                              _buildActionBtn("Complete", Colors.greenAccent, () => _processWithdrawal(w['id'], 'completed')),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusBadge(String status) {
    Color color;
    switch (status) {
      case 'completed': color = Colors.green; break;
      case 'processing': color = Colors.orange; break;
      case 'rejected': color = Colors.red; break;
      default: color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10), border: Border.all(color: color.withOpacity(0.3))),
      child: Text(status.toUpperCase(), style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildActionBtn(String label, Color color, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.3))),
        child: Text(label, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
      ),
    );
  }
}


