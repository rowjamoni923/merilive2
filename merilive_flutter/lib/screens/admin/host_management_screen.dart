import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../services/api_service.dart';

class HostManagementScreen extends StatefulWidget {
  const HostManagementScreen({super.key});

  @override
  State<HostManagementScreen> createState() => _HostManagementScreenState();
}

class _HostManagementScreenState extends State<HostManagementScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _searchController = TextEditingController();
  
  List<Map<String, dynamic>> _hosts = [];
  Map<String, dynamic> _stats = {
    'totalHosts': 0,
    'activeHosts': 0,
    'pendingHosts': 0,
    'blockedHosts': 0,
    'totalEarnings': 0
  };
  
  bool _isLoading = true;
  String _statusFilter = 'all';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      // 1. Fetch Hosts with Agency Join (1:1 with Web query)
      var query = supa.from('profiles').select('''
        id, display_name, avatar_url, is_verified, is_blocked,
        host_level, host_status, call_rate_per_minute, total_earnings,
        total_call_minutes, total_calls_received, agency_id, created_at,
        agencies(name, agency_code)
      ''').eq('is_host', true).order('total_earnings', ascending: false);

      if (_statusFilter != 'all') {
        if (_statusFilter == 'blocked') {
          query = query.eq('is_blocked', true);
        } else {
          query = query.eq('host_status', _statusFilter);
        }
      }

      final hostsRes = await query.limit(100);
      
      // 2. Fetch Stats
      final statsRes = await Future.wait([
        supa.from('profiles').select('id', count: CountOption.exact).eq('is_host', true),
        supa.from('profiles').select('id', count: CountOption.exact).eq('is_host', true).eq('host_status', 'approved').eq('is_blocked', false),
        supa.from('profiles').select('id', count: CountOption.exact).eq('is_host', true).eq('host_status', 'pending'),
        supa.from('profiles').select('id', count: CountOption.exact).eq('is_host', true).eq('is_blocked', true),
        supa.from('profiles').select('total_earnings').eq('is_host', true),
      ]);

      if (mounted) {
        setState(() {
          _hosts = List<Map<String, dynamic>>.from(hostsRes);
          _stats = {
            'totalHosts': statsRes[0].count ?? 0,
            'activeHosts': statsRes[1].count ?? 0,
            'pendingHosts': statsRes[2].count ?? 0,
            'blockedHosts': statsRes[3].count ?? 0,
            'totalEarnings': (statsRes[4].data as List).fold(0, (sum, h) => sum + (h['total_earnings'] ?? 0)),
          };
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Error loading hosts: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _updateHostStatus(String hostId, String status) async {
    // Web parity: Approval sets gender to female, Rejection sets to male
    final bool ok = await _api.updateAdminUserStatus(hostId, false, status: status); 
    if (ok) {
      _loadData();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Host $status successfully")));
    }
  }

  Future<void> _toggleBlock(String hostId, bool block) async {
    final bool ok = await _api.updateAdminUserStatus(hostId, block);
    if (ok) {
      _loadData();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Host ${block ? 'blocked' : 'unblocked'} successfully")));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: ListView(
        padding: const EdgeInsets.all(32),
        children: [
          _buildHeader(),
          const SizedBox(height: 32),
          _buildStatsGrid(),
          const SizedBox(height: 32),
          _buildFilters(),
          const SizedBox(height: 24),
          if (_stats['pendingHosts'] > 0 && _statusFilter != 'pending') _buildWarningBanner("pending"),
          if (_stats['blockedHosts'] > 0 && _statusFilter != 'blocked') _buildWarningBanner("blocked"),
          const SizedBox(height: 24),
          _buildHostTable(),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("HOST MANAGEMENT", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
            const Text("Manage host applications, earnings, and agency associations", style: TextStyle(color: Colors.white38, fontSize: 14)),
          ],
        ),
        ElevatedButton.icon(
          onPressed: () {},
          icon: const Icon(LucideIcons.download, size: 16),
          label: const Text("DOWNLOAD REPORT"),
          style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white),
        ),
      ],
    );
  }

  Widget _buildStatsGrid() {
    return GridView.count(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      crossAxisCount: 5,
      crossAxisSpacing: 16,
      mainAxisSpacing: 16,
      childAspectRatio: 2.5,
      children: [
        _buildStatCard("Total Hosts", _stats['totalHosts'], LucideIcons.userCheck, Colors.blueAccent),
        _buildStatCard("Active", _stats['activeHosts'], LucideIcons.checkCircle, Colors.greenAccent),
        _buildStatCard("Pending", _stats['pendingHosts'], LucideIcons.clock, Colors.amberAccent),
        _buildStatCard("Blocked", _stats['blockedHosts'], LucideIcons.ban, Colors.redAccent),
        _buildStatCard("Total Earnings", _api.formatNumber(_stats['totalEarnings']), LucideIcons.coins, Colors.purpleAccent),
      ],
    );
  }

  Widget _buildStatCard(String label, dynamic value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(20), border: Border.all(color: color.withOpacity(0.1))),
      child: Row(
        children: [
          Icon(icon, color: color, size: 24),
          const SizedBox(width: 16),
          Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
            Text(value.toString(), style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            Text(label, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)),
          ]),
        ],
      ),
    );
  }

  Widget _buildFilters() {
    return Row(
      children: [
        Expanded(
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
            child: TextField(
              controller: _searchController,
              style: const TextStyle(color: Colors.white, fontSize: 14),
              onChanged: (v) => setState(() {}),
              decoration: const InputDecoration(hintText: "Search by Name or ID...", hintStyle: TextStyle(color: Colors.white24), prefixIcon: Icon(LucideIcons.search, color: Colors.white24), border: InputBorder.none, contentPadding: EdgeInsets.all(16)),
            ),
          ),
        ),
        const SizedBox(width: 16),
        _buildFilterBtn('all', 'All'),
        const SizedBox(width: 8),
        _buildFilterBtn('approved', 'Approved'),
        const SizedBox(width: 8),
        _buildFilterBtn('pending', 'Pending'),
        const SizedBox(width: 8),
        _buildFilterBtn('blocked', 'Blocked'),
      ],
    );
  }

  Widget _buildFilterBtn(String id, String label) {
    bool isSel = _statusFilter == id;
    return GestureDetector(
      onTap: () { setState(() => _statusFilter = id); _loadData(); },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        decoration: BoxDecoration(color: isSel ? const Color(0xFF6366F1) : Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(12), border: Border.all(color: isSel ? Colors.transparent : Colors.white10)),
        child: Text(label, style: GoogleFonts.outfit(color: isSel ? Colors.white : Colors.white38, fontSize: 12, fontWeight: FontWeight.bold)),
      ),
    );
  }

  Widget _buildWarningBanner(String type) {
    final color = type == 'pending' ? Colors.amberAccent : Colors.redAccent;
    final icon = type == 'pending' ? LucideIcons.clock : LucideIcons.ban;
    final count = type == 'pending' ? _stats['pendingHosts'] : _stats['blockedHosts'];
    
    return InkWell(
      onTap: () { setState(() => _statusFilter = type); _loadData(); },
      child: Container(
        padding: const EdgeInsets.all(16),
        margin: const EdgeInsets.only(bottom: 8),
        decoration: BoxDecoration(color: color.withOpacity(0.05), borderRadius: BorderRadius.circular(16), border: Border.all(color: color.withOpacity(0.2))),
        child: Row(children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(width: 12),
          Text("$count ${type.toUpperCase()} host(s) awaiting your attention", style: TextStyle(color: color, fontSize: 13, fontWeight: FontWeight.bold)),
          const Spacer(),
          const Icon(LucideIcons.chevronRight, color: Colors.white10),
        ]),
      ),
    );
  }

  Widget _buildHostTable() {
    if (_isLoading) return const Center(child: CircularProgressIndicator());
    final filtered = _hosts.where((h) => h['display_name'].toString().toLowerCase().contains(_searchController.text.toLowerCase()) || h['id'].toString().contains(_searchController.text)).toList();

    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Table(
        columnWidths: const {
          0: FlexColumnWidth(3),
          1: FlexColumnWidth(1),
          2: FlexColumnWidth(1.5),
          3: FlexColumnWidth(1.5),
          4: FlexColumnWidth(1.5),
          5: FlexColumnWidth(2),
          6: FlexColumnWidth(1.5),
        },
        children: [
          TableRow(
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Colors.white10))),
            children: ["HOST", "LVL", "STATUS", "RATE/MIN", "EARNINGS", "AGENCY", "ACTIONS"].map((e) => Padding(padding: const EdgeInsets.all(20), child: Text(e, style: const TextStyle(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.bold)))).toList(),
          ),
          ...filtered.map((h) => _buildHostRow(h)).toList(),
        ],
      ),
    );
  }

  TableRow _buildHostRow(Map<String, dynamic> h) {
    final status = h['is_blocked'] == true ? 'blocked' : h['host_status'] ?? 'pending';
    final color = status == 'approved' ? Colors.greenAccent : (status == 'pending' ? Colors.amberAccent : Colors.redAccent);
    
    return TableRow(
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Colors.white05))),
      children: [
        Padding(padding: const EdgeInsets.all(20), child: Row(children: [
          CircleAvatar(radius: 18, backgroundImage: CachedNetworkImageProvider(h['avatar_url'] ?? "")),
          const SizedBox(width: 12),
          Expanded(child: Text(h['display_name'] ?? 'User', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14), overflow: TextOverflow.ellipsis)),
        ])),
        Padding(padding: const EdgeInsets.all(20), child: Text(h['host_level']?.toString() ?? '1', style: const TextStyle(color: Colors.white70))),
        Padding(padding: const EdgeInsets.all(20), child: _buildBadge(status.toUpperCase(), color)),
        Padding(padding: const EdgeInsets.all(20), child: Text("${h['call_rate_per_minute'] ?? 0} 🪙", style: const TextStyle(color: Colors.amberAccent))),
        Padding(padding: const EdgeInsets.all(20), child: Text(_api.formatNumber(h['total_earnings'] ?? 0), style: const TextStyle(color: Colors.greenAccent))),
        Padding(padding: const EdgeInsets.all(20), child: Text(h['agencies']?['name'] ?? '-', style: const TextStyle(color: Colors.purpleAccent))),
        Padding(padding: const EdgeInsets.all(10), child: Row(children: [
          if (status == 'pending') IconButton(icon: const Icon(LucideIcons.checkCircle, color: Colors.greenAccent, size: 18), onPressed: () => _updateHostStatus(h['id'], 'approved')),
          IconButton(icon: Icon(h['is_blocked'] == true ? LucideIcons.unlock : LucideIcons.ban, color: h['is_blocked'] == true ? Colors.greenAccent : Colors.redAccent, size: 18), onPressed: () => _toggleBlock(h['id'], !(h['is_blocked'] == true))),
        ])),
      ],
    );
  }

  Widget _buildBadge(String label, Color color) {
    return Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4), decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(6), border: Border.all(color: color.withOpacity(0.2))), child: Text(label, style: TextStyle(color: color, fontSize: 9, fontWeight: FontWeight.bold)));
  }
}
