import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminOnlineUsersScreen extends StatefulWidget {
  const AdminOnlineUsersScreen({super.key});

  @override
  State<AdminOnlineUsersScreen> createState() => _AdminOnlineUsersScreenState();
}

class _AdminOnlineUsersScreenState extends State<AdminOnlineUsersScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _users = [];

  @override
  void initState() {
    super.initState();
    _loadOnlineUsers();
  }

  Future<void> _loadOnlineUsers() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('profiles').select('id, display_name, app_uid, avatar_url, last_active_at').eq('is_online', true).order('last_active_at', ascending: false).limit(200);
      if (mounted) {
        setState(() {
          _users = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.emeraldAccent))
              : _buildUsersGrid(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.emerald, Colors.teal]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.users, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("REAL-TIME ONLINE USERS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Monitor currently active users, session stability and platform concurrency in real-time", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
            decoration: BoxDecoration(color: Colors.emeraldAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.emeraldAccent.withOpacity(0.2))),
            child: Row(
              children: [
                const Icon(LucideIcons.activity, color: Colors.emeraldAccent, size: 16),
                const SizedBox(width: 12),
                Text("${_users.length} ONLINE NOW", style: const TextStyle(color: Colors.emeraldAccent, fontWeight: FontWeight.bold, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildUsersGrid() {
    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 8, crossAxisSpacing: 20, mainAxisSpacing: 20, childAspectRatio: 0.8),
      itemCount: _users.length,
      itemBuilder: (context, index) {
        final u = _users[index];
        return FadeInUp(
          delay: Duration(milliseconds: 10 * index),
          child: Column(
            children: [
              Stack(
                children: [
                  CircleAvatar(radius: 32, backgroundImage: u['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(u['avatar_url'], bucket: 'avatars')) : null),
                  Positioned(right: 2, bottom: 2, child: Container(width: 12, height: 12, decoration: BoxDecoration(color: Colors.emeraldAccent, shape: BoxShape.circle, border: Border.all(color: const Color(0xFF020617), width: 2)))),
                ],
              ),
              const SizedBox(height: 12),
              Text(u['display_name'] ?? 'User', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
              Text("ID: ${u['app_uid']}", style: const TextStyle(color: Colors.white24, fontSize: 9)),
            ],
          ),
        );
      },
    );
  }
}
