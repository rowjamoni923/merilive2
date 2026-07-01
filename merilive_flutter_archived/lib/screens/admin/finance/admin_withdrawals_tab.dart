import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import '../../../services/api_service.dart';

class AdminWithdrawalsTab extends StatefulWidget {
  const AdminWithdrawalsTab({super.key});

  @override
  State<AdminWithdrawalsTab> createState() => _AdminWithdrawalsTabState();
}

class _AdminWithdrawalsTabState extends State<AdminWithdrawalsTab> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _withdrawals = [];
  String _filterStatus = 'pending';
  final TextEditingController _searchController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _loadWithdrawals();
  }

  Future<void> _loadWithdrawals() async {
    if (!mounted) return;
    setState(() => _isLoading = true);
    try {
      var query = _api.getSupabase().from('agency_withdrawals').select('*, agencies(name, agency_code, owner_id)').order('requested_at', ascending: false);

      if (_filterStatus != 'all') {
        query = query.eq('status', _filterStatus);
      }

      final res = await query.limit(100);
      final List<Map<String, dynamic>> data = List<Map<String, dynamic>>.from(res);

      // Enrich with owner profile data
      for (var w in data) {
        if (w['agencies'] != null && w['agencies']['owner_id'] != null) {
          final profile = await _api.getSupabase().from('profiles').select('display_name, avatar_url').eq('id', w['agencies']['owner_id']).maybeSingle();
          w['agencies']['owner'] = profile;
        }
      }

      if (mounted) {
        setState(() {
          _withdrawals = data;
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Error loading withdrawals: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _processWithdrawal(String id, String status, String? notes) async {
    try {
      await _api.getSupabase().rpc('admin_process_withdrawal', params: {
        '_withdrawal_id': id,
        '_status': status,
        '_notes': notes,
      });
      _loadWithdrawals();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Withdrawal $status successfully")));
      }
    } catch (e) {
      debugPrint("Error processing withdrawal: $e");
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to process withdrawal")));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildFilters(),
        Expanded(
          child: _isLoading 
            ? const Center(child: CircularProgressIndicator(color: Colors.emeraldAccent))
            : _withdrawals.isEmpty 
              ? const Center(child: Text("No withdrawal requests found", style: TextStyle(color: Colors.white24)))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  itemCount: _withdrawals.length,
                  itemBuilder: (context, index) => _buildWithdrawalCard(_withdrawals[index]),
                ),
        ),
      ],
    );
  }

  Widget _buildFilters() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.05))),
              child: TextField(
                controller: _searchController,
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(hintText: "Search agency name or code...", hintStyle: TextStyle(color: Colors.white24), border: InputBorder.none, icon: Icon(LucideIcons.search, color: Colors.white24, size: 16)),
                onChanged: (v) => setState(() {}),
              ),
            ),
          ),
          const SizedBox(width: 20),
          _filterBtn("PENDING", "pending"),
          const SizedBox(width: 8),
          _filterBtn("APPROVED", "approved"),
          const SizedBox(width: 8),
          _filterBtn("REJECTED", "rejected"),
          const SizedBox(width: 8),
          _filterBtn("ALL", "all"),
        ],
      ),
    );
  }

  Widget _filterBtn(String label, String status) {
    bool isSelected = _filterStatus == status;
    return GestureDetector(
      onTap: () {
        setState(() => _filterStatus = status);
        _loadWithdrawals();
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected ? Colors.emeraldAccent.withOpacity(0.1) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: isSelected ? Colors.emeraldAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
        ),
        child: Text(label, style: TextStyle(color: isSelected ? Colors.emeraldAccent : Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildWithdrawalCard(Map<String, dynamic> w) {
    final agency = w['agencies'] ?? {};
    final owner = agency['owner'] ?? {};
    final pd = w['payment_details'] ?? {};
    final status = w['status'] ?? 'pending';

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 24,
            backgroundImage: owner['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(owner['avatar_url'], bucket: 'avatars')) : null,
            backgroundColor: Colors.white10,
            child: owner['avatar_url'] == null ? const Icon(LucideIcons.building, color: Colors.white24) : null,
          ),
          const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(agency['name'] ?? 'Unknown Agency', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(width: 8),
                    Text("#${agency['agency_code'] ?? ''}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
                  ],
                ),
                const SizedBox(height: 4),
                Text("${w['payment_method']?.toString().toUpperCase()} • ${pd['account_name'] ?? ''} • ${pd['account_number'] ?? ''}", style: const TextStyle(color: Colors.white38, fontSize: 11)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text("\$${w['amount']?.toString() ?? '0'}", style: GoogleFonts.outfit(color: Colors.emeraldAccent, fontWeight: FontWeight.bold, fontSize: 18)),
              Text("${pd['local_amount'] ?? ''} ${pd['currency_code'] ?? ''}", style: const TextStyle(color: Colors.white24, fontSize: 10)),
            ],
          ),
          const SizedBox(width: 24),
          _statusBadge(status),
          const SizedBox(width: 16),
          if (status == 'pending')
            Row(
              children: [
                _actionBtn(LucideIcons.check, Colors.emeraldAccent, () => _processWithdrawal(w['id'], 'approved', 'Approved by Admin')),
                const SizedBox(width: 8),
                _actionBtn(LucideIcons.x, Colors.redAccent, () => _processWithdrawal(w['id'], 'rejected', 'Rejected by Admin')),
              ],
            ),
        ],
      ),
    );
  }

  Widget _statusBadge(String status) {
    Color color = Colors.amberAccent;
    if (status == 'approved') color = Colors.emeraldAccent;
    if (status == 'rejected') color = Colors.redAccent;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.2))),
      child: Text(status.toUpperCase(), style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold)),
    );
  }

  Widget _actionBtn(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle, border: Border.all(color: color.withOpacity(0.2))),
        child: Icon(icon, color: color, size: 14),
      ),
    );
  }
}
