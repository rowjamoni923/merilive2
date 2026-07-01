import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';

class AgencyPolicyScreen extends StatefulWidget {
  const AgencyPolicyScreen({super.key});

  @override
  State<AgencyPolicyScreen> createState() => _AgencyPolicyScreenState();
}

class _AgencyPolicyScreenState extends State<AgencyPolicyScreen> with TickerProviderStateMixin {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _policies = [];
  late TabController _tabController;

  final Map<String, IconData> _iconMap = {
    'commission': LucideIcons.trendingUp,
    'host': LucideIcons.users,
    'rules': LucideIcons.shield,
    'withdraw': LucideIcons.wallet,
    'benefits': LucideIcons.award,
    'violations': LucideIcons.alertTriangle,
  };

  @override
  void initState() {
    super.initState();
    _loadPolicies();
  }

  Future<void> _loadPolicies() async {
    setState(() => _isLoading = true);
    try {
      final data = await _api.fetchPolicySettings();
      
      // Enhance data for Master Parity if missing
      if (data.isEmpty) {
        data.addAll([
          {
            'section_key': 'benefits',
            'section_title': 'Recruitment Benefits',
            'content': [
              {'title': 'Bonus Structure', 'description': 'Earn 5% additional bonus for every top-performing host recruited.'},
              {'title': 'Agency Level Up', 'description': 'Reach Level 10 to unlock exclusive regional manager tools.'},
            ]
          },
          {
            'section_key': 'commission',
            'section_title': 'Commission Tiers',
            'content': [
              {'title': 'Base Tier', 'description': '10% Commission on all host earnings by default.'},
              {'title': 'Silver Tier', 'description': '12% Commission after reaching 1M monthly diamonds.'},
            ]
          }
        ]);
      }

      if (mounted) {
        setState(() {
          _policies = data;
          _tabController = TabController(length: _policies.length, vsync: this);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Policy Load Error: $e");
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
                if (!_isLoading) _buildTabBar(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
                    : TabBarView(
                        controller: _tabController,
                        children: _policies.map((p) => _buildPolicyList(p)).toList(),
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
              Text("Agency Guidelines", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              Text("Master Copy • Official Policies", style: TextStyle(color: Colors.white.withOpacity(0.4), fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildTabBar() {
    return Container(
      height: 44,
      margin: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: TabBar(
        controller: _tabController,
        isScrollable: true,
        indicator: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.cyanAccent.withOpacity(0.3))),
        labelColor: Colors.cyanAccent,
        unselectedLabelColor: Colors.white38,
        labelStyle: GoogleFonts.outfit(fontWeight: FontWeight.bold, fontSize: 12),
        tabs: _policies.map((p) => Tab(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Icon(_iconMap[p['section_key']] ?? LucideIcons.fileText, size: 14),
                const SizedBox(width: 8),
                Text(p['section_title'].toUpperCase()),
              ],
            ),
          ),
        )).toList(),
      ),
    );
  }

  Widget _buildPolicyList(Map<String, dynamic> policy) {
    final content = policy['content'];
    List<dynamic> items = [];
    if (content is List) {
      items = content;
    } else if (content is Map && content.containsKey('items')) {
      items = content['items'];
    }

    return ListView(
      padding: const EdgeInsets.all(20),
      physics: const BouncingScrollPhysics(),
      children: [
        FadeInUp(
          child: Container(
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(32),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(16)),
                      child: Icon(_iconMap[policy['section_key']] ?? LucideIcons.info, color: Colors.cyanAccent, size: 24),
                    ),
                    const SizedBox(width: 16),
                    Expanded(child: Text(policy['section_title'], style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold))),
                  ],
                ),
                const SizedBox(height: 32),
                ...items.map((it) => _buildPolicyItem(it)).toList(),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),
        _buildWarningCard(),
      ],
    );
  }

  Widget _buildPolicyItem(dynamic item) {
    String title = "";
    String desc = "";
    if (item is Map) {
      title = item['title'] ?? item['name'] ?? "";
      desc = item['description'] ?? item['value'] ?? item['text'] ?? "";
    } else {
      title = item.toString();
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 24),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            margin: const EdgeInsets.only(top: 4),
            width: 6,
            height: 6,
            decoration: const BoxDecoration(color: Colors.cyanAccent, shape: BoxShape.circle),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (title.isNotEmpty) Text(title, style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                if (desc.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(desc, style: TextStyle(color: Colors.white.withOpacity(0.5), fontSize: 13, height: 1.6)),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildWarningCard() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: [Colors.orangeAccent.withOpacity(0.05), Colors.redAccent.withOpacity(0.05)]),
        borderRadius: BorderRadius.circular(28),
        border: Border.all(color: Colors.orangeAccent.withOpacity(0.1)),
      ),
      child: Row(
        children: [
          const Icon(LucideIcons.alertTriangle, color: Colors.orangeAccent, size: 20),
          const SizedBox(width: 16),
          Expanded(
            child: Text(
              "Strict adherence to official policy is mandatory. Violations may result in immediate agency suspension.",
              style: TextStyle(color: Colors.white.withOpacity(0.6), fontSize: 12, height: 1.4),
            ),
          ),
        ],
      ),
    );
  }
}
