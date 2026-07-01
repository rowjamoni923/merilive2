import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminActivityRecordsScreen extends StatefulWidget {
  const AdminActivityRecordsScreen({super.key});

  @override
  State<AdminActivityRecordsScreen> createState() => _AdminActivityRecordsScreenState();
}

class _AdminActivityRecordsScreenState extends State<AdminActivityRecordsScreen> {
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
      final res = await _api.getSupabase().from('admin_audit_logs').select('*, admin:admin_users(email, display_name)').order('created_at', ascending: false).limit(200);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.blueAccent))
              : _buildLogsTable(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blueGrey, Colors.black87]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.scrollText, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("SYSTEM AUDIT RECORDS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Immutatable history of all administrative actions and system events", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
      onPressed: _loadLogs,
      icon: const Icon(LucideIcons.refreshCw, size: 16),
      label: const Text("REFRESH LOGS"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildLogsTable() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _logs.length,
      itemBuilder: (context, index) {
        final log = _logs[index];
        final admin = log['admin'] ?? {};
        final bool isWarning = log['severity'] == 'warning' || log['severity'] == 'error';

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.02))),
          child: Row(
            children: [
              Container(width: 8, height: 8, decoration: BoxDecoration(color: isWarning ? Colors.redAccent : Colors.blueAccent, shape: BoxShape.circle)),
              const SizedBox(width: 24),
              SizedBox(width: 150, child: Text(DateFormat('MMM dd, hh:mm:ss').format(DateTime.parse(log['created_at'])), style: const TextStyle(color: Colors.white24, fontSize: 11))),
              SizedBox(width: 200, child: Text(admin['display_name'] ?? admin['email'] ?? 'System', style: const TextStyle(color: Colors.white70, fontWeight: FontWeight.bold, fontSize: 12))),
              Expanded(child: Text(log['description'] ?? 'No description', style: TextStyle(color: isWarning ? Colors.redAccent.withOpacity(0.8) : Colors.white, fontSize: 13))),
              const SizedBox(width: 20),
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(6)), child: Text(log['action_type']?.toString().toUpperCase() ?? 'ACTION', style: const TextStyle(color: Colors.white38, fontSize: 9, fontWeight: FontWeight.bold))),
            ],
          ),
        );
      },
    );
  }
}
