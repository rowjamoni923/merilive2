import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class AdminBlockedUsersScreen extends StatefulWidget {
  const AdminBlockedUsersScreen({super.key});

  @override
  State<AdminBlockedUsersScreen> createState() => _AdminBlockedUsersScreenState();
}

class _AdminBlockedUsersScreenState extends State<AdminBlockedUsersScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  bool _isLoading = true;
  List<Map<String, dynamic>> _blockedUsers = [];
  List<Map<String, dynamic>> _blockedAgencies = [];
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
      
      // Load Blocked Users
      final usersRes = await supa
          .from("profiles")
          .select("id, display_name, avatar_url, blocked_at, blocked_reason, is_host")
          .eq("is_blocked", true)
          .order("blocked_at", ascending: false);

      // Load Blocked Agencies
      final agenciesRes = await supa
          .from("agencies")
          .select("id, name, agency_code, blocked_at, blocked_reason, total_hosts")
          .eq("is_blocked", true)
          .order("blocked_at", ascending: false);

      setState(() {
        _blockedUsers = List<Map<String, dynamic>>.from(usersRes);
        _blockedAgencies = List<Map<String, dynamic>>.from(agenciesRes);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading blocked items: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleUnblockUser(String userId) async {
    try {
      await _api.getSupabase().rpc("admin_block_user", params: {'_user_id': userId, '_block': false});
      _loadData();
    } catch (e) {
      debugPrint("Error unblocking user: $e");
    }
  }

  Future<void> _handleUnblockAgency(String agencyId) async {
    try {
      await _api.getSupabase().rpc("admin_block_agency", params: {'_agency_id': agencyId, '_block': false});
      _loadData();
    } catch (e) {
      debugPrint("Error unblocking agency: $e");
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
          _buildSearchBar(),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.redAccent))
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildUsersList(),
                    _buildAgenciesList(),
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
        gradient: const LinearGradient(colors: [Color(0xFFEF4444), Color(0xFFF43F5E), Color(0xFFDB2777)]),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [BoxShadow(color: Colors.red.withOpacity(0.2), blurRadius: 40, offset: const Offset(0, 20))],
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
            child: const Icon(LucideIcons.ban, color: Colors.white, size: 32),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("BLOCK LIST", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
              const Text("Management of blocked users and restricted agencies", style: TextStyle(color: Colors.white70)),
            ],
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
        tabs: [
          Tab(text: "USERS (${_blockedUsers.length})"),
          Tab(text: "AGENCIES (${_blockedAgencies.length})"),
        ],
      ),
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
            Expanded(child: TextField(style: const TextStyle(color: Colors.white), decoration: const InputDecoration(hintText: "Search by name, ID or agency code...", hintStyle: TextStyle(color: Colors.white24), border: InputBorder.none), onChanged: (v) => setState(() => _searchQuery = v))),
          ],
        ),
      ),
    );
  }

  Widget _buildUsersList() {
    final filtered = _blockedUsers.where((u) => u['display_name'].toString().toLowerCase().contains(_searchQuery.toLowerCase())).toList();
    if (filtered.isEmpty) return const Center(child: Text("No blocked users found", style: TextStyle(color: Colors.white24)));
    
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final user = filtered[index];
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Row(
              children: [
                CircleAvatar(backgroundImage: NetworkImage(user['avatar_url'] ?? ''), radius: 24, backgroundColor: Colors.redAccent.withOpacity(0.1)),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      Text("ID: ${user['id'].toString().substring(0, 8)}...", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                    ],
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Row(
                    children: [
                      const Icon(LucideIcons.alertTriangle, color: Colors.amberAccent, size: 14),
                      const SizedBox(width: 8),
                      Expanded(child: Text(user['blocked_reason'] ?? 'No reason specified', style: const TextStyle(color: Colors.white70, fontSize: 12), overflow: TextOverflow.ellipsis)),
                    ],
                  ),
                ),
                const SizedBox(width: 20),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text("Blocked ${DateFormat('dd MMM').format(DateTime.parse(user['blocked_at']))}", style: const TextStyle(color: Colors.white24, fontSize: 10)),
                    const SizedBox(height: 8),
                    ElevatedButton.icon(
                      onPressed: () => _handleUnblockUser(user['id']),
                      icon: const Icon(LucideIcons.unlock, size: 14),
                      label: const Text("UNBLOCK", style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.greenAccent.withOpacity(0.1), foregroundColor: Colors.greenAccent, elevation: 0),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildAgenciesList() {
    final filtered = _blockedAgencies.where((a) => a['name'].toString().toLowerCase().contains(_searchQuery.toLowerCase())).toList();
    if (filtered.isEmpty) return const Center(child: Text("No blocked agencies found", style: TextStyle(color: Colors.white24)));
    
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final agency = filtered[index];
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Row(
              children: [
                Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(16)), child: const Icon(LucideIcons.building2, color: Colors.redAccent, size: 20)),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(agency['name'] ?? 'Unknown Agency', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      Text("Code: ${agency['agency_code']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                    ],
                  ),
                ),
                Expanded(
                  flex: 2,
                  child: Row(
                    children: [
                      const Icon(LucideIcons.alertTriangle, color: Colors.amberAccent, size: 14),
                      const SizedBox(width: 8),
                      Expanded(child: Text(agency['blocked_reason'] ?? 'No reason specified', style: const TextStyle(color: Colors.white70, fontSize: 12), overflow: TextOverflow.ellipsis)),
                    ],
                  ),
                ),
                const SizedBox(width: 20),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text("Blocked ${DateFormat('dd MMM').format(DateTime.parse(agency['blocked_at']))}", style: const TextStyle(color: Colors.white24, fontSize: 10)),
                    const SizedBox(height: 8),
                    ElevatedButton.icon(
                      onPressed: () => _handleUnblockAgency(agency['id']),
                      icon: const Icon(LucideIcons.unlock, size: 14),
                      label: const Text("UNBLOCK", style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold)),
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.greenAccent.withOpacity(0.1), foregroundColor: Colors.greenAccent, elevation: 0),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
