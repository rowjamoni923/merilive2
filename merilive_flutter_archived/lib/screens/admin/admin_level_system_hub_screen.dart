import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class AdminLevelSystemHubScreen extends StatefulWidget {
  const AdminLevelSystemHubScreen({super.key});

  @override
  State<AdminLevelSystemHubScreen> createState() => _AdminLevelSystemHubScreenState();
}

class _AdminLevelSystemHubScreenState extends State<AdminLevelSystemHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _privileges = [];
  List<Map<String, dynamic>> _featureGates = [];
  List<Map<String, dynamic>> _invitationRewards = [];
  Map<String, int> _stats = {'user': 0, 'host': 0, 'privileges': 0, 'features': 0};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final tiersRes = await supa.from('user_level_tiers').select('*').order('level_number', ascending: true);
      final privsRes = await supa.from('level_privileges').select('*').order('display_order', ascending: true);
      final featsRes = await supa.from('feature_level_requirements').select('*').order('required_level', ascending: true);
      final rewardsRes = await supa.from('invitation_reward_tiers').select('*').order('invite_count', ascending: true);

      final tiers = List<Map<String, dynamic>>.from(tiersRes);
      setState(() {
        _userTiers = tiers.where((t) => t['tier_type'] == 'user').toList();
        _hostTiers = tiers.where((t) => t['tier_type'] == 'host').toList();
        _privileges = List<Map<String, dynamic>>.from(privsRes);
        _featureGates = List<Map<String, dynamic>>.from(featsRes);
        _invitationRewards = List<Map<String, dynamic>>.from(rewardsRes);
        
        _stats['user'] = _userTiers.length;
        _stats['host'] = _hostTiers.length;
        _stats['privileges'] = _privileges.length;
        _stats['features'] = _featureGates.length;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading level system: $e");
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
          _buildStatsOverview(),
          _buildTabHeader(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildTiersList(),
                _buildPrivilegesList(),
                _buildFeatureGatesList(),
                _buildInvitationRewardsList(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.purpleAccent.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.purpleAccent, Colors.pinkAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.crown, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("LEVEL SYSTEM GOVERNANCE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Unified control for user/host tiers, gated privileges, and feature requirements", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatsOverview() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Row(
        children: [
          _statCard("USER TIERS", _stats['user'].toString(), LucideIcons.users, Colors.blueAccent),
          const SizedBox(width: 16),
          _statCard("HOST TIERS", _stats['host'].toString(), LucideIcons.crown, Colors.amberAccent),
          const SizedBox(width: 16),
          _statCard("PRIVILEGES", _stats['privileges'].toString(), LucideIcons.sparkles, Colors.pinkAccent),
          const SizedBox(width: 16),
          _statCard("FEATURE GATES", _stats['features'].toString(), LucideIcons.shield, Colors.greenAccent),
        ],
      ),
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.1))),
        child: Row(
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                Text(label, style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTabHeader() {
    return Container(
      margin: const EdgeInsets.all(40),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.purpleAccent, Colors.pinkAccent]), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelColor: Colors.white24,
        tabs: const [Tab(text: "LEVEL TIERS"), Tab(text: "PRIVILEGES"), Tab(text: "FEATURE GATES"), Tab(text: "INVITATION")],
      ),
    );
  }

  Widget _buildTiersList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Colors.purpleAccent));

    return DefaultTabController(
      length: 2,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 40),
            child: TabBar(
              indicatorColor: Colors.purpleAccent,
              dividerColor: Colors.white.withOpacity(0.05),
              tabs: const [Tab(text: "User Levels"), Tab(text: "Host Levels")],
            ),
          ),
          Expanded(
            child: TabBarView(
              children: [
                _buildTierTypeGrid(_userTiers, "USER"),
                _buildTierTypeGrid(_hostTiers, "HOST"),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTierTypeGrid(List<Map<String, dynamic>> tiers, String type) {
    return ListView.builder(
      padding: const EdgeInsets.all(40),
      itemCount: tiers.length,
      itemBuilder: (context, index) {
        final t = tiers[index];
        final color = Color(int.parse((t['level_color'] ?? "#6366F1").replaceAll("#", "0xFF")));
        final bool isActive = t['is_active'] ?? false;
        final amount = type == "USER" ? (t['min_topup_amount'] ?? 0) : (t['min_earning_amount'] ?? 0);

        return FadeInUp(
          delay: Duration(milliseconds: 15 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isActive ? color.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                _buildBadge(t, color),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text("Level ${t['level_number']}", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                          const SizedBox(width: 12),
                          if (t['level_name'] != null)
                            _badge(t['level_name'].toString().toUpperCase(), color.withOpacity(0.1), color),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text("${type == 'USER' ? 'Min Top-up' : 'Min Earnings'}: ${_api.formatNumber(amount)} ${type == 'USER' ? 'Diamonds' : 'Beans'}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
                    ],
                  ),
                ),
                const SizedBox(width: 20),
                _iconBtn(LucideIcons.edit3, Colors.white10, () {}),
                const SizedBox(width: 12),
                _iconBtn(LucideIcons.trash2, Colors.redAccent.withOpacity(0.1), () {}),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildBadge(Map<String, dynamic> tier, Color color) {
    final String? iconUrl = tier['icon_url'] ?? tier['animation_url'];
    return Container(
      width: 60, height: 60,
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(16), border: Border.all(color: color.withOpacity(0.2))),
      child: iconUrl != null && iconUrl.startsWith('http')
          ? ClipRRect(borderRadius: BorderRadius.circular(12), child: CachedNetworkImage(imageUrl: iconUrl, fit: BoxFit.cover))
          : Center(child: Text(tier['level_icon'] ?? "💎", style: const TextStyle(fontSize: 24))),
    );
  }

  Widget _buildPrivilegesList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Colors.purpleAccent));

    return ListView.builder(
      padding: const EdgeInsets.all(40),
      itemCount: _privileges.length,
      itemBuilder: (context, index) {
        final p = _privileges[index];
        final bool isActive = p['is_active'] ?? false;
        final color = Color(int.parse((p['icon_bg_color'] ?? "#333333").replaceAll("#", "0xFF")));

        return FadeInUp(
          delay: Duration(milliseconds: 15 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isActive ? color.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
                  child: Icon(_getIconData(p['icon_name']), color: color, size: 24),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(p['name'] ?? '', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                      Text(p['description'] ?? '', style: const TextStyle(color: Colors.white24, fontSize: 12)),
                      const SizedBox(height: 8),
                      _badge("UNLOCKS AT LV.${p['unlock_level']}", color.withOpacity(0.1), color),
                    ],
                  ),
                ),
                _iconBtn(LucideIcons.edit3, Colors.white10, () {}),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildFeatureGatesList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Colors.purpleAccent));

    return ListView.builder(
      padding: const EdgeInsets.all(40),
      itemCount: _featureGates.length,
      itemBuilder: (context, index) {
        final f = _featureGates[index];
        final bool isActive = f['is_active'] ?? false;

        return FadeInUp(
          delay: Duration(milliseconds: 15 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isActive ? Colors.greenAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
                  child: Icon(_getFeatureIcon(f['feature_key']), color: Colors.white, size: 24),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(f['feature_name'] ?? '', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                      Text("Restricted access until level ${f['required_level']}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
                    ],
                  ),
                ),
                _badge("LV.${f['required_level']}+", Colors.white.withOpacity(0.1), Colors.white70),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildInvitationRewardsList() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Colors.purpleAccent));

    return ListView.builder(
      padding: const EdgeInsets.all(40),
      itemCount: _invitationRewards.length,
      itemBuilder: (context, index) {
        final r = _invitationRewards[index];
        final bool isActive = r['is_active'] ?? false;

        return FadeInUp(
          delay: Duration(milliseconds: 15 * index),
          child: Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.01),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: isActive ? Colors.amberAccent.withOpacity(0.2) : Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: BoxDecoration(color: Colors.amberAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.gift, color: Colors.amberAccent, size: 24),
                ),
                const SizedBox(width: 24),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("${r['invite_count']} Successful Invites", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                      Text("Reward: ${r['reward_amount']} ${r['reward_type'].toString().toUpperCase()}", style: const TextStyle(color: Colors.white24, fontSize: 12)),
                    ],
                  ),
                ),
                _badge("REWARD READY", Colors.amberAccent.withOpacity(0.1), Colors.amberAccent),
              ],
            ),
          ),
        );
      },
    );
  }

  IconData _getIconData(String? name) {
    switch (name) {
      case 'Headphones': return LucideIcons.headphones;
      case 'Sparkles': return LucideIcons.sparkles;
      case 'Crown': return LucideIcons.crown;
      case 'Star': return LucideIcons.star;
      case 'Gift': return LucideIcons.gift;
      case 'Car': return LucideIcons.car;
      case 'Image': return LucideIcons.image;
      case 'Frame': return LucideIcons.frame;
      case 'Sticker': return LucideIcons.sticker;
      case 'PartyPopper': return LucideIcons.partyPopper;
      case 'Users': return LucideIcons.users;
      case 'Award': return LucideIcons.award;
      default: return LucideIcons.medal;
    }
  }

  IconData _getFeatureIcon(String? key) {
    switch (key) {
      case 'create_room': return LucideIcons.plusSquare;
      case 'vip_purchase': return LucideIcons.shoppingCart;
      case 'special_gifts': return LucideIcons.gift;
      case 'host_registration': return LucideIcons.userPlus;
      case 'private_chat': return LucideIcons.messageCircle;
      default: return LucideIcons.shield;
    }
  }

  Widget _badge(String label, Color bg, Color text) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
      child: Text(label, style: TextStyle(color: text, fontSize: 9, fontWeight: FontWeight.bold)),
    );
  }

  Widget _iconBtn(IconData icon, Color bg, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
        child: Icon(icon, color: Colors.white, size: 16),
      ),
    );
  }
}
