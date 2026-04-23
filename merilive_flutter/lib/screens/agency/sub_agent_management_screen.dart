import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';
import '../../widgets/premium_avatar.dart';

class SubAgentManagementScreen extends StatefulWidget {
  const SubAgentManagementScreen({super.key});

  @override
  State<SubAgentManagementScreen> createState() => _SubAgentManagementScreenState();
}

class _SubAgentManagementScreenState extends State<SubAgentManagementScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _subAgents = [];
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _loadSubAgents();
  }

  Future<void> _loadSubAgents() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      final agencyId = profile?['agency_id'] ?? profile?['id'];
      if (agencyId != null) {
        final agents = await _api.getSubAgents(agencyId);
        setState(() => _subAgents = List<Map<String, dynamic>>.from(agents));
      }
    } catch (e) {
      debugPrint("Parity SubAgent Error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _subAgents.where((a) => (a['name'] ?? '').toString().toLowerCase().contains(_searchQuery.toLowerCase()) || (a['agency_code'] ?? '').toString().toLowerCase().contains(_searchQuery.toLowerCase())).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                _buildSearchAndRecruit(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Colors.purpleAccent))
                    : _buildAgentList(filtered),
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
          IconButton(icon: const Icon(LucideIcons.chevronLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("Sub-Agent Panel", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              Text("Master Copy • Agency Hierarchy Control", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11)),
            ],
          ),
          const Spacer(),
          IconButton(icon: const Icon(LucideIcons.refreshCcw, color: Colors.white24, size: 18), onPressed: _loadSubAgents),
        ],
      ),
    );
  }

  Widget _buildSearchAndRecruit() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Container(
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.05),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white.withOpacity(0.05)),
              ),
              child: Row(
                children: [
                  const Icon(LucideIcons.search, color: Colors.white24, size: 18),
                  const SizedBox(width: 12),
                  Expanded(
                    child: TextField(
                      onChanged: (v) => setState(() => _searchQuery = v),
                      style: const TextStyle(color: Colors.white),
                      decoration: const InputDecoration(hintText: "Browse sub-agents...", hintStyle: TextStyle(color: Colors.white24, fontSize: 13), border: InputBorder.none),
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 12),
          GestureDetector(
            onTap: () => Navigator.pushNamed(context, '/agency-smart-link'),
            child: Container(
              height: 56, width: 56,
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFF8B5CF6), Color(0xFFD946EF)]),
                borderRadius: BorderRadius.circular(18),
                boxShadow: [BoxShadow(color: const Color(0xFFD946EF).withOpacity(0.3), blurRadius: 15, offset: const Offset(0, 5))],
              ),
              child: const Icon(LucideIcons.userPlus, color: Colors.white, size: 22),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAgentList(List<Map<String, dynamic>> agents) {
    if (agents.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.network, color: Colors.white.withOpacity(0.02), size: 80),
            const SizedBox(height: 20),
            Text("No partners found", style: TextStyle(color: Colors.white.withOpacity(0.1), fontSize: 14)),
            const SizedBox(height: 8),
            Text("Expand your agency network to earn more.", style: TextStyle(color: Colors.white.withOpacity(0.05), fontSize: 11)),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(24),
      physics: const BouncingScrollPhysics(),
      itemCount: agents.length,
      itemBuilder: (context, index) {
        final agent = agents[index];
        final owner = agent['owner'] ?? {};
        final revenue = agent['total_revenue'] ?? 0;
        
        return FadeInUp(
          delay: Duration(milliseconds: index * 30),
          child: Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.02),
              borderRadius: BorderRadius.circular(32),
              border: Border.all(color: Colors.white.withOpacity(0.05)),
            ),
            child: Row(
              children: [
                PremiumAvatar(imageUrl: owner['avatar_url'] ?? '', size: 52),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(agent['name'] ?? "Nexus Partner", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                      Text("ID: ${agent['agency_code']}", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 11)),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text("\$${_api.formatNumber(revenue)}", style: GoogleFonts.outfit(color: Colors.greenAccent, fontWeight: FontWeight.w900, fontSize: 16)),
                    Text("NET VOLUME", style: TextStyle(color: Colors.white.withOpacity(0.2), fontSize: 8, fontWeight: FontWeight.bold, letterSpacing: 1)),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
