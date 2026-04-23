import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class AdminVipNobleHubScreen extends StatefulWidget {
  const AdminVipNobleHubScreen({super.key});

  @override
  State<AdminVipNobleHubScreen> createState() => _AdminVipNobleHubScreenState();
}

class _AdminVipNobleHubScreenState extends State<AdminVipNobleHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _vipTiers = [];
  List<Map<String, dynamic>> _nobleCards = [];
  List<Map<String, dynamic>> _vipMedals = [];
  Map<String, int> _stats = {'vipTiers': 0, 'medals': 0, 'nobleCards': 0, 'activeVIPs': 0};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final tiersRes = await supa.from('vip_tiers').select('*').order('level', ascending: true);
      final privsRes = await supa.from('level_privileges').select('*').or('privilege_type.eq.vip_medal,privilege_type.eq.noble_card');
      
      final activeVipCount = await supa.from('profiles').select('id', count: CountOption.exact).gt('vip_tier', 0);

      final privs = List<Map<String, dynamic>>.from(privsRes);
      setState(() {
        _vipTiers = List<Map<String, dynamic>>.from(tiersRes);
        _nobleCards = privs.where((p) => p['privilege_type'] == 'noble_card').toList();
        _vipMedals = privs.where((p) => p['privilege_type'] == 'vip_medal').toList();
        
        _stats['vipTiers'] = _vipTiers.length;
        _stats['medals'] = _vipMedals.length;
        _stats['nobleCards'] = _nobleCards.length;
        _stats['activeVIPs'] = activeVipCount.count ?? 0;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading VIP & Noble system: $e");
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
          _buildStatsOverview(),
          _buildTabHeader(),
          Expanded(
            child: TabBarView(
              controller: _tabController,
              children: [
                _buildVipTiers(),
                _buildVipMedals(),
                _buildNobleCards(),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(40),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Colors.amberAccent.withOpacity(0.1), Colors.transparent],
        ),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.amber, Colors.orangeAccent]), borderRadius: BorderRadius.circular(16)),
            child: const Icon(LucideIcons.crown, color: Colors.white, size: 28),
          ),
          const SizedBox(width: 24),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("VIP & NOBLE SYSTEM", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
              const Text("Governance for premium tiers, exclusive medals, and high-status Noble identity cards", style: TextStyle(color: Colors.white24, fontSize: 13)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatsOverview() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      child: Row(
        children: [
          _statCard("VIP TIERS", _stats['vipTiers'].toString(), LucideIcons.crown, Colors.amberAccent),
          const SizedBox(width: 16),
          _statCard("VIP MEDALS", _stats['medals'].toString(), LucideIcons.medal, Colors.purpleAccent),
          const SizedBox(width: 16),
          _statCard("NOBLE CARDS", _stats['nobleCards'].toString(), LucideIcons.creditCard, Colors.roseAccent),
        ],
      ),
    );
  }

  Widget _statCard(String label, String value, IconData icon, Color color) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.1))),
        child: Row(
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 16),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                Text(label, style: const TextStyle(color: Colors.white24, fontSize: 9, fontWeight: FontWeight.bold)),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildTabHeader() {
    return Container(
      margin: const EdgeInsets.all(40),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.amber, Colors.orangeAccent]), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelColor: Colors.white24,
        tabs: const [Tab(text: "VIP TIERS"), Tab(text: "VIP MEDALS"), Tab(text: "NOBLE CARDS")],
      ),
    );
  }

  Widget _buildVipTiers() {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Colors.amber));

    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 16, mainAxisSpacing: 16, childAspectRatio: 2.5),
      itemCount: _vipTiers.length,
      itemBuilder: (context, index) {
        final v = _vipTiers[index];
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Row(
              children: [
                Container(
                  width: 48, height: 48,
                  decoration: BoxDecoration(color: Colors.amber.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
                  child: Center(child: Text(v['icon'] ?? "👑", style: const TextStyle(fontSize: 24))),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Text(v['name'] ?? "Tier ${v['level']}", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                      Text("Level ${v['level']}+", style: const TextStyle(color: Colors.white24, fontSize: 10)),
                    ],
                  ),
                ),
                _iconBtn(LucideIcons.edit3, Colors.white.withOpacity(0.05), () {}),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildVipMedals() {
    return _buildPrivilegeGrid(_vipMedals, "VIP MEDAL", Colors.purpleAccent);
  }

  Widget _buildNobleCards() {
    return _buildPrivilegeGrid(_nobleCards, "NOBLE CARD", Colors.roseAccent);
  }

  Widget _buildPrivilegeGrid(List<Map<String, dynamic>> items, String type, Color color) {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: color));

    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 16, mainAxisSpacing: 16, childAspectRatio: 1.2),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return FadeInUp(
          delay: Duration(milliseconds: 20 * index),
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Column(
              children: [
                Expanded(
                  child: Container(
                    width: double.infinity,
                    margin: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
                    child: Center(
                      child: item['preview_url'] != null
                          ? CachedNetworkImage(imageUrl: item['preview_url'], width: 80)
                          : Icon(LucideIcons.image, color: color.withOpacity(0.2), size: 40),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item['name'], style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                          Text("Unlock Level ${item['unlock_level']}+", style: const TextStyle(color: Colors.white24, fontSize: 10)),
                        ],
                      ),
                      _iconBtn(LucideIcons.edit3, Colors.white10, () {}),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _iconBtn(IconData icon, Color bg, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
        child: Icon(icon, color: Colors.white, size: 14),
      ),
    );
  }
}
