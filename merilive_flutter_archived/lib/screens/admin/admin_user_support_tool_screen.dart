import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminUserSupportToolScreen extends StatefulWidget {
  const AdminUserSupportToolScreen({super.key});

  @override
  State<AdminUserSupportToolScreen> createState() => _AdminUserSupportToolScreenState();
}

class _AdminUserSupportToolScreenState extends State<AdminUserSupportToolScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _searchController = TextEditingController();
  bool _isLoading = false;
  Map<String, dynamic>? _selectedUser;
  List<Map<String, dynamic>> _userLogs = [];

  Future<void> _searchUser() async {
    if (_searchController.text.isEmpty) return;
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('profiles').select('*, user_stats(*)').or('username.eq.${_searchController.text},app_uid.eq.${_searchController.text}').maybeSingle();
      
      if (res != null) {
        // Load some logs for this user
        final logs = await supa.from('admin_audit_logs').select().eq('target_id', res['id']).order('created_at', ascending: false).limit(20);
        setState(() {
          _selectedUser = res;
          _userLogs = List<Map<String, dynamic>>.from(logs);
        });
      }
    } catch (e) {
      debugPrint("Error searching user: $e");
    } finally {
      setState(() => _isLoading = false);
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
            _buildSearchBar(),
            const SizedBox(height: 40),
            if (_selectedUser != null) _buildUserDetailView()
            else _buildInitialState(),
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
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.cyanAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.headphones, color: Colors.white, size: 28),
          ),
        ),
        const SizedBox(width: 24),
        FadeInDown(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("USER SUPPORT TOOL", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Advanced user inspection, chat auditing, and issue resolution engine", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSearchBar() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("SEARCH USER BY UID OR USERNAME", style: TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
                  child: TextField(
                    controller: _searchController,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(hintText: "Enter UID or Username...", hintStyle: TextStyle(color: Colors.white10), border: InputBorder.none),
                    onSubmitted: (v) => _searchUser(),
                  ),
                ),
              ),
              const SizedBox(width: 20),
              ElevatedButton(
                onPressed: _isLoading ? null : _searchUser,
                style: ElevatedButton.styleFrom(backgroundColor: Colors.blueAccent, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 24), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                child: _isLoading ? const CircularProgressIndicator(color: Colors.white) : const Text("INSPECT USER", style: TextStyle(fontWeight: FontWeight.bold)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildUserDetailView() {
    return Column(
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(flex: 1, child: _buildUserProfileCard()),
            const SizedBox(width: 40),
            Expanded(flex: 2, child: _buildAuditLogList()),
          ],
        ),
      ],
    );
  }

  Widget _buildUserProfileCard() {
    final user = _selectedUser!;
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        children: [
          CircleAvatar(radius: 60, backgroundImage: user['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(user['avatar_url'], bucket: 'avatars')) : null),
          const SizedBox(height: 24),
          Text(user['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)),
          Text("@${user['username']}", style: const TextStyle(color: Colors.blueAccent, fontSize: 14)),
          const SizedBox(height: 32),
          _infoRow("UID", user['app_uid']?.toString() ?? 'N/A'),
          _infoRow("LEVEL", "Lv.${user['level'] ?? 0}"),
          _infoRow("COINS", "${user['coins'] ?? 0} 💎"),
          _infoRow("BEANS", "${user['beans'] ?? 0} 🫘"),
          const SizedBox(height: 32),
          const Divider(color: Colors.white10),
          const SizedBox(height: 32),
          Row(
            children: [
              Expanded(child: _actionBtn("BAN USER", Colors.redAccent, () {})),
              const SizedBox(width: 12),
              Expanded(child: _actionBtn("MUTE USER", Colors.orangeAccent, () {})),
            ],
          ),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white24, fontSize: 11, fontWeight: FontWeight.bold)),
          Text(value, style: const TextStyle(color: Colors.white70, fontSize: 14, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _actionBtn(String label, Color color, VoidCallback onTap) {
    return ElevatedButton(
      onPressed: onTap,
      style: ElevatedButton.styleFrom(backgroundColor: color.withOpacity(0.1), foregroundColor: color, elevation: 0, padding: const EdgeInsets.symmetric(vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: color.withOpacity(0.2)))),
      child: Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 11)),
    );
  }

  Widget _buildAuditLogList() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text("USER AUDIT LOGS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 24),
          if (_userLogs.isEmpty) const Center(child: Padding(padding: EdgeInsets.all(40), child: Text("No audit history found", style: TextStyle(color: Colors.white10))))
          else ListView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _userLogs.length,
            itemBuilder: (context, index) {
              final log = _userLogs[index];
              return Padding(
                padding: const EdgeInsets.only(bottom: 16),
                child: Row(
                  children: [
                    Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle), child: const Icon(LucideIcons.activity, color: Colors.blueAccent, size: 14)),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(log['description'] ?? 'Admin Action', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                          Text(log['created_at']?.toString() ?? '', style: const TextStyle(color: Colors.white10, fontSize: 10)),
                        ],
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }

  Widget _buildInitialState() {
    return Center(
      child: Column(
        children: [
          const SizedBox(height: 100),
          Icon(LucideIcons.search, color: Colors.white.withOpacity(0.05), size: 100),
          const SizedBox(height: 24),
          const Text("Enter user credentials to start audit", style: TextStyle(color: Colors.white10, fontSize: 16)),
        ],
      ),
    );
  }
}
