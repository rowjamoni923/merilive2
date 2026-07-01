import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';

class TraderTierUpgradeScreen extends StatefulWidget {
  const TraderTierUpgradeScreen({super.key});

  @override
  State<TraderTierUpgradeScreen> createState() => _TraderTierUpgradeScreenState();
}

class _TraderTierUpgradeScreenState extends State<TraderTierUpgradeScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _tiers = [];
  int _currentLevel = 1;

  @override
  void initState() {
    super.initState();
    _loadTiers();
  }

  Future<void> _loadTiers() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      _currentLevel = profile?['trader_level'] ?? 1;
      _tiers = await _api.getTraderLevelTiers();
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
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
                    : _buildTiersList(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("TRADER TIERS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
              Text("Upgrade level to earn higher commissions", style: GoogleFonts.outfit(color: Colors.white54, fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTiersList() {
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: _tiers.length,
      itemBuilder: (context, index) {
        final tier = _tiers[index];
        final int levelNum = tier['level_number'] ?? (index + 1);
        final bool isCurrent = levelNum == _currentLevel;
        final bool isUnlocked = levelNum <= _currentLevel;

        return FadeInUp(
          delay: Duration(milliseconds: 100 * index),
          child: _buildTierCard(tier, levelNum, isCurrent, isUnlocked),
        );
      },
    );
  }

  Widget _buildTierCard(Map<String, dynamic> tier, int level, bool isCurrent, bool isUnlocked) {
    final String name = tier['name'] ?? "Level $level";
    final double commission = (tier['commission_rate'] ?? 0.0).toDouble();
    final double cost = (tier['upgrade_cost_usd'] ?? 0.0).toDouble();
    
    Color tierColor = Colors.cyanAccent;
    if (name.contains("Silver")) tierColor = Colors.grey;
    if (name.contains("Gold")) tierColor = Colors.amber;
    if (name.contains("Platinum")) tierColor = const Color(0xFFE5E4E2);
    if (name.contains("Diamond")) tierColor = const Color(0xFFB9F2FF);

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            tierColor.withOpacity(0.15),
            Colors.white.withOpacity(0.02),
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isCurrent ? tierColor : tierColor.withOpacity(0.2),
          width: isCurrent ? 2 : 1,
        ),
      ),
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(20),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: tierColor.withOpacity(0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    level >= 5 ? LucideIcons.gem : LucideIcons.badgeCheck,
                    color: tierColor,
                    size: 24,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Text(
                            name.toUpperCase(),
                            style: GoogleFonts.outfit(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w900,
                              letterSpacing: 1,
                            ),
                          ),
                          if (isCurrent)
                            Container(
                              margin: const EdgeInsets.only(left: 8),
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: Colors.greenAccent,
                                borderRadius: BorderRadius.circular(6),
                              ),
                              child: const Text("CURRENT", style: TextStyle(color: Colors.black, fontSize: 8, fontWeight: FontWeight.bold)),
                            ),
                        ],
                      ),
                      Text(
                        "Level $level Trader",
                        style: GoogleFonts.outfit(color: Colors.white54, fontSize: 11),
                      ),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      "$commission%",
                      style: GoogleFonts.outfit(
                        color: tierColor,
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const Text("Commission", style: TextStyle(color: Colors.white38, fontSize: 9)),
                  ],
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.black12,
              borderRadius: const BorderRadius.only(
                bottomLeft: Radius.circular(24),
                bottomRight: Radius.circular(24),
              ),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text("Upgrade Cost", style: TextStyle(color: Colors.white38, fontSize: 9)),
                    Text("\$$cost", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                  ],
                ),
                if (!isUnlocked)
                  ElevatedButton(
                    onPressed: () {
                      // Process Upgrade
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: tierColor,
                      foregroundColor: Colors.black,
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      padding: const EdgeInsets.symmetric(horizontal: 20),
                    ),
                    child: const Text("Upgrade Now", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12)),
                  )
                else
                  const Padding(
                    padding: EdgeInsets.only(right: 12.0),
                    child: Icon(Icons.check_circle, color: Colors.greenAccent, size: 24),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}


