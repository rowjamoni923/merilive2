import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminRechargeHistoryScreen extends StatefulWidget {
  const AdminRechargeHistoryScreen({super.key});

  @override
  State<AdminRechargeHistoryScreen> createState() => _AdminRechargeHistoryScreenState();
}

class _AdminRechargeHistoryScreenState extends State<AdminRechargeHistoryScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _records = [];
  String _filter = 'all';

  @override
  void initState() {
    super.initState();
    _loadRecords();
  }

  Future<void> _loadRecords() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      var query = supa.from('recharge_history').select('*, user:profiles!recharge_history_user_id_fkey(display_name, app_uid, avatar_url)');
      
      if (_filter != 'all') {
        query = query.eq('status', _filter);
      }

      final res = await query.order('created_at', ascending: false).limit(100);
      
      if (mounted) {
        setState(() {
          _records = List<Map<String, dynamic>>.from(res);
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
          _buildFilterBar(),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.blueAccent))
              : _records.isEmpty 
                ? const Center(child: Text("No recharge records found", style: TextStyle(color: Colors.white24)))
                : _buildRecordList(),
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
                  child: const Icon(LucideIcons.history, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("RECHARGE RECORDS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Audit trails for all diamond top-ups and payment history", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          _buildExportBtn(),
        ],
      ),
    );
  }

  Widget _buildExportBtn() {
    return ElevatedButton.icon(
      onPressed: () {},
      icon: const Icon(LucideIcons.download, size: 16),
      label: const Text("EXPORT CSV"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 40),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          _filterBtn("ALL RECHARGES", "all"),
          _filterBtn("SUCCESS", "success"),
          _filterBtn("PENDING", "pending"),
          _filterBtn("FAILED", "failed"),
        ],
      ),
    );
  }

  Widget _filterBtn(String label, String val) {
    final bool isSelected = _filter == val;
    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() => _filter = val);
          _loadRecords();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(color: isSelected ? Colors.blueAccent.withOpacity(0.1) : Colors.transparent, borderRadius: BorderRadius.circular(10)),
          child: Center(child: Text(label, style: TextStyle(color: isSelected ? Colors.blueAccent : Colors.white24, fontSize: 10, fontWeight: FontWeight.bold))),
        ),
      ),
    );
  }

  Widget _buildRecordList() {
    return ListView.builder(
      padding: const EdgeInsets.all(40),
      itemCount: _records.length,
      itemBuilder: (context, index) {
        final r = _records[index];
        final user = r['user'] ?? {};
        final bool isSuccess = r['status'] == 'success';

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              CircleAvatar(radius: 20, backgroundImage: user['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(user['avatar_url'], bucket: 'avatars')) : null),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user['display_name'] ?? 'Unknown User', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    Text("ID: ${user['app_uid']} \u2022 Gateway: ${r['gateway']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text("+${r['amount']} 💎", style: GoogleFonts.outfit(color: Colors.emeraldAccent, fontWeight: FontWeight.bold, fontSize: 16)),
                  Text("\$${r['price_usd']}", style: const TextStyle(color: Colors.white38, fontSize: 11)),
                ],
              ),
              const SizedBox(width: 32),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(color: (isSuccess ? Colors.emeraldAccent : Colors.orangeAccent).withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                child: Text(r['status'].toString().toUpperCase(), style: TextStyle(color: isSuccess ? Colors.emeraldAccent : Colors.orangeAccent, fontSize: 9, fontWeight: FontWeight.bold)),
              ),
              const SizedBox(width: 24),
              Text(DateFormat('MMM dd, hh:mm a').format(DateTime.parse(r['created_at'])), style: const TextStyle(color: Colors.white10, fontSize: 10)),
            ],
          ),
        );
      },
    );
  }
}
