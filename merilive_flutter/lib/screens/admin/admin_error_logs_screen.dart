import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminErrorLogsScreen extends StatefulWidget {
  const AdminErrorLogsScreen({super.key});

  @override
  State<AdminErrorLogsScreen> createState() => _AdminErrorLogsScreenState();
}

class _AdminErrorLogsScreenState extends State<AdminErrorLogsScreen> {
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
      final res = await _api.getSupabase().from('system_error_logs').select().order('created_at', ascending: false).limit(200);
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.red, Colors.deepOrange]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.terminal, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("SYSTEM ERROR LOGS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Technical diagnostic logs for debugging platform exceptions and failures", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
      label: const Text("REFRESH DIAGNOSTICS"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildLogsTable() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _logs.length,
      itemBuilder: (context, index) {
        final log = _logs[index];
        final bool isCritical = log['severity'] == 'critical';

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(12), border: Border.all(color: isCritical ? Colors.redAccent.withOpacity(0.2) : Colors.white.withOpacity(0.02))),
          child: Row(
            children: [
              Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: (isCritical ? Colors.redAccent : Colors.amberAccent).withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Icon(LucideIcons.bug, color: isCritical ? Colors.redAccent : Colors.amberAccent, size: 16)),
              const SizedBox(width: 20),
              SizedBox(width: 140, child: Text(DateFormat('MMM dd, hh:mm:ss').format(DateTime.parse(log['created_at'])), style: const TextStyle(color: Colors.white24, fontSize: 11))),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(log['message'] ?? 'Unknown Exception', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)), Text(log['stack_trace'] ?? 'No stack trace available', style: const TextStyle(color: Colors.white10, fontSize: 11, overflow: TextOverflow.ellipsis), maxLines: 1)])),
              const SizedBox(width: 20),
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(6)), child: Text(log['module']?.toString().toUpperCase() ?? 'SYS', style: const TextStyle(color: Colors.white38, fontSize: 9, fontWeight: FontWeight.bold))),
            ],
          ),
        );
      },
    );
  }
}
