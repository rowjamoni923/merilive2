import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminUserReportsScreen extends StatefulWidget {
  const AdminUserReportsScreen({super.key});

  @override
  State<AdminUserReportsScreen> createState() => _AdminUserReportsScreenState();
}

class _AdminUserReportsScreenState extends State<AdminUserReportsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _reports = [];
  String _statusFilter = "all";
  String _searchQuery = "";

  final Map<String, dynamic> _categoryLabels = {
    'sexual_content': {'label': "Sexual Content", 'color': Colors.pinkAccent},
    'harassment_bullying': {'label': "Harassment", 'color': Colors.redAccent},
    'hate_speech': {'label': "Hate Speech", 'color': Colors.orangeAccent},
    'violence_threats': {'label': "Violence", 'color': Colors.red},
    'spam_scam': {'label': "Spam/Scam", 'color': Colors.amberAccent},
    'impersonation': {'label': "Impersonation", 'color': Colors.purpleAccent},
  };

  @override
  void initState() {
    super.initState();
    _loadReports();
  }

  Future<void> _loadReports() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      var query = supa.from("user_reports").select('*, reporter:profiles!user_reports_reporter_id_fkey(display_name, avatar_url), reported_user:profiles!user_reports_reported_user_id_fkey(display_name, avatar_url, is_host)');
      
      if (_statusFilter != "all") {
        query = query.eq("status", _statusFilter);
      }

      final res = await query.order("created_at", ascending: false).limit(100);
      
      setState(() {
        _reports = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading reports: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleUpdateStatus(String reportId, String status) async {
    try {
      await _api.getSupabase().from("user_reports").update({
        'status': status,
        'reviewed_at': DateTime.now().toIso8601String(),
      }).eq('id', reportId);
      _loadReports();
    } catch (e) {
      debugPrint("Error updating report: $e");
    }
  }

  Future<void> _handleBlockUser(String userId, String reportId) async {
    try {
      await _api.getSupabase().rpc("admin_block_user", params: {'_user_id': userId, '_block': true});
      await _handleUpdateStatus(reportId, "resolved");
    } catch (e) {
      debugPrint("Error blocking user: $e");
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
              : _buildReportsList(),
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
        gradient: const LinearGradient(colors: [Color(0xFFEF4444), Color(0xFFDB2777)]),
        borderRadius: BorderRadius.circular(32),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
            child: const Icon(LucideIcons.shieldAlert, color: Colors.white, size: 32),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("USER REPORTS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
              const Text("Review and manage reported violations across the platform", style: TextStyle(color: Colors.white70)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatsStrip() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        children: [
          _statBox("TOTAL REPORTS", _reports.length.toString(), LucideIcons.fileText, Colors.blueAccent),
          const SizedBox(width: 16),
          _statBox("PENDING", _reports.where((r) => r['status'] == 'pending').length.toString(), LucideIcons.clock, Colors.amberAccent),
          const SizedBox(width: 16),
          _statBox("RESOLVED", _reports.where((r) => r['status'] == 'resolved').length.toString(), LucideIcons.checkCircle, Colors.greenAccent),
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
        value: _statusFilter,
        dropdownColor: const Color(0xFF1E293B),
        underline: const SizedBox(),
        items: const [
          DropdownMenuItem(value: "all", child: Text("All Reports", style: TextStyle(color: Colors.white, fontSize: 12))),
          DropdownMenuItem(value: "pending", child: Text("Pending", style: TextStyle(color: Colors.white, fontSize: 12))),
          DropdownMenuItem(value: "resolved", child: Text("Resolved", style: TextStyle(color: Colors.white, fontSize: 12))),
          DropdownMenuItem(value: "dismissed", child: Text("Dismissed", style: TextStyle(color: Colors.white, fontSize: 12))),
        ],
        onChanged: (v) {
          setState(() => _statusFilter = v!);
          _loadReports();
        },
      ),
    );
  }

  Widget _buildReportsList() {
    if (_reports.isEmpty) return const Center(child: Text("No reports found", style: TextStyle(color: Colors.white24)));
    
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      itemCount: _reports.length,
      itemBuilder: (context, index) {
        final report = _reports[index];
        final reportedUser = report['reported_user'] ?? {};
        final reporter = report['reporter'] ?? {};
        final cat = _categoryLabels[report['report_category']] ?? {'label': report['report_category'], 'color': Colors.grey};
        final bool isPending = report['status'] == 'pending';
        
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Row(
              children: [
                Column(
                  children: [
                    CircleAvatar(backgroundImage: NetworkImage(reportedUser['avatar_url'] ?? ''), radius: 24, backgroundColor: Colors.redAccent.withOpacity(0.1)),
                    const SizedBox(height: 4),
                    const Text("REPORTED", style: TextStyle(color: Colors.redAccent, fontSize: 7, fontWeight: FontWeight.bold)),
                  ],
                ),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(reportedUser['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      Text("By: ${reporter['display_name'] ?? 'Anonymous'}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                    ],
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: cat['color'].withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Text(cat['label'].toString().toUpperCase(), style: TextStyle(color: cat['color'], fontSize: 9, fontWeight: FontWeight.bold))),
                      const SizedBox(height: 4),
                      Text(report['description'] ?? 'No description provided', style: const TextStyle(color: Colors.white70, fontSize: 12), maxLines: 2, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                const SizedBox(width: 20),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(DateFormat('dd MMM, hh:mm a').format(DateTime.parse(report['created_at'])), style: const TextStyle(color: Colors.white24, fontSize: 10)),
                    const SizedBox(height: 12),
                    if (isPending) Row(
                      children: [
                        _actionBtn(LucideIcons.xCircle, Colors.white24, () => _handleUpdateStatus(report['id'], 'dismissed')),
                        const SizedBox(width: 8),
                        _actionBtn(LucideIcons.checkCircle, Colors.greenAccent, () => _handleUpdateStatus(report['id'], 'resolved')),
                        const SizedBox(width: 8),
                        _actionBtn(LucideIcons.ban, Colors.redAccent, () => _handleBlockUser(report['reported_user_id'], report['id'])),
                      ],
                    ) else Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(8)), child: Text(report['status'].toString().toUpperCase(), style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold))),
                  ],
                ),
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
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.2))),
        child: Icon(icon, color: color, size: 14),
      ),
    );
  }
}
