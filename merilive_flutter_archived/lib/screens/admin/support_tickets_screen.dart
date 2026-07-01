import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class SupportTicketsScreen extends StatefulWidget {
  const SupportTicketsScreen({super.key});

  @override
  State<SupportTicketsScreen> createState() => _SupportTicketsScreenState();
}

class _SupportTicketsScreenState extends State<SupportTicketsScreen> {
  final ApiService _api = ApiService();
  List<Map<String, dynamic>> _tickets = [];
  bool _isLoading = true;
  String _currentFilter = 'all';

  @override
  void initState() {
    super.initState();
    _loadTickets();
  }

  Future<void> _loadTickets() async {
    setState(() => _isLoading = true);
    final res = await _api.getAdminSupportTickets();
    setState(() {
      _tickets = res;
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildHeader(),
          const SizedBox(height: 24),
          _buildFilters(),
          const SizedBox(height: 24),
          Expanded(child: _buildTicketList()),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("SUPPORT TICKETS HUD", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
        const Text("Manage user complaints and resolution workflows", style: TextStyle(color: Colors.white38, fontSize: 13)),
      ],
    );
  }

  Widget _buildFilters() {
    return Row(
      children: [
        _buildFilterBtn('all', 'All'),
        const SizedBox(width: 8),
        _buildFilterBtn('open', 'Open'),
        const SizedBox(width: 8),
        _buildFilterBtn('resolved', 'Resolved'),
        const SizedBox(width: 8),
        _buildFilterBtn('closed', 'Closed'),
      ],
    );
  }

  Widget _buildFilterBtn(String id, String label) {
    bool isSel = _currentFilter == id;
    return GestureDetector(
      onTap: () => setState(() => _currentFilter = id),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(
          color: isSel ? const Color(0xFF6366F1) : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(label, style: TextStyle(color: isSel ? Colors.white : Colors.white24, fontSize: 12, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildTicketList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    
    final filtered = _tickets.where((t) {
      if (_currentFilter == 'all') return true;
      return t['status'] == _currentFilter;
    }).toList();

    if (filtered.isEmpty) return const Center(child: Text("No tickets found", style: TextStyle(color: Colors.white24)));

    return ListView.builder(
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final t = filtered[index];
        return _buildTicketCard(t, index);
      },
    );
  }

  Widget _buildTicketCard(Map<String, dynamic> t, int index) {
    final status = t['status'] as String;
    final color = _getStatusColor(status);
    
    return FadeInUp(
      delay: Duration(milliseconds: 50 * index),
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.03),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: color.withOpacity(0.1)),
        ),
        child: Row(
          children: [
             _buildUserAvatar(t['user']),
             const SizedBox(width: 16),
             Expanded(
               child: Column(
                 crossAxisAlignment: CrossAxisAlignment.start,
                 children: [
                   Row(
                     children: [
                       Text(t['user']?['display_name'] ?? 'Guest', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                       const SizedBox(width: 12),
                       _buildStatusChip(status, color),
                     ],
                   ),
                   const SizedBox(height: 8),
                   Text(t['issue_description'] ?? 'No description provided', style: const TextStyle(color: Colors.white70, fontSize: 14), maxLines: 2, overflow: TextOverflow.ellipsis),
                   const SizedBox(height: 12),
                   Text("ID: ${t['id'].toString().substring(0,8)} \u2022 ${DateFormat('MMM dd, yyyy').format(DateTime.parse(t['created_at']))}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                 ],
               ),
             ),
             _buildActionIcon(LucideIcons.chevronRight, Colors.white24, () {}),
          ],
        ),
      ),
    );
  }

  Widget _buildUserAvatar(Map<String, dynamic>? user) {
    return CircleAvatar(
      radius: 12,
      backgroundImage: user?['avatar_url'] != null ? NetworkImage(user!['avatar_url']) : null,
      backgroundColor: Colors.white10,
    );
  }

  Widget _buildStatusChip(String status, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
      child: Text(status.toUpperCase(), style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold)),
    );
  }

  Color _getStatusColor(String status) {
    switch (status) {
      case 'open': return Colors.amber;
      case 'resolved': return Colors.greenAccent;
      case 'closed': return Colors.redAccent;
      default: return Colors.white38;
    }
  }

  Widget _buildActionIcon(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle),
        child: Icon(icon, color: Colors.white, size: 18),
      ),
    );
  }
}


