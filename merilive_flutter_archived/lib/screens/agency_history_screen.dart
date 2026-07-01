import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';

class AgencyHistoryScreen extends StatefulWidget {
  const AgencyHistoryScreen({super.key});

  @override
  State<AgencyHistoryScreen> createState() => _AgencyHistoryScreenState();
}

class _AgencyHistoryScreenState extends State<AgencyHistoryScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _transactions = [];
  List<Map<String, dynamic>> _filteredTransactions = [];
  String _selectedFilter = 'All';

  final List<String> _filters = ['All', 'Withdrawals', 'Host Earnings', 'Transfers'];

  @override
  void initState() {
    super.initState();
    _loadRealHistory();
  }

  Future<void> _loadRealHistory() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      if (profile != null && profile['agency_id'] != null) {
        final agencyId = profile['agency_id'];
        _transactions = await _api.getAgencyFinanceHistory(agencyId);
        _applyFilter(_selectedFilter);
      }
    } catch (e) {
      debugPrint("Parity History Error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _applyFilter(String filter) {
    setState(() {
      _selectedFilter = filter;
      if (filter == 'All') {
        _filteredTransactions = List.from(_transactions);
      } else if (filter == 'Withdrawals') {
        _filteredTransactions = _transactions.where((t) => t['type'] == 'withdrawal').toList();
      } else if (filter == 'Host Earnings') {
        _filteredTransactions = _transactions.where((t) => t['type'] == 'host_earnings').toList();
      } else if (filter == 'Transfers') {
        _filteredTransactions = _transactions.where((t) => t['type'] == 'transfer_in' || t['type'] == 'transfer_out').toList();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                _buildFilterBar(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
                    : _buildTransactionList(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
              child: const Icon(LucideIcons.chevronLeft, color: Colors.white, size: 20),
            ),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("Financial History", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              Text("Master Copy • Agency Ledger", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
            ],
          ),
          const Spacer(),
          IconButton(icon: const Icon(LucideIcons.refreshCcw, color: Colors.white38, size: 18), onPressed: _loadRealHistory),
        ],
      ),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      height: 44,
      margin: const EdgeInsets.only(bottom: 20),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: _filters.length,
        itemBuilder: (context, index) {
          final filter = _filters[index];
          final isSelected = _selectedFilter == filter;
          return GestureDetector(
            onTap: () => _applyFilter(filter),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.only(right: 12),
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                color: isSelected ? Colors.cyanAccent.withOpacity(0.1) : Colors.white.withOpacity(0.02),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: isSelected ? Colors.cyanAccent.withOpacity(0.3) : Colors.white10),
              ),
              alignment: Alignment.center,
              child: Text(filter.toUpperCase(), style: GoogleFonts.outfit(color: isSelected ? Colors.cyanAccent : Colors.white38, fontWeight: FontWeight.bold, fontSize: 11)),
            ),
          );
        },
      ),
    );
  }

  Widget _buildTransactionList() {
    if (_filteredTransactions.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.ledger, color: Colors.white10, size: 64),
            const SizedBox(height: 16),
            Text("No transactions found in this category", style: TextStyle(color: Colors.white.withOpacity(0.2))),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _loadRealHistory,
      color: Colors.cyanAccent,
      backgroundColor: const Color(0xFF1E293B),
      child: ListView.builder(
        physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
        padding: const EdgeInsets.all(20),
        itemCount: _filteredTransactions.length,
        itemBuilder: (context, index) {
          final tx = _filteredTransactions[index];
          final amount = tx['amount'] ?? 0;
          final isNegative = amount < 0;
          final amountText = isNegative ? "$amount" : "+$amount";
          final color = isNegative ? Colors.redAccent : Colors.greenAccent;
          final type = tx['type'] ?? 'unknown';
          final createdAt = tx['created_at']?.toString().split('T').first ?? '--';
          final txId = tx['id']?.toString().substring(0, 8) ?? 'SYS';
          
          IconData iconData = LucideIcons.circle;
          String title = 'Transaction';
          
          if (type == 'withdrawal') {
            iconData = LucideIcons.arrowUpRight;
            title = "Withdrawal";
          } else if (type == 'host_earnings') {
            iconData = LucideIcons.userCheck;
            title = "Host Revenue Share";
          } else if (type.contains('transfer')) {
            iconData = LucideIcons.repeat;
            title = "System Transfer";
          } else if (type == 'commission') {
            iconData = LucideIcons.percent;
            title = "Agency Earnings";
          }

          return FadeInUp(
            delay: Duration(milliseconds: 30 * (index % 10)),
            child: Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.02),
                borderRadius: BorderRadius.circular(28),
                border: Border.all(color: Colors.white.withOpacity(0.05)),
              ),
              child: Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle),
                    child: Icon(iconData, color: color, size: 20),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(title, style: GoogleFonts.outfit(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
                        Text("ID: $txId • $createdAt", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 10)),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(amountText, style: GoogleFonts.outfit(color: color, fontSize: 16, fontWeight: FontWeight.w900)),
                      Text("BEANS", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 8, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}


