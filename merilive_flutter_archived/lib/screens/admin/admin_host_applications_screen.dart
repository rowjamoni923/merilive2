import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminHostApplicationsScreen extends StatefulWidget {
  const AdminHostApplicationsScreen({super.key});

  @override
  State<AdminHostApplicationsScreen> createState() => _AdminHostApplicationsScreenState();
}

class _AdminHostApplicationsScreenState extends State<AdminHostApplicationsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _applications = [];
  String _statusFilter = 'pending';

  @override
  void initState() {
    super.initState();
    _loadApplications();
  }

  Future<void> _loadApplications() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('host_applications')
        .select('*, user:profiles!host_applications_user_id_fkey(display_name, avatar_url, app_uid, gender, country_code), agency:agencies(name, id)')
        .eq('status', _statusFilter)
        .order('created_at', ascending: false);
      
      if (mounted) {
        setState(() {
          _applications = List<Map<String, dynamic>>.from(res);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Error loading host apps: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _processApplication(String id, String status) async {
    try {
      await _api.getSupabase().rpc('admin_process_host_application', params: {
        '_application_id': id,
        '_status': status,
        '_processed_by': _api.getSupabase().auth.currentUser?.id,
      });
      _loadApplications();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Application $status successfully")));
      }
    } catch (e) {
      debugPrint("Error processing app: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF020617),
      body: Column(
        children: [
          _buildHeader(),
          _buildFilterBar(),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.blueAccent))
              : _applications.isEmpty 
                ? const Center(child: Text("No applications found", style: TextStyle(color: Colors.white24)))
                : ListView.builder(
                    padding: const EdgeInsets.all(40),
                    itemCount: _applications.length,
                    itemBuilder: (context, index) => _buildAppCard(_applications[index]),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(40),
      child: Row(
        children: [
          FadeInLeft(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.pink, Colors.purpleAccent]), borderRadius: BorderRadius.circular(16)),
              child: const Icon(LucideIcons.userPlus, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(width: 24),
          FadeInDown(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("HOST APPLICATIONS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                const Text("Review and manage new host requests for official status", style: TextStyle(color: Colors.white24, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 40),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(12)),
      child: Row(
        children: [
          _filterBtn("PENDING", "pending", Colors.yellowAccent),
          _filterBtn("APPROVED", "approved", Colors.emeraldAccent),
          _filterBtn("REJECTED", "rejected", Colors.redAccent),
        ],
      ),
    );
  }

  Widget _filterBtn(String label, String val, Color color) {
    final bool isSelected = _statusFilter == val;
    return Expanded(
      child: InkWell(
        onTap: () {
          setState(() => _statusFilter = val);
          _loadApplications();
        },
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(color: isSelected ? color.withOpacity(0.1) : Colors.transparent, borderRadius: BorderRadius.circular(10)),
          child: Center(child: Text(label, style: TextStyle(color: isSelected ? color : Colors.white24, fontSize: 10, fontWeight: FontWeight.bold))),
        ),
      ),
    );
  }

  Widget _buildAppCard(Map<String, dynamic> app) {
    final user = app['user'] ?? {};
    final agency = app['agency'] ?? {};

    return Container(
      margin: const EdgeInsets.only(bottom: 20),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        children: [
          CircleAvatar(
            radius: 32,
            backgroundImage: user['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(user['avatar_url'], bucket: 'avatars')) : null,
          ),
          const SizedBox(width: 24),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(user['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                    const SizedBox(width: 12),
                    Icon(user['gender'] == 'female' ? LucideIcons.venus : LucideIcons.mars, color: user['gender'] == 'female' ? Colors.pinkAccent : Colors.blueAccent, size: 14),
                  ],
                ),
                Text("ID: ${user['app_uid'] ?? ''} • ${user['country_code'] ?? ''}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
                const SizedBox(height: 8),
                Text("Applied for Agency: ${agency['name'] ?? 'N/A'}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
              ],
            ),
          ),
          if (_statusFilter == 'pending') ...[
            _actionBtn("REJECT", Colors.redAccent, () => _processApplication(app['id'], 'rejected')),
            const SizedBox(width: 12),
            _actionBtn("APPROVE", Colors.emeraldAccent, () => _processApplication(app['id'], 'approved')),
          ] else
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(color: (_statusFilter == 'approved' ? Colors.emeraldAccent : Colors.redAccent).withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
              child: Text(_statusFilter.toUpperCase(), style: TextStyle(color: _statusFilter == 'approved' ? Colors.emeraldAccent : Colors.redAccent, fontSize: 10, fontWeight: FontWeight.bold)),
            ),
        ],
      ),
    );
  }

  Widget _actionBtn(String label, Color color, VoidCallback onTap) {
    return ElevatedButton(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(backgroundColor: color.withOpacity(0.1), foregroundColor: color, elevation: 0, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: color.withOpacity(0.2)))),
      child: Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
    );
  }
}
