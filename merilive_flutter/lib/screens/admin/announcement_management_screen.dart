import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AnnouncementManagementScreen extends StatefulWidget {
  const AnnouncementManagementScreen({super.key});

  @override
  State<AnnouncementManagementScreen> createState() => _AnnouncementManagementScreenState();
}

class _AnnouncementManagementScreenState extends State<AnnouncementManagementScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _titleController = TextEditingController();
  final TextEditingController _messageController = TextEditingController();
  
  bool _isLoading = true;
  bool _isSending = false;
  List<Map<String, dynamic>> _notices = [];
  String _selectedPriority = 'normal';
  List<String> _selectedAudiences = ['all'];

  @override
  void initState() {
    super.initState();
    _loadNotices();
  }

  Future<void> _loadNotices() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('admin_notices').select('*').order('created_at', ascending: false).limit(20);
      setState(() {
        _notices = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading notices: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _sendNotice() async {
    if (_titleController.text.isEmpty || _messageController.text.isEmpty) return;
    
    setState(() => _isSending = true);
    try {
      final supa = _api.getSupabase();
      await supa.from('admin_notices').insert({
        'title': _titleController.text,
        'message': _messageController.text,
        'target_audience': _selectedAudiences,
        'priority': _selectedPriority,
        'is_active': true,
        'created_at': DateTime.now().toIso8601String(),
      });
      
      _titleController.clear();
      _messageController.clear();
      _loadNotices();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Announcement Broadcasted Successfully! 📢")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
    } finally {
      if (mounted) setState(() => _isSending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Row(
        children: [
          // Left Side: Compose Notice
          Expanded(
            flex: 2,
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(),
                  const SizedBox(height: 40),
                  _buildComposer(),
                ],
              ),
            ),
          ),
          // Right Side: Recent History
          Expanded(
            flex: 3,
            child: Container(
              margin: const EdgeInsets.all(32),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
              child: _buildHistoryList(),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("NOTICE BROADCAST CENTER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
        const Text("Compose and send high-priority announcements to specific user segments", style: TextStyle(color: Colors.white38, fontSize: 14)),
      ],
    );
  }

  Widget _buildComposer() {
    return FadeInLeft(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildFieldLabel("Announcement Title"),
          _buildTextField(_titleController, "e.g. System Maintenance Scheduled"),
          const SizedBox(height: 24),
          _buildFieldLabel("Broadcast Message"),
          _buildTextField(_messageController, "Enter your message details...", maxLines: 6),
          const SizedBox(height: 24),
          _buildFieldLabel("Priority Level"),
          _buildPrioritySelector(),
          const SizedBox(height: 40),
          SizedBox(
            width: double.infinity,
            height: 64,
            child: ElevatedButton.icon(
              onPressed: _isSending ? null : _sendNotice,
              icon: _isSending ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(LucideIcons.send, size: 18),
              label: Text(_isSending ? "SENDING..." : "BROADCAST NOW", style: const TextStyle(fontWeight: FontWeight.bold, letterSpacing: 1.2)),
              style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20))),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFieldLabel(String label) {
    return Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(label.toUpperCase(), style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5)));
  }

  Widget _buildTextField(TextEditingController controller, String hint, {int maxLines = 1}) {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        style: const TextStyle(color: Colors.white, fontSize: 14),
        decoration: InputDecoration(hintText: hint, hintStyle: const TextStyle(color: Colors.white10), border: InputBorder.none, contentPadding: const EdgeInsets.all(20)),
      ),
    );
  }

  Widget _buildPrioritySelector() {
    final priorities = [
      {'id': 'low', 'label': 'LOW', 'color': Colors.blueAccent},
      {'id': 'normal', 'label': 'NORMAL', 'color': Colors.cyanAccent},
      {'id': 'high', 'label': 'HIGH', 'color': Colors.orangeAccent},
      {'id': 'urgent', 'label': 'URGENT', 'color': Colors.redAccent},
    ];

    return Row(
      children: priorities.map((p) {
        final isSelected = _selectedPriority == p['id'];
        final Color color = p['color'] as Color;
        return Expanded(
          child: GestureDetector(
            onTap: () => setState(() => _selectedPriority = p['id'] as String),
            child: Container(
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                color: isSelected ? color.withOpacity(0.1) : Colors.white.withOpacity(0.02),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: isSelected ? color.withOpacity(0.5) : Colors.white10),
              ),
              child: Center(child: Text(p['label'] as String, style: TextStyle(color: isSelected ? color : Colors.white24, fontSize: 11, fontWeight: FontWeight.bold))),
            ),
          ),
        );
      }).toList(),
    );
  }

  Widget _buildHistoryList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(padding: const EdgeInsets.all(32), child: Text("RECENT BROADCASTS", style: GoogleFonts.outfit(color: Colors.white70, fontWeight: FontWeight.bold, fontSize: 14))),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            itemCount: _notices.length,
            itemBuilder: (context, index) {
              final notice = _notices[index];
              return _buildNoticeCard(notice);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildNoticeCard(Map<String, dynamic> n) {
    final priority = n['priority'] ?? 'normal';
    final Color color = priority == 'urgent' ? Colors.redAccent : (priority == 'high' ? Colors.orangeAccent : Colors.cyanAccent);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6)), child: Text(priority.toUpperCase(), style: TextStyle(color: color, fontSize: 8, fontWeight: FontWeight.bold))),
              Text(DateFormat('MMM dd, hh:mm a').format(DateTime.parse(n['created_at'])), style: const TextStyle(color: Colors.white24, fontSize: 10)),
            ],
          ),
          const SizedBox(height: 12),
          Text(n['title'] ?? '', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 4),
          Text(n['message'] ?? '', style: const TextStyle(color: Colors.white38, fontSize: 13), maxLines: 2, overflow: TextOverflow.ellipsis),
        ],
      ),
    );
  }
}
