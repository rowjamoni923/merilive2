import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/premium_avatar.dart';

class PayrollHelperGuideScreen extends StatefulWidget {
  const PayrollHelperGuideScreen({super.key});

  @override
  State<PayrollHelperGuideScreen> createState() => _PayrollHelperGuideScreenState();
}

class _PayrollHelperGuideScreenState extends State<PayrollHelperGuideScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _searchController = TextEditingController();
  
  String _selectedTab = "Official";
  String _searchQuery = "";
  bool _isLoading = true;
  
  List<Map<String, dynamic>> _allHelpers = [];
  List<Map<String, dynamic>> _filteredHelpers = [];

  final List<String> _tabs = ["Official", "L5 Helper", "Trader", "Agency"];

  @override
  void initState() {
    super.initState();
    _loadData();
    _searchController.addListener(() {
      setState(() {
        _searchQuery = _searchController.text.toLowerCase();
        _filterHelpers();
      });
    });
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      final countryCode = profile?['country_code'] ?? 'BD';
      
      final results = await Future.wait([
        _api.getAdminPaymentMethods(countryCode), // Official
        _api.getRechargeHelpers(countryCode),     // L5 Helpers
        _api.getSupabase().from('topup_helpers').select('*, user:profiles(*)').eq('is_verified', true), // Traders
        _api.getAdminAgencies(),           // Agencies
      ]);

      List<Map<String, dynamic>> official = (results[0] as List).map((e) => {
        'type': 'Official',
        'name': e['account_name'] ?? 'Official Admin',
        'uid': 'OFFICIAL',
        'avatar_url': 'https://vclgroupbd.com/wp-content/uploads/2024/09/cropped-favicon-32x32.png',
        'user_id': e['id'],
        'is_official': true,
      }).toList();

      List<Map<String, dynamic>> l5Helpers = (results[1] as List).map((e) {
        final user = e['helper']['user'];
        return {
          'type': 'L5 Helper',
          'name': user['display_name'] ?? 'Unknown',
          'uid': user['app_uid'] ?? 'N/A',
          'avatar_url': user['avatar_url'],
          'user_id': user['id'],
          'frame_id': user['equipped_frame_id'],
        };
      }).toList();

      List<Map<String, dynamic>> traders = (results[2] as List).map((e) {
        final user = e['user'];
        return {
          'type': 'Trader',
          'name': user['display_name'] ?? 'Unknown',
          'uid': user['app_uid'] ?? 'N/A',
          'avatar_url': user['avatar_url'],
          'user_id': user['id'],
          'frame_id': user['equipped_frame_id'],
        };
      }).toList();

      List<Map<String, dynamic>> agencies = (results[3] as List).map((e) {
        final owner = e['owner'];
        return {
          'type': 'Agency',
          'name': e['name'] ?? 'Unknown Agency',
          'uid': e['agency_code'] ?? 'N/A',
          'avatar_url': owner?['avatar_url'],
          'user_id': owner?['id'],
          'frame_id': owner?['equipped_frame_id'],
        };
      }).toList();

      setState(() {
        _allHelpers = [...official, ...l5Helpers, ...traders, ...agencies];
        _filterHelpers();
      });
    } catch (e) {
      debugPrint("Parity Helper Error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _filterHelpers() {
    _filteredHelpers = _allHelpers.where((h) {
      final matchesTab = h['type'] == _selectedTab;
      final matchesSearch = h['name'].toString().toLowerCase().contains(_searchQuery) || 
                           h['uid'].toString().toLowerCase().contains(_searchQuery);
      return matchesTab && matchesSearch;
    }).toList();
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
                _buildSearchBar(),
                _buildCategoryTabs(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
                    : _buildHelperGrid(),
                ),
                _buildTipsSection(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Padding(
      padding: const EdgeInsets.all(24),
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
              Text("Payroll Guide", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              Text("Master Copy • Verified Top-up Partners", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
            ],
          ),
          const Spacer(),
          IconButton(icon: const Icon(LucideIcons.refreshCcw, color: Colors.white24, size: 18), onPressed: _loadData),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white10),
        ),
        child: TextField(
          controller: _searchController,
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: "Search by partner name or UID...",
            hintStyle: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 13),
            prefixIcon: Icon(LucideIcons.search, color: Colors.white.withOpacity(0.3), size: 18),
            border: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(vertical: 16),
          ),
        ),
      ),
    );
  }

  Widget _buildCategoryTabs() {
    return Container(
      height: 44,
      margin: const EdgeInsets.symmetric(vertical: 24),
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        physics: const BouncingScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        itemCount: _tabs.length,
        itemBuilder: (context, index) {
          final tab = _tabs[index];
          final isSelected = _selectedTab == tab;
          return GestureDetector(
            onTap: () {
              setState(() {
                _selectedTab = tab;
                _filterHelpers();
              });
            },
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.only(right: 12),
              padding: const EdgeInsets.symmetric(horizontal: 20),
              decoration: BoxDecoration(
                color: isSelected ? Colors.cyanAccent.withOpacity(0.1) : Colors.white.withOpacity(0.02),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: isSelected ? Colors.cyanAccent.withOpacity(0.3) : Colors.white10),
              ),
              alignment: Alignment.center,
              child: Text(tab.toUpperCase(), style: GoogleFonts.outfit(color: isSelected ? Colors.cyanAccent : Colors.white38, fontWeight: FontWeight.bold, fontSize: 11)),
            ),
          );
        },
      ),
    );
  }

  Widget _buildHelperGrid() {
    if (_filteredHelpers.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.userX, color: Colors.white10, size: 64),
            const SizedBox(height: 16),
            Text("No partners found in this category", style: TextStyle(color: Colors.white.withOpacity(0.2))),
          ],
        ),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      physics: const BouncingScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 16,
        mainAxisSpacing: 16,
        childAspectRatio: 0.8,
      ),
      itemCount: _filteredHelpers.length,
      itemBuilder: (context, index) => FadeInUp(
        delay: Duration(milliseconds: 40 * index),
        child: _buildHelperCard(_filteredHelpers[index]),
      ),
    );
  }

  Widget _buildHelperCard(Map<String, dynamic> helper) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          PremiumAvatar(
            imageUrl: helper['avatar_url'] ?? 'https://via.placeholder.com/150',
            size: 64,
            frameId: helper['frame_id'],
          ),
          const SizedBox(height: 16),
          Text(helper['name'], textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 15)),
          Text("ID: ${helper['uid']}", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11)),
          const SizedBox(height: 16),
          GestureDetector(
            onTap: () => _handleContact(helper),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
              decoration: BoxDecoration(
                gradient: LinearGradient(colors: [Colors.cyanAccent.withOpacity(0.2), Colors.blueAccent.withOpacity(0.2)]),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: Colors.cyanAccent.withOpacity(0.2)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(LucideIcons.messageCircle, color: Colors.cyanAccent, size: 14),
                  const SizedBox(width: 8),
                  Text("MESSAGE", style: GoogleFonts.outfit(color: Colors.cyanAccent, fontSize: 11, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTipsSection() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.shieldCheck, color: Colors.greenAccent, size: 20),
              const SizedBox(width: 12),
              Text("Trust & Safety Guide", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 16),
          _buildTipItem("Level 5 Helpers maintain 300K+ diamond stock for fast top-ups."),
          _buildTipItem("Always verify partner UID before sending large payments."),
          _buildTipItem("Official Admin transfers are guaranteed by MeriLive Security."),
        ],
      ),
    );
  }

  Widget _buildTipItem(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(margin: const EdgeInsets.only(top: 6), width: 4, height: 4, decoration: const BoxDecoration(color: Colors.white24, shape: BoxShape.circle)),
          const SizedBox(width: 12),
          Expanded(child: Text(text, style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11, height: 1.4))),
        ],
      ),
    );
  }

  Future<void> _handleContact(Map<String, dynamic> helper) async {
    if (helper['user_id'] == null) return;
    final convId = await _api.getOrCreateConversation(helper['user_id']);
    if (convId != null && mounted) {
       Navigator.pushNamed(context, '/chat', arguments: {
         'conversation_id': convId,
         'other_user_id': helper['user_id'],
         'other_user_name': helper['name'],
       });
    }
  }
}
