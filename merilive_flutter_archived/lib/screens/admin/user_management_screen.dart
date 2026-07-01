import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';

class UserManagementScreen extends StatefulWidget {
  const UserManagementScreen({super.key});

  @override
  State<UserManagementScreen> createState() => _UserManagementScreenState();
}

class _UserManagementScreenState extends State<UserManagementScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _searchController = TextEditingController();
  
  List<Map<String, dynamic>> _users = [];
  bool _isLoading = true;
  String _currentFilter = 'all';

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers({String? query}) async {
    setState(() => _isLoading = true);
    final users = await _api.getAdminUsers(query: query, status: _currentFilter == 'all' ? null : _currentFilter);
    setState(() {
      _users = users;
      _isLoading = false;
    });
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

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          _buildSearchAndFilters(),
          const SizedBox(height: 24),
          Expanded(child: _buildUserList()),
        ],
      ),
    );
  }

  Widget _buildSearchAndFilters() {
    return Column(
      children: [
        Row(
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white12)),
                child: TextField(
                  controller: _searchController,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                  onSubmitted: (v) => _loadUsers(query: v),
                  decoration: const InputDecoration(
                    hintText: "Search by Name or UID...",
                    hintStyle: TextStyle(color: Colors.white24, fontSize: 13),
                    prefixIcon: Icon(LucideIcons.search, color: Colors.white38, size: 18),
                    border: InputBorder.none,
                    contentPadding: EdgeInsets.all(16),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 12),
            _buildFilterBtn('all', 'All'),
            const SizedBox(width: 8),
            _buildFilterBtn('active', 'Active'),
            const SizedBox(width: 8),
            _buildFilterBtn('banned', 'Banned'),
          ],
        ),
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
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: isSel ? const Color(0xFF6366F1) : Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(label, style: TextStyle(color: isSel ? Colors.white : Colors.white38, fontSize: 12, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildUserList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    if (_users.isEmpty) return const Center(child: Text("No users found", style: TextStyle(color: Colors.white24)));

    return ListView.builder(
      itemCount: _users.length,
      itemBuilder: (context, index) {
        final u = _users[index];
        bool isBlocked = u['is_blocked'] ?? false;
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.03),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: isBlocked ? Colors.red.withOpacity(0.3) : Colors.white70),
            ),
            child: Row(
              children: [
                CircleAvatar(radius: 12, backgroundImage: u['avatar_url'] != null ? NetworkImage(u['avatar_url']) : null, backgroundColor: Colors.white10),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(u['display_name'] ?? 'User', style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold)),
                          if (isBlocked) Container(margin: const EdgeInsets.only(left: 8), padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2), decoration: BoxDecoration(color: Colors.red.withOpacity(0.2), borderRadius: BorderRadius.circular(4)), child: const Text("BLOCKED", style: TextStyle(color: Colors.red, fontSize: 8, fontWeight: FontWeight.bold))),
                        ],
                      ),
                      Text("UID: ${u['app_uid'] ?? 'N/A'}", style: const TextStyle(color: Colors.white38, fontSize: 11)),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text("Joined: ${DateFormat('MMM dd').format(DateTime.parse(u['created_at']))}", style: const TextStyle(color: Colors.white24, fontSize: 10)),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        _buildActionIcon(LucideIcons.eye, Colors.blue, () {}),
                        const SizedBox(width: 8),
                        _buildActionIcon(isBlocked ? LucideIcons.unlock : LucideIcons.ban, isBlocked ? Colors.green : Colors.red, () => _toggleBan(u)),
                      ],
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

  Widget _buildActionIcon(IconData icon, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
        child: Icon(icon, color: color, size: 14),
      ),
    );
  }
}


