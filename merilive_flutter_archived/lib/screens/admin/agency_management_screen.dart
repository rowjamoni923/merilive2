import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';

import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';
import '../../models/agency_model.dart';
import '../../models/profile_model.dart';

class AgencyManagementScreen extends StatefulWidget {
  const AgencyManagementScreen({super.key});

  @override
  State<AgencyManagementScreen> createState() => _AgencyManagementScreenState();
}

class _AgencyManagementScreenState extends State<AgencyManagementScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  
  // State for Agencies Tab
  List<AgencyModel> _agencies = [];
  bool _isLoadingAgencies = true;
  String _searchQuery = "";


  // State for Host Search Tab
  final TextEditingController _hostSearchController = TextEditingController();
  ProfileModel? _searchedHost;
  AgencyModel? _hostAgency;
  bool _isSearchingHost = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadAgencies();
  }

  Future<void> _loadAgencies() async {
    setState(() => _isLoadingAgencies = true);
    try {
      final rawAgencies = await _api.getAdminAgencies();
      setState(() {
        _agencies = rawAgencies.map((json) => AgencyModel.fromJson(json)).toList();
        _isLoadingAgencies = false;
      });
    } catch (e) {
      setState(() => _isLoadingAgencies = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        _buildTabBar(),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildAgenciesTab(),
              _buildSettingsTab(),
              _buildLevelsTab(),
              _buildHostSearchTab(),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white70),
      ),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(
          color: const Color(0xFF6366F1),
          borderRadius: BorderRadius.circular(12),
        ),
        dividerColor: Colors.transparent,
        labelColor: Colors.white,
        unselectedLabelColor: Colors.white38,
        labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold),
        tabs: const [
          Tab(text: "Agencies"),
          Tab(text: "Settings"),
          Tab(text: "Levels"),
          Tab(text: "Search"),
        ],
      ),
    );
  }

  Widget _buildAgenciesTab() {
    if (_isLoadingAgencies) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
    
    final filtered = _agencies.where((a) => 
      a.name.toLowerCase().contains(_searchQuery.toLowerCase()) || 
      a.agencyCode.toLowerCase().contains(_searchQuery.toLowerCase())
    ).toList();

    return Column(
      children: [
        _buildSubHeader("AGENCY LIST", "${filtered.length} Total"),
        _buildAgencySearch(),
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(24),
            itemCount: filtered.length,
            itemBuilder: (context, index) {
              final a = filtered[index];
              return _buildAgencyCard(a, index);
            },
          ),
        ),
      ],
    );
  }

  Widget _buildSubHeader(String title, String subtitle) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title, style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
          Text(subtitle, style: const TextStyle(color: Color(0xFF6366F1), fontSize: 10, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildAgencySearch() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Container(
        height: 48,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.03),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: Colors.white70),
        ),
        child: TextField(
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: const InputDecoration(
            hintText: "Search agency name or code...",
            hintStyle: TextStyle(color: Colors.white24, fontSize: 13),
            prefixIcon: Icon(LucideIcons.search, color: Colors.white24, size: 18),
            border: InputBorder.none,
            contentPadding: EdgeInsets.symmetric(vertical: 13),
          ),
          onChanged: (val) => setState(() => _searchQuery = val),
        ),
      ),
    );
  }

  Widget _buildAgencyCard(AgencyModel a, int index) {
    return FadeInUp(
      delay: Duration(milliseconds: 50 * index),
      child: Container(
        margin: const EdgeInsets.only(bottom: 16),
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: Colors.white70),
        ),
        child: Row(
          children: [
            Hero(
              tag: "agency-${a.id}",
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  gradient: LinearGradient(colors: [const Color(0xFF6366F1).withOpacity(0.2), const Color(0xFFA855F7).withOpacity(0.2)]),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Icon(LucideIcons.building2, color: Color(0xFF6366F1), size: 28),
              ),
            ),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(a.name, style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                  Text("Code: ${a.agencyCode}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      CircleAvatar(
                        radius: 10, 
                        backgroundImage: a.owner?.avatarUrl != null ? NetworkImage(a.owner!.avatarUrl!) : null,
                        backgroundColor: Colors.white10,
                        child: a.owner?.avatarUrl == null ? const Icon(LucideIcons.user, size: 10, color: Colors.white24) : null,
                      ),
                      const SizedBox(width: 8),
                      Text(a.owner?.displayName ?? 'No Owner', style: const TextStyle(color: Colors.white60, fontSize: 11)),
                    ],
                  ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                _buildLevelBadge(a.level),
                const SizedBox(height: 8),
                Text("${a.commissionRate}% Share", style: const TextStyle(color: Colors.greenAccent, fontSize: 12, fontWeight: FontWeight.bold)),
                const SizedBox(height: 16),
                _buildActionBtn("Manage"),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildLevelBadge(String level) {
    Color color = Colors.orange;
    if (level.startsWith('S')) color = Colors.blue;
    if (level.startsWith('G')) color = Colors.amber;
    
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: color.withOpacity(0.15), borderRadius: BorderRadius.circular(8), border: Border.all(color: color.withOpacity(0.3))),
      child: Text(level, style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }

  Widget _buildActionBtn(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white10)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(LucideIcons.settings, color: Colors.white38, size: 12),
          const SizedBox(width: 6),
          Text(label, style: const TextStyle(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildSettingsTab() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSettingsSection("GLOBAL COMMISSION", [
            _buildSettingSlider("Default Agency Rate", 12.0),
            _buildSettingSlider("Sub-Agent Share", 2.0),
          ]),
          const SizedBox(height: 24),
          _buildSettingsSection("SYSTEM ACTIONS", [
            ListTile(
              leading: const Icon(LucideIcons.refreshCw, color: Color(0xFF6366F1)),
              title: const Text("Recalculate All Agency Levels", style: TextStyle(color: Colors.white, fontSize: 14)),
              subtitle: const Text("Scan all earnings and re-assign bronze/silver/gold tiers.", style: TextStyle(color: Colors.white24, fontSize: 11)),
              onTap: () {},
            ),
          ]),
        ],
      ),
    );
  }

  Widget _buildSettingsSection(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
        const SizedBox(height: 16),
        Container(
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white70)),
          child: Column(children: children),
        ),
      ],
    );
  }

  Widget _buildSettingSlider(String label, double value) {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(label, style: const TextStyle(color: Colors.white70, fontSize: 13)),
              Text("${value.toStringAsFixed(1)}%", style: const TextStyle(color: Color(0xFF6366F1), fontWeight: FontWeight.bold)),
            ],
          ),
          Slider(
            value: value,
            max: 20,
            divisions: 200,
            activeColor: const Color(0xFF6366F1),
            inactiveColor: Colors.white10,
            onChanged: (v) {},
          ),
        ],
      ),
    );
  }

  Widget _buildLevelsTab() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(LucideIcons.crown, color: Colors.white10, size: 64),
          const SizedBox(height: 16),
          const Text("Agency Level Tiers", style: TextStyle(color: Colors.white38, fontSize: 16)),
          const Text("Syncing with Supabase table...", style: TextStyle(color: Colors.white54, fontSize: 12)),
        ],
      )
    );
  }

  Widget _buildHostSearchTab() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          Container(
            height: 56,
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
            child: TextField(
              controller: _hostSearchController,
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: "Enter Host ID (app_uid)...",
                hintStyle: const TextStyle(color: Colors.white24),
                prefixIcon: const Icon(LucideIcons.search, color: Colors.white24),
                suffixIcon: IconButton(
                  icon: const Icon(LucideIcons.arrowRight, color: Color(0xFF6366F1)),
                  onPressed: _handleHostSearch,
                ),
                border: InputBorder.none,
                contentPadding: const EdgeInsets.symmetric(vertical: 18),
              ),
              onSubmitted: (_) => _handleHostSearch(),
            ),
          ),
          if (_isSearchingHost) const Padding(padding: EdgeInsets.only(top: 32), child: CircularProgressIndicator(color: Color(0xFF6366F1))),
          if (_searchedHost != null) _buildHostSearchResult(),
        ],
      ),
    );
  }

  Future<void> _handleHostSearch() async {
    final uid = _hostSearchController.text.trim();
    if (uid.isEmpty) return;
    
    setState(() {
      _isSearchingHost = true;
      _searchedHost = null;
      _hostAgency = null;
    });
    
    try {
      final res = await _api.adminSearchHost(uid);
      if (res != null) {
        setState(() {
          _searchedHost = ProfileModel.fromJson(res);
          if (res['agency'] != null) {
            _hostAgency = AgencyModel.fromJson(res['agency']);
          }
          _isSearchingHost = false;
        });
      } else {
        setState(() => _isSearchingHost = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Host not found")));
      }
    } catch (e) {
      setState(() => _isSearchingHost = false);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Search failed: $e")));
    }
  }

  Widget _buildHostSearchResult() {
    return FadeInUp(
      child: Container(
        margin: const EdgeInsets.only(top: 32),
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white70)),
        child: Column(
          children: [
            CircleAvatar(radius: 40, backgroundImage: _searchedHost?.avatarUrl != null ? NetworkImage(_searchedHost!.avatarUrl!) : null, backgroundColor: Colors.white10),
            const SizedBox(height: 16),
            Text(_searchedHost?.displayName ?? 'Host', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            Text("UID: ${_searchedHost?.appUid}", style: const TextStyle(color: Colors.white38, fontSize: 12)),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _buildHostStat("Level", "${_searchedHost?.hostLevel}"),
                _buildHostStat("Join Date", "2024-04-19"),
              ],
            ),
            const Divider(color: Colors.white70, height: 48),
            if (_hostAgency != null) ...[
              const Text("CURRENT AGENCY", style: TextStyle(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5)),
              const SizedBox(height: 12),
              ListTile(
                leading: const Icon(LucideIcons.building2, color: Color(0xFF6366F1)),
                title: Text(_hostAgency!.name, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                subtitle: Text("Code: ${_hostAgency!.agencyCode}", style: const TextStyle(color: Colors.white24, fontSize: 11)),
                trailing: const Icon(LucideIcons.chevronRight, color: Colors.white24),
              ),
            ] else 
              const Text("NOT IN ANY AGENCY", style: TextStyle(color: Colors.redAccent, fontSize: 12, fontWeight: FontWeight.bold)),
          ],
        ),
      ),
    );
  }

  Widget _buildHostStat(String label, String value) {
    return Column(
      children: [
        Text(value, style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
        Text(label, style: const TextStyle(color: Colors.white38, fontSize: 11)),
      ],
    );
  }
}


