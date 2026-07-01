import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminGmailBroadcastScreen extends StatefulWidget {
  const AdminGmailBroadcastScreen({super.key});

  @override
  State<AdminGmailBroadcastScreen> createState() => _AdminGmailBroadcastScreenState();
}

class _AdminGmailBroadcastScreenState extends State<AdminGmailBroadcastScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _subjectController = TextEditingController();
  final TextEditingController _messageController = TextEditingController();
  bool _isSending = false;
  String _selectedTarget = "all"; // all, hosts, agencies, helpers

  final List<Map<String, String>> _targets = [
    {"label": "All Users", "value": "all", "icon": "users"},
    {"label": "Official Hosts", "value": "hosts", "icon": "mic"},
    {"label": "Agency Owners", "value": "agencies", "icon": "building-2"},
    {"label": "Coin Traders", "value": "helpers", "icon": "coins"},
  ];

  Future<void> _sendBroadcast() async {
    if (_subjectController.text.isEmpty || _messageController.text.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Please fill all fields")));
      return;
    }

    setState(() => _isSending = true);
    try {
      // Simulate/Trigger Supabase RPC for broadcast
      await _api.getSupabase().from('admin_broadcast_logs').insert({
        'subject': _subjectController.text,
        'message': _messageController.text,
        'target_group': _selectedTarget,
        'sent_at': DateTime.now().toIso8601String(),
        'sent_by': _api.getSupabase().auth.currentUser?.id,
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Broadcast sent successfully! 🚀")));
        _subjectController.clear();
        _messageController.clear();
      }
    } catch (e) {
      debugPrint("Error sending broadcast: $e");
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to send broadcast")));
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(40),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(),
            const SizedBox(height: 40),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(flex: 2, child: _buildComposer()),
                const SizedBox(width: 40),
                Expanded(child: _buildTargetSelector()),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        FadeInLeft(
          child: Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.indigoAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.mail, color: Colors.white, size: 28),
          ),
        ),
        const SizedBox(width: 24),
        FadeInDown(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("GMAIL BROADCAST SYSTEM", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Send mass notifications and emails to specific user groups", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildComposer() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("MESSAGE COMPOSER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          _inputField("SUBJECT", _subjectController, LucideIcons.type),
          const SizedBox(height: 24),
          _textArea("MESSAGE BODY", _messageController, LucideIcons.alignLeft),
          const SizedBox(height: 32),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isSending ? null : _sendBroadcast,
              style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent, foregroundColor: Colors.white, padding: const EdgeInsets.all(24), shape: BorderRadius.circular(16)),
              child: _isSending ? const CircularProgressIndicator(color: Colors.white) : const Text("DISPATCH BROADCAST", style: TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.5)),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTargetSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("TARGET AUDIENCE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        const SizedBox(height: 24),
        ..._targets.map((t) => InkWell(
          onTap: () => setState(() => _selectedTarget = t['value']!),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: _selectedTarget == t['value'] ? Colors.blueAccent.withOpacity(0.1) : Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: _selectedTarget == t['value'] ? Colors.blueAccent : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                Icon(_resolveIcon(t['icon']!), color: _selectedTarget == t['value'] ? Colors.blueAccent : Colors.white24, size: 20),
                const SizedBox(width: 16),
                Text(t['label']!, style: TextStyle(color: _selectedTarget == t['value'] ? Colors.white : Colors.white38, fontWeight: FontWeight.bold)),
                const Spacer(),
                if (_selectedTarget == t['value']) const Icon(LucideIcons.checkCircle, color: Colors.blueAccent, size: 16),
              ],
            ),
          ),
        )),
      ],
    );
  }

  Widget _inputField(String label, TextEditingController controller, IconData icon) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
          child: TextField(
            controller: controller,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(border: InputBorder.none, icon: Icon(icon, color: Colors.white24, size: 16)),
          ),
        ),
      ],
    );
  }

  Widget _textArea(String label, TextEditingController controller, IconData icon) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
          child: TextField(
            controller: controller,
            maxLines: 8,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(border: InputBorder.none, icon: Icon(icon, color: Colors.white24, size: 16)),
          ),
        ),
      ],
    );
  }

  IconData _resolveIcon(String name) {
    switch (name) {
      case "users": return LucideIcons.users;
      case "mic": return LucideIcons.mic;
      case "building-2": return LucideIcons.building2;
      case "coins": return LucideIcons.coins;
      default: return LucideIcons.mail;
    }
  }
}
