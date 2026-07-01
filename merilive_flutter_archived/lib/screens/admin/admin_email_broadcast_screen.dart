import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminEmailBroadcastScreen extends StatefulWidget {
  const AdminEmailBroadcastScreen({super.key});

  @override
  State<AdminEmailBroadcastScreen> createState() => _AdminEmailBroadcastScreenState();
}

class _AdminEmailBroadcastScreenState extends State<AdminEmailBroadcastScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _history = [];

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('email_broadcast_history').select().order('created_at', ascending: false).limit(50);
      if (mounted) {
        setState(() {
          _history = List<Map<String, dynamic>>.from(res);
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
              : _buildHistoryList(),
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
                  child: const Icon(LucideIcons.mail, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("EMAIL MARKETING BROADCAST", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Broadcast HTML emails to users for newsletters, platform updates and marketing campaigns", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.send, size: 16),
            label: const Text("SEND CAMPAIGN"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildHistoryList() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _history.length,
      itemBuilder: (context, index) {
        final h = _history[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              const Icon(LucideIcons.atSign, color: Colors.white24, size: 20),
              const SizedBox(width: 24),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(h['subject'] ?? 'No Subject', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                    Text("Template: ${h['template_id'] ?? 'Default'}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
              ),
              const SizedBox(width: 40),
              Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Text("${h['recipient_count'] ?? 0} RECIPIENTS", style: const TextStyle(color: Colors.redAccent, fontSize: 9, fontWeight: FontWeight.bold))),
            ],
          ),
        );
      },
    );
  }
}
