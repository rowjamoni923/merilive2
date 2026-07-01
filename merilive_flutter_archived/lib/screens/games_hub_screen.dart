import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'dart:ui';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';

class GamesHubScreen extends StatefulWidget {
  const GamesHubScreen({super.key});

  @override
  State<GamesHubScreen> createState() => _GamesHubScreenState();
}

class _GamesHubScreenState extends State<GamesHubScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  String _selectedCategory = "All";
  int _diamonds = 19169565;

  final List<String> _categories = ["All", "Action", "Casual", "Multiplayer"];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    final profile = await _api.getMyProfile();
    if (mounted && profile != null) {
      _diamonds = profile['diamond_balance'] ?? profile['diamonds'] ?? 19169565;
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1015),
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(),
            _buildWinnerTicker(),
            _buildCategoryTabs(),
            Expanded(
              child: GridView.builder(
                padding: const EdgeInsets.all(20),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  mainAxisSpacing: 20,
                  crossAxisSpacing: 20,
                  childAspectRatio: 0.8,
                ),
                itemCount: 4, // Mocking 4 games
                itemBuilder: (context, index) {
                  return _buildGameCard(index);
                },
              ),
            ),
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
          const SizedBox(width: 8),
          Text("Games Hub", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
          const Spacer(),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: const Color(0xFF4C1D95),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: Colors.white.withOpacity(0.1)),
            ),
            child: Row(
              children: [
                const Icon(LucideIcons.gem, color: Colors.amber, size: 14),
                const SizedBox(width: 6),
                Text("$_diamonds", style: GoogleFonts.spaceMono(color: Colors.white, fontSize: 13, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWinnerTicker() {
    return Container(
      height: 32,
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(color: Colors.amber.withOpacity(0.1), border: Border.symmetric(horizontal: BorderSide(color: Colors.amber.withOpacity(0.2)))),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        physics: const NeverScrollableScrollPhysics(),
        itemBuilder: (context, index) {
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 6),
            child: Row(
              children: [
                const Icon(LucideIcons.trophy, color: Colors.amber, size: 14),
                const SizedBox(width: 8),
                Text("Sazzad won 25,000 Diamonds in Dice!", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.bold)),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildCategoryTabs() {
    return Container(
      height: 40,
      margin: const EdgeInsets.symmetric(vertical: 12),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        scrollDirection: Axis.horizontal,
        itemCount: _categories.length,
        itemBuilder: (context, index) {
          final cat = _categories[index];
          final bool isSelected = _selectedCategory == cat;
          return GestureDetector(
            onTap: () => setState(() => _selectedCategory = cat),
            child: Container(
              margin: const EdgeInsets.only(right: 12),
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                color: isSelected ? const Color(0xFFD946EF) : Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: isSelected ? Colors.white24 : Colors.transparent),
              ),
              child: Center(
                child: Text(cat, style: GoogleFonts.outfit(color: isSelected ? Colors.white : Colors.white38, fontSize: 13, fontWeight: FontWeight.bold)),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildGameCard(int index) {
    final List<Map<String, dynamic>> games = [
      {'name': 'Dice Pro', 'icon': LucideIcons.box, 'color': const Color(0xFF8B5CF6)},
      {'name': 'Slots Hub', 'icon': LucideIcons.layoutGrid, 'color': const Color(0xFFD946EF)},
      {'name': 'Roulette', 'icon': LucideIcons.refreshCw, 'color': const Color(0xFFF97316)},
      {'name': 'Teen Patti', 'icon': LucideIcons.club, 'color': const Color(0xFF10B981)},
    ];
    final game = games[index];

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [game['color'].withOpacity(0.3), game['color'].withOpacity(0.1)],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: game['color'].withOpacity(0.3)),
        boxShadow: [BoxShadow(color: game['color'].withOpacity(0.1), blurRadius: 15, offset: const Offset(0, 5))],
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.1), shape: BoxShape.circle),
            child: Icon(game['icon'], color: Colors.white, size: 40),
          ),
          const SizedBox(height: 16),
          Text(game['name'], style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text("PLAY", style: GoogleFonts.outfit(color: game['color'], fontSize: 13, fontWeight: FontWeight.w900)),
          ),
        ],
      ),
    );
  }
}
