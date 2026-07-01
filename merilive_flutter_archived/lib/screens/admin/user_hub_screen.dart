import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class UserHubScreen extends StatefulWidget {
  const UserHubScreen({super.key});

  @override
  State<UserHubScreen> createState() => _UserHubScreenState();
}

class _UserHubScreenState extends State<UserHubScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _searchController = TextEditingController();
  
  List<Map<String, dynamic>> _users = [];
  List<Map<String, dynamic>> _countryStats = [];
  Map<String, dynamic> _userStats = {};
  bool _isLoading = true;
  String _currentFilter = 'all';

  @override
  void initState() {
    super.initState();
    _loadAllData();
  }

  Future<void> _loadAllData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _api.getAdminUsers(status: _currentFilter == 'all' ? null : _currentFilter),
        _api.getCountryStats(),
        _api.getAdminDashboardStats(), 
      ]);
      
      setState(() {
        _users = results[0] as List<Map<String, dynamic>>;
        _countryStats = results[1] as List<Map<String, dynamic>>;
        _userStats = results[2] as Map<String, dynamic>;
        _isLoading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _loadUsers({String? query}) async {
    setState(() => _isLoading = true);
    try {
      final users = await _api.getAdminUsers(query: query, status: _currentFilter == 'all' ? null : _currentFilter);
      setState(() {
        _users = users;
        _isLoading = false;
      });
    } catch (e) {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _toggleBan(Map<String, dynamic> user) async {
    final bool currentlyBlocked = user['is_blocked'] ?? false;
    final bool ok = await _api.updateAdminUserStatus(user['id'], !currentlyBlocked);
    if (ok) {
      _loadUsers(query: _searchController.text);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text("User ${currentlyBlocked ? 'unblocked' : 'blocked'} successfully"),
        backgroundColor: currentlyBlocked ? Colors.green : Colors.red,
      ));
    }
  }

  void _showUserDetail(Map<String, dynamic> user) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _UserDetailPanel(user: user, onStatusChange: () => _loadUsers(query: _searchController.text)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: ListView(
        padding: const EdgeInsets.all(32),
        children: [
          _buildHeader(),
          const SizedBox(height: 32),
          _buildStatsGrid(),
          const SizedBox(height: 32),
          _buildCountryDistribution(),
          const SizedBox(height: 48),
          _buildSearchAndFilters(),
          const SizedBox(height: 24),
          _buildUserList(),
        ],
      ),
    );
  }

  Widget _buildStatsGrid() {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 4,
      crossAxisSpacing: 16,
      mainAxisSpacing: 16,
      childAspectRatio: 2.2,
      children: [
        _buildMiniStatCard("Total Users", _userStats['total_users']?.toString() ?? "0", LucideIcons.users, Colors.amberAccent),
        _buildMiniStatCard("Verified", _userStats['total_hosts']?.toString() ?? "0", LucideIcons.userCheck, Colors.blueAccent),
        _buildMiniStatCard("Active Today", _userStats['online_users']?.toString() ?? "0", LucideIcons.activity, Colors.greenAccent),
        _buildMiniStatCard("Banned", _userStats['blocked_users']?.toString() ?? "0", LucideIcons.ban, Colors.redAccent),
      ],
    );
  }

  Widget _buildMiniStatCard(String label, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: color, size: 18)),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildCountryDistribution() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Icon(LucideIcons.globe, color: Colors.blueAccent, size: 20),
            const SizedBox(width: 12),
            Text("COUNTRY DISTRIBUTION", style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w900, letterSpacing: 1.2)),
          ],
        ),
        const SizedBox(height: 20),
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white10)),
          child: _countryStats.isEmpty 
            ? const Center(child: Text("No country data available", style: TextStyle(color: Colors.white24)))
            : GridView.builder(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 16, mainAxisSpacing: 12, childAspectRatio: 4),
                itemCount: _countryStats.length > 9 ? 9 : _countryStats.length,
                itemBuilder: (context, index) {
                  final c = _countryStats[index];
                  return Row(
                    children: [
                      Text(c['country_flag'] ?? '🌍', style: const TextStyle(fontSize: 20)),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Text(c['country_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold), overflow: TextOverflow.ellipsis),
                            Text("${c['count']} Users", style: const TextStyle(color: Colors.white24, fontSize: 10)),
                          ],
                        ),
                      ),
                    ],
                  );
                },
              ),
        ),
      ],
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "USER MANAGEMENT HUB",
          style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900),
        ),
        const Text(
          "Audit accounts, manage bans, and monitor user activities across the platform",
          style: TextStyle(color: Colors.white38, fontSize: 14),
        ),
      ],
    );
  }

  Widget _buildSearchAndFilters() {
    return Row(
      children: [
        Expanded(
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: Colors.white10),
            ),
            child: TextField(
              controller: _searchController,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              onSubmitted: (v) => _loadUsers(query: v),
              decoration: const InputDecoration(
                hintText: "Search by Name, Email or UID...",
                hintStyle: TextStyle(color: Colors.white24, fontSize: 14),
                prefixIcon: Icon(LucideIcons.search, color: Colors.white24, size: 18),
                border: InputBorder.none,
                contentPadding: EdgeInsets.all(16),
              ),
            ),
          ),
        ),
        const SizedBox(width: 16),
        _buildFilterBtn('all', 'All Users'),
        const SizedBox(width: 8),
        _buildFilterBtn('active', 'Active'),
        const SizedBox(width: 8),
        _buildFilterBtn('banned', 'Banned'),
      ],
    );
  }

  Widget _buildFilterBtn(String id, String label) {
    bool isSel = _currentFilter == id;
    return GestureDetector(
      onTap: () {
        setState(() => _currentFilter = id);
        _loadUsers(query: _searchController.text);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        decoration: BoxDecoration(
          color: isSel ? const Color(0xFF6366F1) : Colors.white.withOpacity(0.03),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: isSel ? Colors.transparent : Colors.white10),
        ),
        child: Text(
          label,
          style: GoogleFonts.outfit(color: isSel ? Colors.white : Colors.white38, fontSize: 12, fontWeight: FontWeight.bold),
        ),
      ),
    );
  }

  Widget _buildUserList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    if (_users.isEmpty) return const Center(child: Text("No users found matching your criteria", style: TextStyle(color: Colors.white24)));

    return ListView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: _users.length,
      itemBuilder: (context, index) {
        final u = _users[index];
        bool isBlocked = u['is_blocked'] ?? false;
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isBlocked ? Colors.redAccent.withOpacity(0.3) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                _buildAvatar(u),
                const SizedBox(width: 20),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(u['display_name'] ?? 'User', style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                          const SizedBox(width: 8),
                          if (isBlocked) _buildBadge("BANNED", Colors.redAccent),
                          if (u['is_host'] == true) _buildBadge("HOST", Colors.purpleAccent),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        "UID: ${u['app_uid'] ?? 'N/A'} \u2022 Joined ${DateFormat('MMM dd, yyyy').format(DateTime.parse(u['created_at']))}",
                        style: const TextStyle(color: Colors.white38, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                _buildActionButtons(u),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildBadge(String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6), border: Border.all(color: color.withOpacity(0.2))),
      child: Text(label, style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildAvatar(Map<String, dynamic> u) {
    return Stack(
      children: [
        CircleAvatar(
          radius: 28,
          backgroundImage: u['avatar_url'] != null ? NetworkImage(u['avatar_url']) : null,
          backgroundColor: Colors.white12,
          child: u['avatar_url'] == null ? const Icon(LucideIcons.user, color: Colors.white24, size: 24) : null,
        ),
        if (u['is_online'] == true)
          Positioned(
            right: 2,
            bottom: 2,
            child: Container(
              width: 14,
              height: 14,
              decoration: BoxDecoration(color: Colors.green, border: Border.all(color: const Color(0xFF0F172A), width: 3), shape: BoxShape.circle),
            ),
          ),
      ],
    );
  }

  Widget _buildActionButtons(Map<String, dynamic> u) {
    bool isBlocked = u['is_blocked'] ?? false;
    return Row(
      children: [
        _buildActionIcon(LucideIcons.eye, const Color(0xFF6366F1), () => _showUserDetail(u)),
        const SizedBox(width: 12),
        _buildActionIcon(isBlocked ? LucideIcons.unlock : LucideIcons.ban, isBlocked ? Colors.greenAccent : Colors.redAccent, () => _toggleBan(u)),
      ],
    );
  }

  Widget _buildActionIcon(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(14), border: Border.all(color: color.withOpacity(0.2))),
        child: Icon(icon, color: color, size: 18),
      ),
    );
  }
}

