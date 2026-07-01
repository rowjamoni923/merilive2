import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:intl/intl.dart';
import '../services/api_service.dart';
import '../widgets/level_badge.dart';
import '../utils/level_utils.dart';
import 'package:cached_network_image/cached_network_image.dart';

class LevelScreen extends StatefulWidget {
  const LevelScreen({super.key});

  @override
  State<LevelScreen> createState() => _LevelScreenState();
}

class _LevelScreenState extends State<LevelScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  String? _levelIconUrl;
  bool _isLoading = true;
  int _currentLevel = 0;
  int _currentXP = 0;
  int _nextLevelNumber = 1;
  int _nextLevelXP = 0;
  double _progress = 0.0;
  String _levelType = 'user'; // 'user' or 'host'
  
  List<Map<String, dynamic>> _tiers = [];
  List<Map<String, dynamic>> _privileges = [];
  int _selectedTabLevel = 1;

  @override
  void initState() {
    super.initState();
    _loadLevelData();
  }

  Future<void> _loadLevelData() async {
    setState(() => _isLoading = true);
    try {
      final userId = _api.currentUserId;
      if (userId == null) return;

      final profile = await _api.getMyProfile();
      if (profile == null) return;

      final bool isFemaleHost = (profile['is_host'] ?? false) && 
                                (profile['gender']?.toString().toLowerCase() == 'female');
      _levelType = isFemaleHost ? 'host' : 'user';

      // 1. Fetch Tiers & Privileges in parallel
      final results = await Future.wait([
        _api.getSupabase().from('user_level_tiers').select('*').eq('tier_type', _levelType).eq('is_active', true).order('level_number'),
        _api.getSupabase().from('level_privileges').select('*').eq('is_active', true).order('display_order'),
      ]);

      _tiers = List<Map<String, dynamic>>.from(results[0]);
      _privileges = List<Map<String, dynamic>>.from(results[1]);

      // 2. Resolve Level Progress (Shared Logic Parity)
      final result = await LevelUtils.resolveLevelProgress(profile, _tiers);
      
      _currentLevel = result['level'];
      _currentXP = result['currentXP'];
      _progress = result['progress'];
      _nextLevelXP = result['nextLevelXP'];
      _nextLevelNumber = result['nextLevelNumber'];
      _levelIconUrl = result['iconUrl'];
      _selectedTabLevel = _currentLevel;

      setState(() => _isLoading = false);
    } catch (e) {
      debugPrint("Error loading level: $e");
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(backgroundColor: Color(0xFF0C0515), body: Center(child: CircularProgressIndicator(color: Color(0xFFEC4899))));
    }

    final Color themeColor = _levelType == 'host' ? const Color(0xFFEC4899) : const Color(0xFF3B82F6);

    return Scaffold(
      backgroundColor: const Color(0xFF0C0515),
      body: Stack(
        children: [
          // 1. Nebula Background
          Positioned.fill(
            child: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [Color(0xFF1A0533), Color(0xFF0F0720), Color(0xFF0C0515)],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
            ),
          ),
          
          // 2. Content
          CustomScrollView(
            physics: const BouncingScrollPhysics(),
            slivers: [
              _buildSliverAppBar(),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 20),
                      _buildLevelHeroCard(themeColor),
                      const SizedBox(height: 32),
                      _buildPrivilegesSection(themeColor),
                      const SizedBox(height: 32),
                      _buildRulesSection(themeColor),
                      const SizedBox(height: 120),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // 3. Bottom Action
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: _buildBottomAction(themeColor),
          ),
        ],
      ),
    );
  }

  Widget _buildSliverAppBar() {
    return SliverAppBar(
      backgroundColor: Colors.transparent,
      elevation: 0,
      pinned: true,
      centerTitle: true,
      leading: IconButton(
        icon: Container(padding: const EdgeInsets.all(8), decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)), child: const Icon(LucideIcons.arrowLeft, color: Colors.white, size: 18)),
        onPressed: () => Navigator.pop(context),
      ),
      title: Text("My Level", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildLevelHeroCard(Color themeColor) {
    return FadeInUp(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: themeColor.withOpacity(0.1),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(color: themeColor.withOpacity(0.2)),
          boxShadow: [BoxShadow(color: themeColor.withOpacity(0.1), blurRadius: 40, offset: const Offset(0, 10))],
        ),
        child: Column(
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: themeColor.withOpacity(0.2), borderRadius: BorderRadius.circular(20)),
                        child: Text(_levelType == 'host' ? '👸 Host Level' : '💎 User Level', style: GoogleFonts.outfit(color: themeColor, fontSize: 10, fontWeight: FontWeight.w800)),
                      ),
                      const SizedBox(height: 12),
                      Row(
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text("Level", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.6), fontSize: 18)),
                          const SizedBox(width: 8),
                          Text(_currentLevel.toString(), style: GoogleFonts.outfit(color: Colors.white, fontSize: 64, fontWeight: FontWeight.black, height: 1)),
                        ],
                      ),
                    ],
                  ),
                ),
                Pulse(
                  infinite: true,
                  child: Container(
                    width: 100, height: 100,
                    decoration: BoxDecoration(shape: BoxShape.circle, boxShadow: [BoxShadow(color: themeColor.withOpacity(0.3), blurRadius: 30)]),
                    child: Center(
                      child: _levelIconUrl != null && _levelIconUrl!.startsWith('http')
                        ? CachedNetworkImage(imageUrl: _levelIconUrl!, width: 80, height: 80, fit: BoxFit.contain)
                        : Text(_levelType == 'host' ? "👸" : "💎", style: const TextStyle(fontSize: 64)),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(
                  children: [
                    Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: themeColor.withOpacity(0.3), borderRadius: BorderRadius.circular(8)), child: Text("Lv$_currentLevel", style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold))),
                    const SizedBox(width: 8),
                    Icon(_levelType == 'host' ? LucideIcons.beans : LucideIcons.gem, color: Colors.amber, size: 14),
                    const SizedBox(width: 4),
                    Text(NumberFormat.compact().format(_currentXP), style: GoogleFonts.spaceMono(color: Colors.amber, fontSize: 12, fontWeight: FontWeight.bold)),
                  ],
                ),
                Text("Lv$_nextLevelNumber", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 10)),
              ],
            ),
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: LinearProgressIndicator(value: _progress / 100, minHeight: 12, backgroundColor: themeColor.withOpacity(0.1), valueColor: AlwaysStoppedAnimation(themeColor)),
            ),
            const SizedBox(height: 12),
            Text(
              _levelType == 'host' 
                ? "Earn ${NumberFormat.compact().format(_nextLevelXP - _currentXP)} more beans to level up"
                : "Top up ${NumberFormat.compact().format(_nextLevelXP - _currentXP)} diamonds to level up",
              style: GoogleFonts.outfit(color: themeColor.withOpacity(0.7), fontSize: 11, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPrivilegesSection(Color themeColor) {
    final filteredPrivileges = _privileges.where((p) => (p['unlock_level'] ?? 0) <= _selectedTabLevel).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Level Privileges", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          physics: const BouncingScrollPhysics(),
          child: Row(
            children: _tiers.map((t) {
              bool isSelected = _selectedTabLevel == t['level_number'];
              return GestureDetector(
                onTap: () => setState(() => _selectedTabLevel = t['level_number']),
                child: Container(
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(
                    gradient: isSelected ? LinearGradient(colors: [themeColor, themeColor.withOpacity(0.7)]) : null,
                    color: isSelected ? null : Colors.white.withOpacity(0.05),
                    borderRadius: BorderRadius.circular(30),
                  ),
                  child: Text("Lv${t['level_number']}", style: GoogleFonts.outfit(color: isSelected ? Colors.white : Colors.white60, fontWeight: FontWeight.bold)),
                ),
              );
            }).toList(),
          ),
        ),
        const SizedBox(height: 20),
        ListView.builder(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: filteredPrivileges.length,
          itemBuilder: (context, index) {
            final p = filteredPrivileges[index];
            bool isUnlocked = (p['unlock_level'] ?? 0) <= _currentLevel;
            return Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: isUnlocked ? Colors.white.withOpacity(0.06) : Colors.white.withOpacity(0.02),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: isUnlocked ? Colors.white.withOpacity(0.1) : Colors.transparent),
              ),
              child: Row(
                children: [
                  Container(
                    width: 56, height: 56,
                    decoration: BoxDecoration(color: Color(int.parse((p['icon_bg_color'] ?? '#333333').replaceAll('#', '0xFF'))), borderRadius: BorderRadius.circular(16)),
                    child: Icon(_getIconData(p['icon_name']), color: Colors.white, size: 28),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(p['name'] ?? '', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                        Text(p['description'] ?? '', style: GoogleFonts.outfit(color: Colors.white54, fontSize: 12)),
                      ],
                    ),
                  ),
                  if (!isUnlocked) Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12)), child: Text("Lv${p['unlock_level']}", style: const TextStyle(color: Colors.white38, fontSize: 10))),
                  Icon(LucideIcons.chevronRight, color: Colors.white24, size: 18),
                ],
              ),
            );
          },
        ),
      ],
    );
  }

  Widget _buildRulesSection(Color themeColor) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("Level Rules", style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.1))),
          child: Column(
            children: [
              Text(
                _levelType == 'host' 
                  ? 'Host level is determined from your current weekly beans earnings using the live admin tier rules.'
                  : 'User level is determined from your lifetime total top-up using the live admin tier rules.',
                style: GoogleFonts.outfit(color: Colors.white60, fontSize: 13),
              ),
              const SizedBox(height: 20),
              Table(
                columnWidths: const {0: FlexColumnWidth(1), 1: FlexColumnWidth(1.5)},
                children: [
                  TableRow(
                    decoration: BoxDecoration(color: Colors.white.withOpacity(0.05)),
                    children: [
                      Padding(padding: const EdgeInsets.all(12), child: Center(child: Text("Level", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)))),
                      Padding(padding: const EdgeInsets.all(12), child: Center(child: Text(_levelType == 'host' ? "Weekly Beans" : "Total Top-up", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)))),
                    ],
                  ),
                  ..._tiers.take(11).map((t) {
                    bool isCurrent = t['level_number'] == _currentLevel;
                    return TableRow(
                      decoration: BoxDecoration(color: isCurrent ? themeColor.withOpacity(0.1) : Colors.transparent, border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05)))),
                      children: [
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Center(
                            child: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(color: themeColor.withOpacity(0.2), borderRadius: BorderRadius.circular(8)),
                              child: Text("Lv${t['level_number']}", style: TextStyle(color: isCurrent ? Colors.white : Colors.white70, fontWeight: FontWeight.bold)),
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.all(12),
                          child: Center(
                            child: Text(
                              NumberFormat.compact().format(t[_levelType == 'host' ? 'min_earning_amount' : 'min_topup_amount'] ?? 0),
                              style: GoogleFonts.spaceMono(color: Colors.white, fontWeight: FontWeight.w600),
                            ),
                          ),
                        ),
                      ],
                    );
                  }).toList(),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildBottomAction(Color themeColor) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF0C0515).withOpacity(0.9),
        border: Border(top: BorderSide(color: Colors.white.withOpacity(0.05))),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          width: double.infinity,
          height: 60,
          child: ElevatedButton(
            onPressed: () => Navigator.pushNamed(context, _levelType == 'host' ? '/host-dashboard' : '/recharge'),
            style: ElevatedButton.styleFrom(
              backgroundColor: themeColor,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              elevation: 0,
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(_levelType == 'host' ? LucideIcons.trendingUp : LucideIcons.coins, color: Colors.white),
                const SizedBox(width: 12),
                Text(_levelType == 'host' ? "VIEW EARNINGS" : "TOP UP NOW", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900)),
              ],
            ),
          ),
        ),
      ),
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
}
