import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../../services/api_service.dart';

class AdminTradersTab extends StatefulWidget {
  const AdminTradersTab({super.key});

  @override
  State<AdminTradersTab> createState() => _AdminTradersTabState();
}

class _AdminTradersTabState extends State<AdminTradersTab> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _helpers = [];
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _loadHelpers();
  }

  Future<void> _loadHelpers() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase()
        .from('topup_helpers')
        .select('*, user:profiles!topup_helpers_user_id_fkey(display_name, avatar_url, app_uid, country_flag, country_name)')
        .order('created_at', ascending: false);
      
      if (mounted) {
        setState(() {
          _helpers = List<Map<String, dynamic>>.from(res);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Error loading helpers: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _toggleHelper(String id, bool currentStatus) async {
    try {
      await _api.getSupabase().from('topup_helpers').update({'is_active': !currentStatus}).eq('id', id);
      _loadHelpers();
    } catch (e) {
      debugPrint("Error toggling helper: $e");
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildHeaderActions(),
        Expanded(
          child: _isLoading 
            ? const Center(child: CircularProgressIndicator(color: Colors.amberAccent))
            : ListView.builder(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                itemCount: _helpers.length,
                itemBuilder: (context, index) => _buildHelperCard(_helpers[index]),
              ),
        ),
      ],
    );
  }

  Widget _buildHeaderActions() {
    return Container(
      padding: const EdgeInsets.all(40),
      child: Row(
        children: [
          Expanded(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.05))),
              child: TextField(
                onChanged: (v) => setState(() => _searchQuery = v),
                style: const TextStyle(color: Colors.white),
                decoration: const InputDecoration(hintText: "Search traders by name or ID...", hintStyle: TextStyle(color: Colors.white24), border: InputBorder.none, icon: Icon(LucideIcons.search, color: Colors.white24, size: 16)),
              ),
            ),
          ),
          const SizedBox(width: 20),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("ADD TRADER"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.emeraldAccent, foregroundColor: Colors.black, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildHelperCard(Map<String, dynamic> h) {
    final user = h['user'] ?? {};
    final bool isActive = h['is_active'] ?? false;
    final int level = h['trader_level'] ?? 1;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundImage: user['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(user['avatar_url'], bucket: 'avatars')) : null,
            child: user['avatar_url'] == null ? const Icon(LucideIcons.user) : null,
          ),
          const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text(user['display_name'] ?? 'Unknown', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: (level == 5 ? Colors.amberAccent : Colors.blueAccent).withOpacity(0.1), borderRadius: BorderRadius.circular(6)),
                      child: Text("LV.$level", style: TextStyle(color: level == 5 ? Colors.amberAccent : Colors.blueAccent, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text("ID: ${user['app_uid'] ?? ''} • ${user['country_flag'] ?? ''} ${user['country_name'] ?? ''}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    const Icon(LucideIcons.wallet, color: Colors.white38, size: 12),
                    const SizedBox(width: 6),
                    Text("${h['wallet_balance'] ?? 0} 💎", style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                    const SizedBox(width: 16),
                    const Icon(LucideIcons.arrowUpRight, color: Colors.emeraldAccent, size: 12),
                    const SizedBox(width: 6),
                    Text("${h['total_bought'] ?? 0}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                  ],
                ),
              ],
            ),
          ),
          Column(
            children: [
              Switch(
                value: isActive,
                onChanged: (v) => _toggleHelper(h['id'], isActive),
                activeColor: Colors.emeraldAccent,
              ),
              Text(isActive ? "ACTIVE" : "INACTIVE", style: TextStyle(color: isActive ? Colors.emeraldAccent : Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(width: 20),
          _actionBtn(LucideIcons.moreVertical, Colors.white24, () {}),
        ],
      ),
    );
  }

  Widget _actionBtn(IconData icon, Color color, VoidCallback onTap) {
    return IconButton(
      icon: Icon(icon, color: color, size: 20),
      onPressed: onTap,
    );
  }
}
