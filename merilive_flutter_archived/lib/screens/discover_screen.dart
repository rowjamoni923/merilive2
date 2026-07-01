import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:provider/provider.dart';
import '../services/api_service.dart';
import '../widgets/premium_party_card.dart';
import '../theme/app_theme.dart';
import 'dart:ui';

class DiscoverScreen extends StatefulWidget {
  const DiscoverScreen({super.key});

  @override
  State<DiscoverScreen> createState() => _DiscoverScreenState();
}

class _DiscoverScreenState extends State<DiscoverScreen> {
  final ApiService _api = ApiService();
  String _activeTab = 'all';
  String _selectedCountry = 'all';
  String _searchQuery = '';
  List<Map<String, dynamic>> _rooms = [];
  bool _isLoading = true;

  final List<Map<String, String>> _countries = [
    {'code': 'all', 'name': 'All', 'flag': '🌍'},
    {'code': 'BD', 'name': 'Bangladesh', 'flag': '🇧🇩'},
    {'code': 'IN', 'name': 'India', 'flag': '🇮🇳'},
    {'code': 'PK', 'name': 'Pakistan', 'flag': '🇵🇰'},
    {'code': 'SA', 'name': 'Saudi Arabia', 'flag': '🇸🇦'},
  ];

  @override
  void initState() {
    super.initState();
    _loadRooms();
  }

  Future<void> _loadRooms() async {
    setState(() => _isLoading = true);
    try {
      final rooms = await _api.getPartyRooms(
        roomType: _activeTab == 'all' ? null : _activeTab,
        countryCode: _selectedCountry == 'all' ? null : _selectedCountry,
        searchQuery: _searchQuery,
      );
      if (mounted) setState(() => _rooms = rooms);
    } catch (e) {
      debugPrint("Error loading rooms: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F0C29),
      body: Stack(
        children: [
          // Background Glow
          Positioned(
            top: -100,
            left: -100,
            child: Container(width: 300, height: 300, decoration: BoxDecoration(color: Colors.purple.withOpacity(0.15), shape: BoxShape.circle, filter: ImageFilter.blur(sigmaX: 100, sigmaY: 100))),
          ),

          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                _buildTabs(),
                _buildCountryScroller(),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _loadRooms,
                    color: AppTheme.primaryPink,
                    child: _isLoading 
                      ? const Center(child: CircularProgressIndicator(color: AppTheme.primaryPink))
                      : _buildRoomGrid(),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 10, 20, 15),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text("Discover", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 1)),
              _buildCircularAction(LucideIcons.refreshCw, () => _loadRooms()),
            ],
          ),
          const SizedBox(height: 15),
          Container(
            height: 45,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.05),
              borderRadius: BorderRadius.circular(25),
              border: Border.all(color: Colors.white.withOpacity(0.1)),
            ),
            child: Row(
              children: [
                const Icon(LucideIcons.search, color: Colors.white38, size: 18),
                const SizedBox(width: 12),
                Expanded(
                  child: TextField(
                    onChanged: (val) {
                      setState(() => _searchQuery = val);
                      _loadRooms();
                    },
                    style: const TextStyle(color: Colors.white, fontSize: 14),
                    decoration: const InputDecoration(
                      hintText: "Search party rooms...",
                      hintStyle: TextStyle(color: Colors.white24),
                      border: InputBorder.none,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildCircularAction(IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle, border: Border.all(color: Colors.white.withOpacity(0.1))),
        child: Icon(icon, color: Colors.white70, size: 20),
      ),
    );
  }

  Widget _buildTabs() {
    final tabs = [
      {'id': 'all', 'label': 'All', 'icon': null},
      {'id': 'video', 'label': 'Video', 'icon': LucideIcons.monitor},
      {'id': 'audio', 'label': 'Audio', 'icon': LucideIcons.mic},
      {'id': 'game', 'label': 'Game', 'icon': LucideIcons.gamepad2},
    ];

    return Container(
      height: 40,
      margin: const EdgeInsets.symmetric(horizontal: 20),
      child: Row(
        children: tabs.map((t) => _buildTabItem(t['id'] as String, t['label'] as String, t['icon'] as IconData?)).toList(),
      ),
    );
  }

  Widget _buildTabItem(String id, String label, IconData? icon) {
    bool isActive = _activeTab == id;
    Color activeColor = id == 'video' ? Colors.green : (id == 'audio' ? Colors.blue : (id == 'game' ? Colors.pink : AppTheme.primaryPink));

    return Expanded(
      child: GestureDetector(
        onTap: () {
          setState(() => _activeTab = id);
          _loadRooms();
        },
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          margin: const EdgeInsets.symmetric(horizontal: 4),
          decoration: BoxDecoration(
            gradient: isActive ? LinearGradient(colors: [activeColor, activeColor.withOpacity(0.7)]) : null,
            color: isActive ? null : Colors.white.withOpacity(0.05),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (icon != null) ...[Icon(icon, color: isActive ? Colors.white : Colors.white38, size: 14), const SizedBox(width: 5)],
              Text(label, style: GoogleFonts.outfit(color: isActive ? Colors.white : Colors.white38, fontSize: 12, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildCountryScroller() {
    return Container(
      height: 34,
      margin: const EdgeInsets.symmetric(vertical: 15),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 20),
        scrollDirection: Axis.horizontal,
        itemCount: _countries.length,
        itemBuilder: (context, index) {
          final c = _countries[index];
          final bool isSelected = _selectedCountry == c['code'];
          return GestureDetector(
            onTap: () {
              setState(() => _selectedCountry = c['code']!);
              _loadRooms();
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.only(right: 10),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                gradient: isSelected ? AppTheme.primaryGradient : null,
                color: isSelected ? null : Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(17),
                border: Border.all(color: isSelected ? Colors.transparent : Colors.white10),
              ),
              child: Row(
                children: [
                  Text(c['flag']!, style: const TextStyle(fontSize: 14)),
                  const SizedBox(width: 8),
                  Text(c['name']!, style: GoogleFonts.outfit(color: isSelected ? Colors.white : Colors.white54, fontSize: 11, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildRoomGrid() {
    if (_rooms.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.sparkles, color: Colors.white10, size: 64),
            const SizedBox(height: 16),
            Text("No Active Rooms", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 18, fontWeight: FontWeight.bold)),
            Text("Hosts will appear here soon!", style: GoogleFonts.outfit(color: Colors.white24, fontSize: 13)),
          ],
        ),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 5),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2, 
        mainAxisSpacing: 16, 
        crossAxisSpacing: 16, 
        childAspectRatio: 0.85,
      ),
      itemCount: _rooms.length,
      itemBuilder: (context, index) => FadeInUp(
        duration: const Duration(milliseconds: 400),
        delay: Duration(milliseconds: index * 50),
        child: PremiumPartyCard(
          room: _rooms[index],
          onTap: () => Navigator.pushNamed(context, '/party_room', arguments: _rooms[index]),
        ),
      ),
    );
  }
}
