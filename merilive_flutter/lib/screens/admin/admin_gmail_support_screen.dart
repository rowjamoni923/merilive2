import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminGmailSupportScreen extends StatefulWidget {
  const AdminGmailSupportScreen({super.key});

  @override
  State<AdminGmailSupportScreen> createState() => _AdminGmailSupportScreenState();
}

class _AdminGmailSupportScreenState extends State<AdminGmailSupportScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _tickets = [];

  @override
  void initState() {
    super.initState();
    _loadTickets();
  }

  Future<void> _loadTickets() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('support_tickets').select('*, user:profiles(display_name, app_uid, email)').eq('source', 'gmail').order('created_at', ascending: false).limit(50);
      if (mounted) {
        setState(() {
          _tickets = List<Map<String, dynamic>>.from(res);
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
              : _buildTicketsList(),
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
                    Text("GMAIL SUPPORT TICKETS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Handle user support inquiries received via official support email", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
      onPressed: _loadTickets,
      icon: const Icon(LucideIcons.refreshCw, size: 16),
      label: const Text("REFRESH INBOX"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildTicketsList() {
    if (_tickets.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.inbox, color: Colors.white.withOpacity(0.05), size: 100),
            const SizedBox(height: 24),
            const Text("Your support inbox is clear", style: TextStyle(color: Colors.white10, fontSize: 18)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _tickets.length,
      itemBuilder: (context, index) {
        final t = _tickets[index];
        final user = t['user'] ?? {};
        final bool isResolved = t['status'] == 'resolved';

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: isResolved ? Colors.emeraldAccent.withOpacity(0.1) : Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(t['subject'] ?? 'No Subject', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                        const SizedBox(width: 12),
                        Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(4)), child: Text(t['status']?.toString().toUpperCase() ?? 'OPEN', style: const TextStyle(color: Colors.white38, fontSize: 8, fontWeight: FontWeight.bold))),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text("From: ${user['email'] ?? t['sender_email'] ?? 'Unknown Sender'}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                  ],
                ),
              ),
              const SizedBox(width: 48),
              _actionIconButton(LucideIcons.eye, Colors.blueAccent, () {}),
              const SizedBox(width: 12),
              _actionIconButton(LucideIcons.checkCircle2, Colors.emeraldAccent, () {}),
            ],
          ),
        );
      },
    );
  }

  Widget _actionIconButton(IconData icon, Color color, VoidCallback onTap) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
      child: InkWell(onTap: onTap, child: Icon(icon, color: color, size: 18)),
    );
  }
}
