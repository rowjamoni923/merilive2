import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminLiveBansScreen extends StatefulWidget {
  const AdminLiveBansScreen({super.key});

  @override
  State<AdminLiveBansScreen> createState() => _AdminLiveBansScreenState();
}

class _AdminLiveBansScreenState extends State<AdminLiveBansScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  List<Map<String, dynamic>> _bans = [];
  Map<String, dynamic> _moderationSettings = {};
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      // Load Bans with profile info
      final bansRes = await supa
          .from('live_bans')
          .select('*, profiles(display_name, avatar_url, app_uid)')
          .order('created_at', ascending: false);

      // Load Moderation Settings
      final settingsRes = await supa.from('live_moderation_settings').select('*');

      setState(() {
        _bans = List<Map<String, dynamic>>.from(bansRes);
        _moderationSettings = { for (var e in (settingsRes as List)) e['setting_key'] : e['setting_value'] };
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading live bans: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleUnban(String banId) async {
    try {
      await _api.getSupabase().from('live_bans').update({
        'is_active': false,
        'unbanned_at': DateTime.now().toIso8601String(),
        'unban_reason': 'Unbanned by Admin'
      }).eq('id', banId);
      _loadData();
    } catch (e) {
      debugPrint("Error unbanning: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        children: [
          _buildHeader(),
          _buildTabs(),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.redAccent))
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildBansList(),
                    _buildSettingsView(),
                  ],
                ),
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
        gradient: const LinearGradient(colors: [Color(0xFFEF4444), Color(0xFFE11D48)]),
        borderRadius: BorderRadius.circular(32),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(LucideIcons.shieldAlert, color: Colors.white, size: 32),
                  const SizedBox(width: 20),
                  Text("LIVE MODERATION", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                ],
              ),
              const Text("Manage active bans, auto-detection and violation policies", style: TextStyle(color: Colors.white70)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () => _showNewBanDialog(),
            icon: const Icon(LucideIcons.userX),
            label: const Text("CREATE NEW BAN"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white.withOpacity(0.2), foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      child: TabBar(
        controller: _tabController,
        indicatorColor: Colors.redAccent,
        indicatorWeight: 4,
        dividerColor: Colors.white.withOpacity(0.05),
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white24,
        tabs: const [Tab(text: "ACTIVE & HISTORY"), Tab(text: "AI SETTINGS")],
      ),
    );
  }

  Widget _buildBansList() {
    return Column(
      children: [
        _buildSearchBar(),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 32),
            itemCount: _bans.length,
            itemBuilder: (context, index) {
              final ban = _bans[index];
              final profile = ban['profiles'] ?? {};
              final bool isActive = ban['is_active'] ?? false;
              
              return FadeInUp(
                delay: Duration(milliseconds: 20 * index),
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
                  child: Row(
                    children: [
                      CircleAvatar(backgroundImage: NetworkImage(profile['avatar_url'] ?? ''), radius: 24),
                      const SizedBox(width: 20),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(profile['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                            Text("UID: ${profile['app_uid'] ?? '-'}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                          ],
                        ),
                      ),
                      Expanded(
                        flex: 2,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(ban['ban_reason'] ?? 'No reason', style: const TextStyle(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600)),
                            Text("Violation: ${ban['violation_type']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                          ],
                        ),
                      ),
                      const SizedBox(width: 20),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          isActive 
                            ? Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: const Text("ACTIVE BAN", style: TextStyle(color: Colors.redAccent, fontSize: 9, fontWeight: FontWeight.bold)))
                            : const Text("EXPIRED", style: TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 8),
                          if (isActive) ElevatedButton(onPressed: () => _handleUnban(ban['id']), style: ElevatedButton.styleFrom(backgroundColor: Colors.greenAccent.withOpacity(0.1), foregroundColor: Colors.greenAccent), child: const Text("UNBAN", style: TextStyle(fontSize: 10))),
                        ],
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Container(
        height: 64,
        padding: const EdgeInsets.symmetric(horizontal: 24),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white10)),
        child: Row(
          children: [
            const Icon(LucideIcons.search, color: Colors.white24, size: 20),
            const SizedBox(width: 16),
            Expanded(child: TextField(style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "Search by user name or ID...", hintStyle: TextStyle(color: Colors.white24), border: InputBorder.none), onChanged: (v) => setState(() => _searchQuery = v))),
          ],
        ),
      ),
    );
  }

  Widget _buildSettingsView() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(32),
      child: Column(
        children: [
          _settingCard("Face Detection", "Auto-close stream if face is not detected", LucideIcons.eye, 'face_detection_enabled'),
          _settingCard("Auto-Ban System", "Automatically ban users after multiple warnings", LucideIcons.shieldAlert, 'content_detection_enabled'),
        ],
      ),
    );
  }

  Widget _settingCard(String title, String desc, IconData icon, String key) {
    bool val = _moderationSettings[key]?['enabled'] ?? true;
    return Container(
      margin: const EdgeInsets.only(bottom: 24),
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        children: [
          Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(20)), child: Icon(icon, color: Colors.blueAccent)),
          const SizedBox(width: 24),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                Text(desc, style: const TextStyle(color: Colors.white24, fontSize: 12)),
              ],
            ),
          ),
          Switch(value: val, onChanged: (v) async {
            setState(() => _moderationSettings[key]['enabled'] = v);
            // Save to Supabase
          }, activeColor: Colors.blueAccent),
        ],
      ),
    );
  }

  void _showNewBanDialog() {
    // Dialog logic to create new ban
  }
}