class _UserDetailPanel extends StatelessWidget {
  final Map<String, dynamic> user;
  final VoidCallback onStatusChange;
  
  const _UserDetailPanel({required this.user, required this.onStatusChange});

  @override
  Widget build(BuildContext context) {
    return Container(
      height: MediaQuery.of(context).size.height * 0.9,
      decoration: const BoxDecoration(
        color: Color(0xFF0F172A),
        borderRadius: BorderRadius.vertical(top: Radius.circular(32)),
        border: Border(top: BorderSide(color: Colors.white10)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 16),
          Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white12, borderRadius: BorderRadius.circular(2))),
          const SizedBox(height: 32),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(32),
              child: Column(
                children: [
                   _buildHeader(),
                   const SizedBox(height: 40),
                   _buildStatsGrid(),
                   const SizedBox(height: 40),
                   _buildDetailSection("Account Information", [
                     _buildDetailRow("Display Name", user['display_name'] ?? 'N/A'),
                     _buildDetailRow("System UID", user['app_uid'] ?? 'N/A'),
                     _buildDetailRow("Email Address", user['email'] ?? 'Not provided'),
                     _buildDetailRow("Gender", (user['gender'] ?? 'Not set').toString().toUpperCase()),
                     _buildDetailRow("Levels", "User ${user['user_level'] ?? 1} \u2022 Host ${user['host_level'] ?? 0}"),
                   ]),
                   const SizedBox(height: 24),
                   _buildDetailSection("Security & Metadata", [
                     _buildDetailRow("Last Login IP", user['last_login_ip'] ?? user['registration_ip'] ?? 'Hidden'),
                     _buildDetailRow("Device ID", user['device_id']?.toString() ?? 'N/A'),
                     _buildDetailRow("Region", "${user['country_flag'] ?? ''} ${user['country_code'] ?? 'Unknown'}"),
                   ]),
                   const SizedBox(height: 48),
                   _buildActionSection(context),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      children: [
        CircleAvatar(
          radius: 40,
          backgroundImage: user['avatar_url'] != null ? NetworkImage(user['avatar_url']) : null,
          backgroundColor: Colors.white12,
          child: user['avatar_url'] == null ? const Icon(LucideIcons.user, color: Colors.white24, size: 32) : null,
        ),
        const SizedBox(height: 20),
        Text(user['display_name'] ?? 'User', style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
        Text("@${user['username'] ?? 'username'}", style: const TextStyle(color: Colors.white38, fontSize: 14)),
      ],
    );
  }

  Widget _buildStatsGrid() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceAround,
      children: [
        _buildStatItem("Diamonds", "${user['diamonds'] ?? 0}", LucideIcons.coins, Colors.amber),
        _buildStatItem("Beans", "${user['beans_balance'] ?? 0}", LucideIcons.heart, Colors.pinkAccent),
        _buildStatItem("Total Topup", "\$${user['total_recharged'] ?? 0}", LucideIcons.trendingUp, Colors.greenAccent),
      ],
    );
  }

  Widget _buildStatItem(String label, String value, IconData icon, Color color) {
    return Column(
      children: [
        Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle), child: Icon(icon, color: color, size: 20)),
        const SizedBox(height: 12),
        Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        Text(label.toUpperCase(), style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1)),
      ],
    );
  }

  Widget _buildDetailSection(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title.toUpperCase(), style: const TextStyle(color: Color(0xFF6366F1), fontWeight: FontWeight.bold, fontSize: 10, letterSpacing: 2)),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Column(children: children),
        ),
      ],
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white24, fontSize: 13)),
          Text(value, style: const TextStyle(color: Colors.white70, fontSize: 13, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildActionSection(BuildContext context) {
    return Row(
      children: [
        Expanded(child: _buildActionButton("MODERATE USER", Colors.redAccent, LucideIcons.shieldAlert, () {})),
        const SizedBox(width: 16),
        Expanded(child: _buildActionButton("TRANSFERS", Colors.blueAccent, LucideIcons.history, () {})),
      ],
    );
  }

  Widget _buildActionButton(String label, Color color, IconData icon, VoidCallback onTap) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: color.withOpacity(0.2))),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 10),
            Text(label, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 13, letterSpacing: 1)),
          ],
        ),
      ),
    );
  }
}
