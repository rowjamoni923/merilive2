import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../widgets/premium_avatar.dart';

class AgentRankScreen extends StatefulWidget {
  const AgentRankScreen({super.key});

  @override
  State<AgentRankScreen> createState() => _AgentRankScreenState();
}

import '../widgets/nebula_background.dart';

class _AgentRankScreenState extends State<AgentRankScreen> {
  final ApiService _api = ApiService();
  String _selectedPeriod = "daily"; // daily, weekly, monthly
  bool _isLoading = true;
  List<Map<String, dynamic>> _leaderboard = [];
  Map<String, dynamic>? _myRank;

  final List<String> _periods = ["daily", "weekly", "monthly"];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _api.getLeaderboard(type: 'agency', period: _selectedPeriod),
        _api.getMyRank(type: 'agency', period: _selectedPeriod),
      ]);

      setState(() {
        _leaderboard = List<Map<String, dynamic>>.from(results[0] as List);
        _myRank = results[1] as Map<String, dynamic>?;
      });
    } catch (e) {
      debugPrint("Parity Rank Error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          Column(
            children: [
              _buildHeader(),
              _buildTabs(),
              Expanded(
                child: _isLoading
                    ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
                    : RefreshIndicator(
                        onRefresh: _loadData,
                        color: Colors.cyanAccent,
                        backgroundColor: const Color(0xFF1E293B),
                        child: CustomScrollView(
                          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                          slivers: [
                            SliverToBoxAdapter(child: _buildPodium()),
                            _buildList(),
                            const SliverPadding(padding: EdgeInsets.only(bottom: 120)),
                          ],
                        ),
                      ),
              ),
            ],
          ),
          if (!_isLoading) _buildMyRankBar(),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.only(top: 60, left: 24, right: 24, bottom: 10),
      child: Row(
        children: [
          GestureDetector(
            onTap: () => Navigator.pop(context),
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
              child: const Icon(LucideIcons.chevronLeft, color: Colors.white, size: 20),
            ),
          ),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("Agency Ranking", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              Text("Master Copy • Global Agency Leaderboard", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
            ],
          ),
          const Spacer(),
          IconButton(
            icon: const Icon(LucideIcons.info, color: Colors.white24, size: 20),
            onPressed: () {},
          ),
        ],
      ),
    );
  }

  Widget _buildTabs() {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 24, horizontal: 24),
      height: 44,
      child: Row(
        children: _periods.map((period) {
          final isSelected = _selectedPeriod == period;
          return Expanded(
            child: GestureDetector(
              onTap: () {
                setState(() => _selectedPeriod = period);
                _loadData();
              },
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                margin: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(
                  color: isSelected ? Colors.cyanAccent.withOpacity(0.1) : Colors.white.withOpacity(0.02),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: isSelected ? Colors.cyanAccent.withOpacity(0.3) : Colors.white10),
                ),
                alignment: Alignment.center,
                child: Text(
                  period.toUpperCase(),
                  style: GoogleFonts.outfit(
                    color: isSelected ? Colors.cyanAccent : Colors.white38,
                    fontWeight: FontWeight.bold,
                    fontSize: 11,
                  ),
                ),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildPodium() {
    if (_leaderboard.length < 3) return const SizedBox();

    return Container(
      height: 260,
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          _buildPodiumItem(_leaderboard[1], 2, Colors.blueGrey, 170),
          const SizedBox(width: 12),
          _buildPodiumItem(_leaderboard[0], 1, Colors.amberAccent, 220),
          const SizedBox(width: 12),
          _buildPodiumItem(_leaderboard[2], 3, Colors.deepOrangeAccent, 150),
        ],
      ),
    );
  }

  Widget _buildPodiumItem(Map<String, dynamic> agent, int rank, Color color, double height) {
    final profile = agent['profile'];
    return Expanded(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          Stack(
            alignment: Alignment.topCenter,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 15),
                child: PremiumAvatar(
                  imageUrl: profile?['avatar_url'] ?? '',
                  size: rank == 1 ? 80 : 64,
                  frameId: profile?['equipped_frame_id'],
                ),
              ),
              if (rank == 1)
                const Positioned(top: 0, child: Icon(LucideIcons.crown, color: Colors.amberAccent, size: 28)),
              Positioned(
                bottom: 0,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12), boxShadow: [BoxShadow(color: color.withOpacity(0.3), blurRadius: 10)]),
                  child: Text("#$rank", style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w900)),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            profile?['display_name'] ?? 'Unknown',
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14),
          ),
          const SizedBox(height: 4),
          Text(
            _api.formatNumber(agent['points'] ?? 0),
            style: GoogleFonts.outfit(color: color, fontWeight: FontWeight.w900, fontSize: 12),
          ),
          const SizedBox(height: 12),
          Container(
            height: height - 120,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [color.withOpacity(0.15), color.withOpacity(0.01)],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
              border: Border.all(color: color.withOpacity(0.1), width: 0.5),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    final list = _leaderboard.length > 3 ? _leaderboard.sublist(3) : [];
    return SliverList(
      delegate: SliverChildBuilderDelegate(
        (context, index) {
          final agent = list[index];
          final profile = agent['profile'];
          final rank = index + 4;
          return FadeInUp(
            delay: Duration(milliseconds: 30 * (index % 10)),
            child: Container(
              margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 6),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.02),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: Colors.white.withOpacity(0.05)),
              ),
              child: Row(
                children: [
                  SizedBox(width: 32, child: Text("$rank", style: GoogleFonts.outfit(color: Colors.white24, fontWeight: FontWeight.w900, fontSize: 16))),
                  PremiumAvatar(imageUrl: profile?['avatar_url'] ?? '', size: 48, frameId: profile?['equipped_frame_id']),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(profile?['display_name'] ?? 'Unknown', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                        Text("Agency Level ${profile?['agent_level'] ?? 1}", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11)),
                      ],
                    ),
                  ),
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(_api.formatNumber(agent['points'] ?? 0), style: GoogleFonts.outfit(color: Colors.cyanAccent, fontWeight: FontWeight.w900, fontSize: 16)),
                      Text("POINTS", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 8, fontWeight: FontWeight.bold, letterSpacing: 1)),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
        childCount: list.length,
      ),
    );
  }

  Widget _buildMyRankBar() {
    final rank = _myRank?['rank'] ?? '--';
    final points = _myRank?['points'] ?? 0;

    return Positioned(
      bottom: 24,
      left: 24,
      right: 24,
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: const Color(0xFF1E293B),
          borderRadius: BorderRadius.circular(32),
          boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.5), blurRadius: 40, offset: const Offset(0, 10))],
          border: Border.all(color: Colors.cyanAccent.withOpacity(0.1)),
        ),
        child: Row(
          children: [
            Text("#$rank", style: GoogleFonts.outfit(color: Colors.cyanAccent, fontSize: 24, fontWeight: FontWeight.w900)),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text("Global Position", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                  Text(rank == '--' ? "Keep pushing for the top!" : "You are in the top elite!", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11)),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_api.formatNumber(points), style: GoogleFonts.outfit(color: Colors.amberAccent, fontWeight: FontWeight.w900, fontSize: 20)),
                Text("MY POINTS", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 8, fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
