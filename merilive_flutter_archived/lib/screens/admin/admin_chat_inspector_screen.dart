import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminChatInspectorScreen extends StatefulWidget {
  const AdminChatInspectorScreen({super.key});

  @override
  State<AdminChatInspectorScreen> createState() => _AdminChatInspectorScreenState();
}

class _AdminChatInspectorScreenState extends State<AdminChatInspectorScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _messages = [];

  @override
  void initState() {
    super.initState();
    _loadMessages();
  }

  Future<void> _loadMessages() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('chat_messages').select('*, user:profiles(display_name, app_uid)').order('created_at', ascending: false).limit(100);
      if (mounted) {
        setState(() {
          _messages = List<Map<String, dynamic>>.from(res);
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
              : _buildMessagesList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.cyan]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.messageSquare, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("GLOBAL CHAT INSPECTOR", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Monitor real-time chat messages across all rooms for moderation and compliance", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
      onPressed: _loadMessages,
      icon: const Icon(LucideIcons.refreshCw, size: 16),
      label: const Text("REFRESH FEED"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildMessagesList() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _messages.length,
      itemBuilder: (context, index) {
        final m = _messages[index];
        final user = m['user'] ?? {};

        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(user['display_name'] ?? 'User', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                  Text("ID: ${user['app_uid']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                ],
              ),
              const SizedBox(width: 32),
              Expanded(child: Text(m['message_text'] ?? '', style: const TextStyle(color: Colors.white70, fontSize: 13))),
              const SizedBox(width: 20),
              Text(DateFormat('hh:mm a').format(DateTime.parse(m['created_at'])), style: const TextStyle(color: Colors.white10, fontSize: 11)),
              const SizedBox(width: 24),
              _actionIconButton(LucideIcons.trash2, Colors.redAccent, () {}),
            ],
          ),
        );
      },
    );
  }

  Widget _actionIconButton(IconData icon, Color color, VoidCallback onTap) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
      child: InkWell(onTap: onTap, child: Icon(icon, color: color, size: 14)),
    );
  }
}
