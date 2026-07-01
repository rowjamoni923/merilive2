import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminNoticeBroadcastScreen extends StatefulWidget {
  const AdminNoticeBroadcastScreen({super.key});

  @override
  State<AdminNoticeBroadcastScreen> createState() => _AdminNoticeBroadcastScreenState();
}

class _AdminNoticeBroadcastScreenState extends State<AdminNoticeBroadcastScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _notices = [];

  @override
  void initState() {
    super.initState();
    _loadNotices();
  }

  Future<void> _loadNotices() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('admin_notices').select().order('created_at', ascending: false).limit(50);
      if (mounted) {
        setState(() {
          _notices = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.orangeAccent))
              : _buildNoticesList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.orange, Colors.redAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.megaphone, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("SYSTEM NOTICE BROADCAST", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Broadcast targeted in-app announcements and priority alerts to specific user segments", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.send, size: 16),
            label: const Text("COMPOSE NOTICE"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildNoticesList() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _notices.length,
      itemBuilder: (context, index) {
        final n = _notices[index];
        final bool isActive = n['is_active'] ?? true;

        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: isActive ? Colors.orangeAccent.withOpacity(0.1) : Colors.white.withOpacity(0.03))),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Text(n['title'] ?? 'Notice', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                            const SizedBox(width: 12),
                            Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: (n['priority'] == 'urgent' ? Colors.redAccent : Colors.orangeAccent).withOpacity(0.1), borderRadius: BorderRadius.circular(4)), child: Text(n['priority']?.toString().toUpperCase() ?? 'NORMAL', style: TextStyle(color: n['priority'] == 'urgent' ? Colors.redAccent : Colors.orangeAccent, fontSize: 8, fontWeight: FontWeight.bold))),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(DateFormat('MMM dd, hh:mm a').format(DateTime.parse(n['created_at'])), style: const TextStyle(color: Colors.white10, fontSize: 11)),
                      ],
                    ),
                  ),
                  _actionBtn(LucideIcons.eye, Colors.white12, () {}),
                  const SizedBox(width: 12),
                  _actionBtn(LucideIcons.trash2, Colors.redAccent.withOpacity(0.1), () {}),
                ],
              ),
              const SizedBox(height: 20),
              Text(n['message'] ?? '', style: const TextStyle(color: Colors.white54, fontSize: 13, height: 1.5)),
              const SizedBox(height: 20),
              Wrap(
                spacing: 8,
                children: (n['target_audience'] as List<dynamic>? ?? ['all']).map((a) => Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(6)), child: Text(a.toString().toUpperCase(), style: const TextStyle(color: Colors.white38, fontSize: 9, fontWeight: FontWeight.bold)))).toList(),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _actionBtn(IconData icon, Color bg, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      child: Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)), child: Icon(icon, color: Colors.white, size: 14)),
    );
  }
}
