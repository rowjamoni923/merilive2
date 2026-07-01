import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/avatar_with_frame.dart';

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});

  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  final ApiService _api = ApiService();
  String _activeCategory = "wealth";
  String _periodType = "weekly";
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    await Future.delayed(const Duration(milliseconds: 500));
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(backgroundColor: Color(0xFF0F1015), body: Center(child: CircularProgressIndicator(color: Colors.amber)));

    return Scaffold(
      backgroundColor: const Color(0xFF0F1015),
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            _buildCategoryTabs(),
            _buildPeriodTabs(),
            Expanded(child: _buildRankingsList()),
            _buildMyRankWidget(),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          const Icon(LucideIcons.crown, color: Colors.amber, size: 24),
          const SizedBox(width: 12),
          Text("Leaderboard", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const Spacer(),
          IconButton(icon: const Icon(LucideIcons.helpCircle, color: Colors.white38, size: 20), onPressed: () {}),
        ],
      ),
    );
  }

  Widget _buildCategoryTabs() {
    final List<Map<String, dynamic>> cats = [
      {'id': 'wealth', 'label': 'Wealth', 'color': Colors.amber, 'icon': LucideIcons.gem},
      {'id': 'game', 'label': 'Game', 'color': Colors.redAccent, 'icon': LucideIcons.gamepad2},
      {'id': 'charm', 'label': 'Charm', 'color': Colors.pinkAccent, 'icon': LucideIcons.heart},
      {'id': 'pk', 'label': 'PK', 'color': Colors.orangeAccent, 'icon': LucideIcons.swords},
    ];
    return Container(
      height: 44,
      margin: const EdgeInsets.symmetric(vertical: 8),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: cats.length,
        itemBuilder: (context, index) {
          final cat = cats[index];
          final bool isSelected = _activeCategory == cat['id'];
          return GestureDetector(
            onTap: () => setState(() => _activeCategory = cat['id']),
            child: Container(
              margin: const EdgeInsets.only(right: 12),
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(color: isSelected ? cat['color'].withOpacity(0.15) : Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(22), border: Border.all(color: isSelected ? cat['color'] : Colors.transparent)),
              child: Row(
                children: [
                  Icon(cat['icon'], color: isSelected ? cat['color'] : Colors.white38, size: 14),
                  const SizedBox(width: 8),
                  Text(cat['label'], style: GoogleFonts.outfit(color: isSelected ? Colors.white : Colors.white38, fontSize: 13, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildPeriodTabs() {
    return Container(
      height: 36,
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(18)),
      child: Row(
        children: ["daily", "weekly", "monthly"].map((p) {
          final bool isSelected = _periodType == p;
          return Expanded(
            child: GestureDetector(
              onTap: () => setState(() => _periodType = p),
              child: Container(
                decoration: BoxDecoration(color: isSelected ? const Color(0xFF8B5CF6) : Colors.transparent, borderRadius: BorderRadius.circular(18)),
                child: Center(child: Text(p.toUpperCase(), style: GoogleFonts.outfit(color: isSelected ? Colors.white : Colors.white38, fontSize: 11, fontWeight: FontWeight.bold))),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _buildRankingsList() {
    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      children: [
        _buildPodium(),
        const SizedBox(height: 40),
        ...List.generate(10, (index) => _buildRankingItem(index + 4)),
      ],
    );
  }

  Widget _buildPodium() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        _buildPodiumUser(2, "Silver", "850K", Colors.blueGrey),
        const SizedBox(width: 16),
        _buildPodiumUser(1, "Gold Master", "1.2M", Colors.amber),
        const SizedBox(width: 16),
        _buildPodiumUser(3, "Bronze", "620K", Colors.brown),
      ],
    );
  }

  Widget _buildPodiumUser(int rank, String name, String value, Color color) {
    double size = rank == 1 ? 90 : 70;
    return Column(
      children: [
        if (rank == 1) const Icon(LucideIcons.crown, color: Colors.amber, size: 28),
        const SizedBox(height: 8),
        Stack(
          alignment: Alignment.center,
          children: [
            Container(width: size + 8, height: size + 8, decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: color, width: 3), gradient: RadialGradient(colors: [color.withOpacity(0.3), Colors.transparent]))),
            AvatarWithFrame(src: null, size: size),
            Positioned(bottom: 0, child: Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(12)), child: Text("#$rank", style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)))),
          ],
        ),
        const SizedBox(height: 12),
        Text(name, style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
        Text(value, style: GoogleFonts.outfit(color: Colors.amber, fontSize: 12, fontWeight: FontWeight.bold)),
      ],
    );
  }

  Widget _buildRankingItem(int rank) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        children: [
          SizedBox(width: 32, child: Text("$rank", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 14, fontWeight: FontWeight.bold))),
          const AvatarWithFrame(src: null, size: 44),
          const SizedBox(width: 16),
          Expanded(child: Text("User $rank", style: GoogleFonts.outfit(color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold))),
          Text("${250 - rank}K", style: GoogleFonts.outfit(color: Colors.amber, fontSize: 13, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildMyRankWidget() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: const Color(0xFF1E1B23), border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05)))),
      child: Row(
        children: [
          const Text("99+", style: TextStyle(color: Colors.white38, fontWeight: FontWeight.bold)),
          const SizedBox(width: 16),
          const AvatarWithFrame(src: null, size: 44),
          const SizedBox(width: 16),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text("Me", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)), Text("You're near the top!", style: TextStyle(color: Colors.white38, fontSize: 11))])),
          Text("0", style: GoogleFonts.outfit(color: Colors.amber, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
