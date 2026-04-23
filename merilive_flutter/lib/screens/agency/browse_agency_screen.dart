import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';

class BrowseAgencyScreen extends StatefulWidget {
  const BrowseAgencyScreen({super.key});

  @override
  State<BrowseAgencyScreen> createState() => _BrowseAgencyScreenState();
}

class _BrowseAgencyScreenState extends State<BrowseAgencyScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _agencies = [];
  String _searchQuery = "";

  @override
  void initState() {
    super.initState();
    _fetchAgencies();
  }

  Future<void> _fetchAgencies() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('agencies').select('*, owner:profiles(display_name, avatar_url)').order('total_hosts', ascending: false).limit(50);
      if (mounted) {
        setState(() {
          _agencies = List<Map<String, dynamic>>.from(res);
          _isLoading = false;
        });
      }
    } catch (e) {
      debugPrint("Browse Error: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final filtered = _agencies.where((a) => (a['name'] ?? '').toString().toLowerCase().contains(_searchQuery.toLowerCase()) || (a['agency_code'] ?? '').toString().toLowerCase().contains(_searchQuery.toLowerCase())).toList();

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(),
                _buildSearchField(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Colors.cyanAccent))
                    : _buildAgencyGrid(filtered),
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
              Text("Browse Agencies", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
              Text("Explore & Discover Global Partners", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSearchField() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
      child: Container(
        height: 56,
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        child: TextField(
          onChanged: (v) => setState(() => _searchQuery = v),
          style: const TextStyle(color: Colors.white),
          decoration: const InputDecoration(
            hintText: "Search name or code...",
            hintStyle: TextStyle(color: Colors.white24, fontSize: 14),
            prefixIcon: Icon(LucideIcons.search, color: Colors.white38, size: 20),
            border: InputBorder.none,
            contentPadding: EdgeInsets.all(16),
          ),
        ),
      ),
    );
  }

  Widget _buildAgencyGrid(List<Map<String, dynamic>> agencies) {
    if (agencies.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(LucideIcons.searchX, color: Colors.white.withOpacity(0.02), size: 80),
            const SizedBox(height: 20),
            Text("No agencies found", style: TextStyle(color: Colors.white.withOpacity(0.1), fontSize: 14)),
          ],
        ),
      );
    }

    return GridView.builder(
      padding: const EdgeInsets.all(24),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, crossAxisSpacing: 16, mainAxisSpacing: 16, childAspectRatio: 0.8),
      itemCount: agencies.length,
      itemBuilder: (context, index) {
        final agency = agencies[index];
        return FadeInUp(
          delay: Duration(milliseconds: index * 50),
          child: _buildAgencyCard(agency),
        );
      },
    );
  }

  Widget _buildAgencyCard(Map<String, dynamic> agency) {
    final owner = agency['owner'] ?? {};
    final level = agency['level'] ?? 'A1';
    
    return GestureDetector(
      onTap: () => Navigator.pushNamed(context, '/join-agency', arguments: agency),
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Stack(
              alignment: Alignment.bottomRight,
              children: [
                CircleAvatar(radius: 32, backgroundImage: NetworkImage(owner['avatar_url'] ?? ''), backgroundColor: Colors.white.withOpacity(0.05)),
                Container(
                  padding: const EdgeInsets.all(4),
                  decoration: const BoxDecoration(color: Colors.cyanAccent, shape: BoxShape.circle),
                  child: Text(level, style: const TextStyle(color: Colors.black, fontSize: 8, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(agency['name'] ?? 'Agency', style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis),
            Text("Code: ${agency['agency_code']}", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 10)),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
              child: const Text("VIEW PROFILE", style: TextStyle(color: Colors.cyanAccent, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1)),
            ),
          ],
        ),
      ),
    );
  }
}
