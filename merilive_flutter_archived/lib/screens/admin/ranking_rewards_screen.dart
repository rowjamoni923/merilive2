import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class RankingRewardsScreen extends StatefulWidget {
  const RankingRewardsScreen({super.key});

  @override
  State<RankingRewardsScreen> createState() => _RankingRewardsScreenState();
}

class _RankingRewardsScreenState extends State<RankingRewardsScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  bool _isLoading = true;
  List<Map<String, dynamic>> _rewards = [];
  String _activeType = 'host_earning';

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadRewards();
  }

  Future<void> _loadRewards() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('ranking_rewards').select('*').order('rank_position');
      setState(() {
        _rewards = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading ranking rewards: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: Column(
        children: [
          _buildHeader(),
          _buildTypeSelector(),
          const SizedBox(height: 32),
          _buildPeriodTabs(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildRewardList('weekly'),
                _buildRewardList('monthly'),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("RANKING REWARDS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
              const Text("Configure automated competition payouts for Agencies, Hosts, and Games", style: TextStyle(color: Colors.white38, fontSize: 14)),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("NEW REWARD RULE"),
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
          ),
        ],
      ),
    );
  }

  Widget _buildTypeSelector() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 32),
      child: Row(
        children: [
          _typePill('host_earning', "HOST EARNING", LucideIcons.users),
          const SizedBox(width: 12),
          _typePill('agency', "AGENCY RANK", LucideIcons.building2),
          const SizedBox(width: 12),
          _typePill('game', "GAME LEADERBOARD", LucideIcons.gamepad2),
        ],
      ),
    );
  }

  Widget _typePill(String id, String label, IconData icon) {
    final bool isSelected = _activeType == id;
    return GestureDetector(
      onTap: () => setState(() => _activeType = id),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        decoration: BoxDecoration(color: isSelected ? const Color(0xFF6366F1) : Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(12), border: Border.all(color: isSelected ? Colors.transparent : Colors.white10)),
        child: Row(
          children: [
            Icon(icon, color: isSelected ? Colors.white : Colors.white24, size: 14),
            const SizedBox(width: 12),
            Text(label, style: TextStyle(color: isSelected ? Colors.white : Colors.white24, fontWeight: FontWeight.bold, fontSize: 10, letterSpacing: 1.2)),
          ],
        ),
      ),
    );
  }

  Widget _buildPeriodTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 32),
      child: TabBar(
        controller: _tabController,
        indicatorColor: const Color(0xFF6366F1),
        indicatorWeight: 4,
        dividerColor: Colors.white.withOpacity(0.05),
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white24,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 14),
        tabs: const [Tab(text: "WEEKLY CYCLE"), Tab(text: "MONTHLY CYCLE")],
      ),
    );
  }

  Widget _buildRewardList(String period) {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    final filtered = _rewards.where((r) => r['ranking_type'] == _activeType && r['period_type'] == period).toList();

    return ListView.builder(
      padding: const EdgeInsets.all(32),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final r = filtered[index];
        final int pos = r['rank_position'];
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: _buildRewardCard(r, pos),
        );
      },
    );
  }

  Widget _buildRewardCard(Map<String, dynamic> r, int pos) {
    final Color rankColor = pos == 1 ? Colors.amberAccent : (pos == 2 ? const Color(0xFF94A3B8) : (pos == 3 ? const Color(0xFFB45309) : Colors.white10));
    final String medal = pos == 1 ? "🥇" : (pos == 2 ? "🥈" : (pos == 3 ? "🥉" : "#$pos"));

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        children: [
          Container(width: 56, height: 56, decoration: BoxDecoration(color: rankColor.withOpacity(0.1), borderRadius: BorderRadius.circular(16)), child: Center(child: Text(medal, style: const TextStyle(fontSize: 20)))),
          const SizedBox(width: 24),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("RANK POSITION $pos", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                Text("Min Requirement: ${_api.formatNumber(r['min_income_requirement'] ?? 0)}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text("${_api.formatNumber(r['reward_coins'])} 💎", style: GoogleFonts.outfit(color: Colors.amberAccent, fontSize: 20, fontWeight: FontWeight.bold)),
              if (r['reward_badge'] != null) Text(r['reward_badge'], style: const TextStyle(color: Colors.greenAccent, fontSize: 10, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(width: 32),
          IconButton(icon: const Icon(LucideIcons.edit2, color: Colors.white24, size: 16), onPressed: () {}),
          IconButton(icon: const Icon(LucideIcons.trash2, color: Colors.redAccent, size: 16), onPressed: () {}),
        ],
      ),
    );
  }
}
