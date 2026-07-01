import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminHelperRequestsScreen extends StatefulWidget {
  const AdminHelperRequestsScreen({super.key});

  @override
  State<AdminHelperRequestsScreen> createState() => _AdminHelperRequestsScreenState();
}

class _AdminHelperRequestsScreenState extends State<AdminHelperRequestsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _requests = [];

  @override
  void initState() {
    super.initState();
    _loadRequests();
  }

  Future<void> _loadRequests() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('helper_requests').select('*, user:profiles(display_name, app_uid, avatar_url)').eq('status', 'pending').order('created_at', ascending: false);
      if (mounted) {
        setState(() {
          _requests = List<Map<String, dynamic>>.from(res);
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
              : _buildRequestsList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.indigoAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.userPlus, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("TRADER RECRUITMENT", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Review requests from users who want to join the official diamond trader and helper program", style: TextStyle(color: Colors.white24, fontSize: 13)),
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
      onPressed: _loadRequests,
      icon: const Icon(LucideIcons.refreshCw, size: 16),
      label: const Text("REFRESH QUEUE"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildRequestsList() {
    if (_requests.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.userPlus, color: Colors.white.withOpacity(0.05), size: 100),
            const SizedBox(height: 24),
            const Text("No pending trader recruitment requests", style: TextStyle(color: Colors.white10, fontSize: 18)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _requests.length,
      itemBuilder: (context, index) {
        final req = _requests[index];
        final user = req['user'] ?? {};
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              CircleAvatar(radius: 28, backgroundImage: user['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(user['avatar_url'], bucket: 'avatars')) : null),
              const SizedBox(width: 24),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user['display_name'] ?? 'Applicant', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                    Text("ID: ${user['app_uid'] ?? 'N/A'}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                  ],
                ),
              ),
              _actionIconButton(LucideIcons.check, Colors.emeraldAccent, () {}),
              const SizedBox(width: 12),
              _actionIconButton(LucideIcons.x, Colors.redAccent, () {}),
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
