import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/avatar_with_frame.dart';
import '../widgets/nebula_background.dart';

class AgencyHostManagementScreen extends StatefulWidget {
  const AgencyHostManagementScreen({super.key});

  @override
  State<AgencyHostManagementScreen> createState() => _AgencyHostManagementScreenState();
}

class _AgencyHostManagementScreenState extends State<AgencyHostManagementScreen> with SingleTickerProviderStateMixin {
  final ApiService _api = ApiService();
  late TabController _tabController;
  final TextEditingController _searchController = TextEditingController();
  
  List<Map<String, dynamic>> _hosts = [];
  List<Map<String, dynamic>> _filteredHosts = [];
  bool _isLoading = true;
  Map<String, dynamic> _stats = {'active': 0, 'pending': 0, 'total_revenue': 0};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _tabController.addListener(() {
      if (!_tabController.indexIsChanging) _loadData();
    });
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      if (profile != null && profile['agency_id'] != null) {
        final agencyId = profile['agency_id'];
        final status = _tabController.index == 0 ? 'active' : 'pending';
        
        final results = await Future.wait([
          _api.getAgencyHosts(agencyId, status),
          _api.getSupabase().from('agency_hosts').select('total_revenue_generated').eq('agency_id', agencyId).eq('status', 'active'),
          _api.getSupabase().from('agency_hosts').select('id', count: CountOption.exact).eq('agency_id', agencyId).eq('status', 'pending'),
        ]);

        final hostData = results[0] as List<Map<String, dynamic>>;
        final activeRevenues = results[1] as List;
        final pendingCount = (results[2] as PostgrestResponse).count ?? 0;

        if (mounted) {
          setState(() {
            _hosts = hostData;
            _stats['active'] = activeRevenues.length;
            _stats['pending'] = pendingCount;
            _stats['total_revenue'] = activeRevenues.fold(0, (sum, e) => sum + ((e['total_revenue_generated'] ?? 0) as num).toInt());
            _filterHosts();
          });
        }
      }
    } catch (e) {
      debugPrint("Parity Host Error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _filterHosts() {
    final query = _searchController.text.toLowerCase();
    setState(() {
      _filteredHosts = _hosts.where((h) {
        final profile = h['profile'] ?? {};
        final name = (profile['display_name'] ?? '').toLowerCase();
        final id = (profile['app_uid']?.toString() ?? '').toLowerCase();
        return name.contains(query) || id.contains(query);
      }).toList();
    });
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
                _buildAppBar(),
                _buildStatsSnapshot(),
                _buildSearchBar(),
                _buildTabBar(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
                    : _buildContent(),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar() {
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
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Recruitment Engine", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
                Text("Master Copy • Human Resources", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
              ],
            ),
          ),
          GestureDetector(
            onTap: () => Navigator.pushNamed(context, '/agency-smart-link'),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.cyanAccent.withOpacity(0.2))),
              child: const Icon(LucideIcons.userPlus, color: Colors.cyanAccent, size: 20),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildStatsSnapshot() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24),
      child: Row(
        children: [
          Expanded(child: _buildStatCard("Live", _stats['active'].toString(), Colors.greenAccent)),
          const SizedBox(width: 12),
          Expanded(child: _buildStatCard("Review", _stats['pending'].toString(), Colors.amberAccent)),
          const SizedBox(width: 12),
          Expanded(child: _buildStatCard("Volume", _api.formatNumber(_stats['total_revenue']), Colors.cyanAccent)),
        ],
      ),
    );
  }

  Widget _buildStatCard(String label, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label, style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.3), fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 1)),
          const SizedBox(height: 6),
          Text(value, style: GoogleFonts.outfit(color: color, fontSize: 18, fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Container(
        height: 54,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.04),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        child: TextField(
          controller: _searchController,
          onChanged: (_) => _filterHosts(),
          style: const TextStyle(color: Colors.white),
          decoration: InputDecoration(
            hintText: "Search name or ID...",
            hintStyle: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 13),
            prefixIcon: Icon(LucideIcons.search, color: Colors.white.withOpacity(0.2), size: 18),
            border: InputBorder.none,
            contentPadding: const EdgeInsets.symmetric(vertical: 18),
          ),
        ),
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 24),
      height: 48,
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20)),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.cyanAccent.withOpacity(0.3))),
        labelColor: Colors.cyanAccent,
        unselectedLabelColor: Colors.white.withOpacity(0.2),
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 12, letterSpacing: 1),
        tabs: const [Tab(text: "LIVE ROSTER"), Tab(text: "APPLICATIONS")],
      ),
    );
  }

  Widget _buildContent() {
    if (_filteredHosts.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.users, color: Colors.white.withOpacity(0.05), size: 80),
            const SizedBox(height: 20),
            Text("No hosts found", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 15)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(24),
      physics: const BouncingScrollPhysics(),
      itemCount: _filteredHosts.length,
      itemBuilder: (context, index) => FadeInUp(
        delay: Duration(milliseconds: 30 * (index % 10)),
        child: _buildHostTile(_filteredHosts[index], _tabController.index == 1),
      ),
    );
  }

  Widget _buildHostTile(Map<String, dynamic> host, bool isPending) {
    final profile = host['profile'] ?? {};
    final avatar = profile['avatar_url'];
    final name = profile['display_name'] ?? 'Unknown';
    final uid = profile['app_uid'] ?? 'N/A';
    final revenue = host['total_revenue_generated'] ?? 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: isPending ? Colors.amberAccent.withOpacity(0.02) : Colors.white.withOpacity(0.02),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: isPending ? Colors.amberAccent.withOpacity(0.05) : Colors.white.withOpacity(0.05)),
      ),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.all(2),
            decoration: BoxDecoration(color: isPending ? Colors.amberAccent : Colors.cyanAccent, shape: BoxShape.circle),
            child: CircleAvatar(radius: 24, backgroundImage: avatar != null ? NetworkImage(avatar) : null, backgroundColor: const Color(0xFF1E293B)),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                Text("UID: $uid", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11)),
              ],
            ),
          ),
          if (isPending)
            _buildActionButtons(host['id'])
          else
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(_api.formatNumber(revenue), style: GoogleFonts.outfit(color: Colors.cyanAccent, fontWeight: FontWeight.w900, fontSize: 16)),
                Text("CUMULATIVE BEANS", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 8, fontWeight: FontWeight.bold)),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildActionButtons(String requestId) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          onTap: () => _handleAction(requestId, 'reject'),
          child: Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.1), shape: BoxShape.circle), child: const Icon(LucideIcons.x, color: Colors.redAccent, size: 18)),
        ),
        const SizedBox(width: 8),
        GestureDetector(
          onTap: () => _handleAction(requestId, 'approve'),
          child: Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: Colors.greenAccent.withOpacity(0.1), shape: BoxShape.circle), child: const Icon(LucideIcons.check, color: Colors.greenAccent, size: 18)),
        ),
      ],
    );
  }

  Future<void> _handleAction(String requestId, String action) async {
    try {
      await _api.manageHostRequest(requestId: requestId, action: action);
      _loadData();
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString()), backgroundColor: Colors.redAccent));
    }
  }
}


