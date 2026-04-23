import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:shimmer/shimmer.dart';
import '../../widgets/nebula_background.dart';
import '../../services/api_service.dart';
import 'package:intl/intl.dart';

class LevelExplainerScreen extends StatefulWidget {
  const LevelExplainerScreen({super.key});

  @override
  State<LevelExplainerScreen> createState() => _LevelExplainerScreenState();
}

class _LevelExplainerScreenState extends State<LevelExplainerScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  Map<String, dynamic>? _profile;
  List<Map<String, dynamic>> _userLevels = [];
  List<Map<String, dynamic>> _hostLevels = [];
  List<Map<String, dynamic>> _privileges = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _initData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _initData() async {
    setState(() => _isLoading = true);
    try {
      final results = await Future.wait([
        _api.getMyProfile(),
        _api.getUserLevelTiers(),
        _api.getHostLevelTiers(),
        _api.getLevelPrivileges(),
      ]);
      _profile = results[0] as Map<String, dynamic>?;
      _userLevels = List<Map<String, dynamic>>.from(results[1] as List);
      _hostLevels = List<Map<String, dynamic>>.from(results[2] as List);
      _privileges = List<Map<String, dynamic>>.from(results[3] as List);
    } catch (e) {
      debugPrint("Level Data Error: $e");
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
                _buildAppBar(context),
                if (_isLoading)
                  const Expanded(child: Center(child: CircularProgressIndicator(color: Color(0xFF6366F1))))
                else
                  Expanded(
                    child: Column(
                      children: [
                        _buildTabHeader(),
                        Expanded(
                          child: TabBarView(
                            controller: _tabController,
                            children: [
                              _buildLevelContent(isHost: false),
                              _buildLevelContent(isHost: true),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.chevronLeft, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const SizedBox(width: 8),
          Text(
            "LEVEL CENTER",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold, letterSpacing: 1.2),
          ),
        ],
      ),
    );
  }

  Widget _buildTabHeader() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
      height: 44,
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white10),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          gradient: const LinearGradient(colors: [Color(0xFF6366F1), Color(0xFFA855F7)]),
        ),
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 13),
        unselectedLabelColor: Colors.white38,
        tabs: const [Tab(text: "User Level"), Tab(text: "Host Level")],
      ),
    );
  }

  Widget _buildLevelContent({required bool isHost}) {
    final int currentLevel = isHost ? (_profile?['host_level'] ?? 1) : (_profile?['user_level'] ?? 1);
    final int currentExp = isHost ? (_profile?['host_exp'] ?? 0) : (_profile?['user_exp'] ?? 0);
    final levels = isHost ? _hostLevels : _userLevels;
    
    final nextLevelIdx = levels.indexWhere((l) => (l['level_number'] ?? 0) > currentLevel);
    final nextLevel = nextLevelIdx != -1 ? levels[nextLevelIdx] : (levels.isNotEmpty ? levels.last : null);
    final int needExp = nextLevel?['min_exp'] ?? 0;
    final double progress = needExp > 0 ? (currentExp / needExp).clamp(0.0, 1.0) : 1.0;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildProgressCard(currentLevel, currentExp, needExp, progress, isHost),
          const SizedBox(height: 32),
          _buildTiersSection(levels, currentLevel),
          const SizedBox(height: 32),
          _buildPrivilegesSection(currentLevel),
        ],
      ),
    );
  }

  Widget _buildProgressCard(int level, int exp, int next, double progress, bool isHost) {
    return FadeInDown(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: isHost 
              ? [const Color(0xFFF43F5E), const Color(0xFF881337)] 
              : [const Color(0xFF6366F1), const Color(0xFF312E81)],
            begin: Alignment.topLeft, end: Alignment.bottomRight
          ),
          borderRadius: BorderRadius.circular(24),
          boxShadow: [BoxShadow(color: (isHost ? Colors.pink : Colors.indigo).withOpacity(0.3), blurRadius: 20)],
        ),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("CURRENT LEVEL", style: GoogleFonts.outfit(color: Colors.white54, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                    Text("Lv. $level", style: GoogleFonts.outfit(color: Colors.white, fontSize: 32, fontWeight: FontWeight.w900)),
                  ],
                ),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: Colors.white.withOpacity(0.1), shape: BoxShape.circle),
                  child: Icon(isHost ? LucideIcons.flame : LucideIcons.star, color: Colors.white, size: 28),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text("${NumberFormat.compact().format(exp)} XP", style: const TextStyle(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold)),
                Text("${NumberFormat.compact().format(next)} XP", style: const TextStyle(color: Colors.white38, fontSize: 12)),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Stack(
                children: [
                  LinearProgressIndicator(
                    value: progress,
                    minHeight: 12,
                    backgroundColor: Colors.black26,
                    color: Colors.white,
                  ),
                  if (progress < 1.0)
                    Positioned.fill(
                      child: Shimmer.fromColors(
                        baseColor: Colors.transparent,
                        highlightColor: Colors.white30,
                        child: Container(color: Colors.white),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Text(
              next > exp ? "Need ${NumberFormat('#,###').format(next - exp)} more XP to Lv. ${level + 1}" : "Max Level Reached!",
              style: const TextStyle(color: Colors.white70, fontSize: 11, fontStyle: FontStyle.italic),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTiersSection(List<Map<String, dynamic>> levels, int currentLevel) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "LEVEL TIERS",
          style: GoogleFonts.outfit(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.5),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: 100,
          child: ListView.builder(
            scrollDirection: Axis.horizontal,
            itemCount: levels.length,
            itemBuilder: (context, index) {
              final l = levels[index];
              final bool isReached = (l['level_number'] ?? 0) <= currentLevel;
              return Container(
                width: 80,
                margin: const EdgeInsets.only(right: 12),
                decoration: BoxDecoration(
                  color: isReached ? const Color(0xFF6366F1).withOpacity(0.1) : Colors.white.withOpacity(0.02),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: isReached ? const Color(0xFF6366F1).withOpacity(0.5) : Colors.white10),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text("Lv. ${l['level_number']}", style: TextStyle(color: isReached ? Colors.white : Colors.white38, fontWeight: FontWeight.bold, fontSize: 12)),
                    const SizedBox(height: 8),
                    Icon(LucideIcons.shield, color: isReached ? Colors.amber : Colors.white10, size: 24),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildPrivilegesSection(int currentLevel) {
    final relevantPrivileges = _privileges.where((p) => (p['required_level'] ?? 0) <= currentLevel + 20).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "PRIVILEGES & REWARDS",
          style: GoogleFonts.outfit(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.bold, letterSpacing: 1.5),
        ),
        const SizedBox(height: 16),
        if (relevantPrivileges.isEmpty)
           const Padding(
             padding: EdgeInsets.all(20),
             child: Text("Reach Level 5 to unlock privileges!", style: TextStyle(color: Colors.white24, fontSize: 12)),
           )
        else
          ...relevantPrivileges.map((p) => FadeInLeft(
            child: Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.03),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.white10),
              ),
              child: Row(
                children: [
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)),
                    child: const Icon(LucideIcons.gift, color: Colors.pinkAccent, size: 20),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p['name'] ?? "New Reward", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                        Text(p['description'] ?? "Unlocked at Lv. ${p['required_level']}", style: const TextStyle(color: Colors.white38, fontSize: 11)),
                      ],
                    ),
                  ),
                  if ((p['required_level'] ?? 0) > currentLevel)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(color: Colors.black26, borderRadius: BorderRadius.circular(8)),
                      child: Text("Lv. ${p['required_level']}", style: const TextStyle(color: Colors.orange, fontSize: 10, fontWeight: FontWeight.bold)),
                    )
                  else
                    const Icon(LucideIcons.checkCircle, color: Colors.greenAccent, size: 18),
                ],
              ),
            ),
          )),
      ],
    );
  }
}
