import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminFaceViolationsScreen extends StatefulWidget {
  const AdminFaceViolationsScreen({super.key});

  @override
  State<AdminFaceViolationsScreen> createState() => _AdminFaceViolationsScreenState();
}

class _AdminFaceViolationsScreenState extends State<AdminFaceViolationsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _violations = [];
  String _filterType = "all";
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _loadViolations();
  }

  Future<void> _loadViolations() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      var query = supa.from("live_face_violations").select('*, profiles:host_id(display_name, avatar_url, app_uid)');
      
      if (_filterType == "unreviewed") {
        query = query.eq("admin_reviewed", false);
      } else if (_filterType == "reviewed") {
        query = query.eq("admin_reviewed", true);
      }

      final res = await query.order("created_at", ascending: false).limit(100);
      
      setState(() {
        _violations = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading face violations: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleAction(String violationId, String action) async {
    try {
      final supa = _api.getSupabase();
      await supa.from("live_face_violations").update({
        'admin_reviewed': true,
        'reviewed_at': DateTime.now().toIso8601String(),
        'action_taken': action,
      }).eq('id', violationId);
      
      if (action == 'live_ban') {
        // Logic to insert into live_bans or relevant table
      }
      
      _loadViolations();
    } catch (e) {
      debugPrint("Error updating violation: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        children: [
          _buildHeader(),
          _buildStatsStrip(),
          const SizedBox(height: 24),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.redAccent))
              : _buildViolationsList(),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(48),
      margin: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFFDC2626), Color(0xFF991B1B)]),
        borderRadius: BorderRadius.circular(32),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
            child: const Icon(LucideIcons.eyeOff, color: Colors.white, size: 32),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("FACE VIOLATIONS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
              const Text("Monitor face detection failures and auto-closed live streams", style: TextStyle(color: Colors.white70)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatsStrip() {
    final unreviewedCount = _violations.where((v) => v['admin_reviewed'] == false).length;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        children: [
          _statBox("TOTAL VIOLATIONS", _violations.length.toString(), LucideIcons.alertTriangle, Colors.orangeAccent),
          const SizedBox(width: 16),
          _statBox("PENDING REVIEW", unreviewedCount.toString(), LucideIcons.clock, Colors.redAccent),
          const Spacer(),
          _filterDropdown(),
        ],
      ),
    );
  }

  Widget _statBox(String label, String val, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.1))),
      child: Row(
        children: [
          Icon(icon, color: color, size: 16),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(val, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
              Text(label, style: const TextStyle(color: Colors.white24, fontSize: 8, fontWeight: FontWeight.bold, letterSpacing: 1)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _filterDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white10)),
      child: DropdownButton<String>(
        value: _filterType,
        dropdownColor: const Color(0xFF1E293B),
        underline: const SizedBox(),
        items: const [
          DropdownMenuItem(value: "all", child: Text("All Logs", style: TextStyle(color: Colors.white, fontSize: 12))),
          DropdownMenuItem(value: "unreviewed", child: Text("Pending Review", style: TextStyle(color: Colors.white, fontSize: 12))),
          DropdownMenuItem(value: "reviewed", child: Text("Reviewed", style: TextStyle(color: Colors.white, fontSize: 12))),
        ],
        onChanged: (v) {
          setState(() => _filterType = v!);
          _loadViolations();
        },
      ),
    );
  }

  Widget _buildViolationsList() {
    if (_violations.isEmpty) return const Center(child: Text("No face violations found", style: TextStyle(color: Colors.white24)));
    
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      itemCount: _violations.length,
      itemBuilder: (context, index) {
        final v = _violations[index];
        final host = v['profiles'] ?? {};
        final bool isReviewed = v['admin_reviewed'] ?? false;
        
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: !isReviewed ? Colors.redAccent.withOpacity(0.02) : Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: !isReviewed ? Colors.redAccent.withOpacity(0.1) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                CircleAvatar(backgroundImage: NetworkImage(host['avatar_url'] ?? ''), radius: 24, backgroundColor: Colors.redAccent.withOpacity(0.1)),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(host['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      Text("UID: ${host['app_uid'] ?? '-'}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                    ],
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Text(v['violation_type'].toString().toUpperCase(), style: const TextStyle(color: Colors.redAccent, fontSize: 9, fontWeight: FontWeight.bold))),
                          const SizedBox(width: 8),
                          if (v['auto_closed'] == true) Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.orangeAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: const Text("AUTO-CLOSED", style: TextStyle(color: Colors.orangeAccent, fontSize: 9, fontWeight: FontWeight.bold))),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(DateFormat('dd MMM yyyy, hh:mm a').format(DateTime.parse(v['created_at'])), style: const TextStyle(color: Colors.white70, fontSize: 11)),
                    ],
                  ),
                ),
                const SizedBox(width: 20),
                if (!isReviewed) Row(
                  children: [
                    _actionBtn(LucideIcons.checkCircle, Colors.greenAccent, () => _handleAction(v['id'], 'warning')),
                    const SizedBox(width: 8),
                    _actionBtn(LucideIcons.ban, Colors.redAccent, () => _handleAction(v['id'], 'live_ban')),
                  ],
                ) else Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)), child: Row(children: [const Icon(LucideIcons.shield, color: Colors.white24, size: 12), const SizedBox(width: 6), Text(v['action_taken'].toString().toUpperCase(), style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold))])),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _actionBtn(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: color.withOpacity(0.2))),
        child: Icon(icon, color: color, size: 16),
      ),
    );
  }
}
