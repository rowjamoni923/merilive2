import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminGameLeaderboardScreen extends StatefulWidget {
  const AdminGameLeaderboardScreen({super.key});

  @override
  State<AdminGameLeaderboardScreen> createState() => _AdminGameLeaderboardScreenState();
}

class _AdminGameLeaderboardScreenState extends State<AdminGameLeaderboardScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _rankings = [];

  @override
  void initState() {
    super.initState();
    _loadRankings();
  }

  Future<void> _loadRankings() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('game_leaderboard').select('*, user:profiles(display_name, app_uid, avatar_url)').order('total_win_amount', ascending: false).limit(50);
      if (mounted) {
        setState(() {
          _rankings = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.amberAccent))
              : _buildRankingsList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.amber, Colors.orangeAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.trophy, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("GAME PROFIT RANKINGS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Top winning users across all games, monitor high-stake players and win-rates", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          _buildRefreshBtn(),
        ],
      ),
    );
  }

  Widget _buildRefreshBtn() {
    return ElevatedButton.icon(
      onPressed: _loadRankings,
      icon: const Icon(LucideIcons.refreshCw, size: 16),
      label: const Text("REFRESH RANKINGS"),
      style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
    );
  }

  Widget _buildRankingsList() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _rankings.length,
      itemBuilder: (context, index) {
        final r = _rankings[index];
        final user = r['user'] ?? {};
        return Container(
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Row(
            children: [
              Text("#${index + 1}", style: GoogleFonts.outfit(color: Colors.white24, fontWeight: FontWeight.w900, fontSize: 18)),
              const SizedBox(width: 24),
              CircleAvatar(radius: 20, backgroundImage: user['avatar_url'] != null ? NetworkImage(_api.resolveAssetUrl(user['avatar_url'], bucket: 'avatars')) : null),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(user['display_name'] ?? 'Player', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                    Text("ID: ${user['app_uid']}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text("${r['total_win_amount'] ?? 0} 💎", style: GoogleFonts.outfit(color: Colors.emeraldAccent, fontWeight: FontWeight.bold, fontSize: 14)),
                  const Text("TOTAL PROFITS", style: TextStyle(color: Colors.white10, fontSize: 9, fontWeight: FontWeight.bold)),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}
