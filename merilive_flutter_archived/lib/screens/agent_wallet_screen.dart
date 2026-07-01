import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';

class AgentWalletScreen extends StatefulWidget {
  const AgentWalletScreen({super.key});

  @override
  State<AgentWalletScreen> createState() => _AgentWalletScreenState();
}

class _AgentWalletScreenState extends State<AgentWalletScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  double _totalRevenue = 0.0;
  int _balanceBeans = 0;
  int _activeHosts = 0;

  @override
  void initState() {
    super.initState();
    _loadRealWalletData();
  }

  Future<void> _loadRealWalletData() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      if (profile != null && profile['agency_id'] != null) {
        final agencyId = profile['agency_id'];
        
        final revenues = await _api.getAgencyFinanceHistory(agencyId);
        double totalRev = 0;
        for(var r in revenues) { totalRev += (r['amount'] ?? 0); }
        _totalRevenue = totalRev;

        final hosts = await _api.getAgencyHosts(agencyId, 'active');
        _activeHosts = hosts.length;
        
        // Agency balance usually stored in agency profile or beans_balance
        _balanceBeans = profile['beans_balance'] ?? 0;
      }
    } catch (e) {
      debugPrint("Agent Wallet error: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Scaffold(
        backgroundColor: Color(0xFF0F172A),
        body: Center(child: CircularProgressIndicator(color: Color(0xFF6366F1))),
      );
    }

    return Scaffold(
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: RefreshIndicator(
              onRefresh: _loadRealWalletData,
              color: const Color(0xFF6366F1),
              backgroundColor: const Color(0xFF1E293B),
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
                child: Padding(
                  padding: const EdgeInsets.all(24.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildHeader(),
                      const SizedBox(height: 32),
                      FadeInUp(duration: const Duration(milliseconds: 500), child: _buildMainWalletCard()),
                      const SizedBox(height: 32),
                      FadeInUp(delay: const Duration(milliseconds: 200), duration: const Duration(milliseconds: 500), child: _buildStatsGrid()),
                      const SizedBox(height: 32),
                      FadeInUp(delay: const Duration(milliseconds: 400), duration: const Duration(milliseconds: 500), child: _buildQuickActions()),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            GestureDetector(
              onTap: () => Navigator.pop(context),
              child: Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.05), shape: BoxShape.circle),
                child: const Icon(LucideIcons.chevronLeft, color: Colors.white),
              ),
            ),
            const SizedBox(width: 16),
            Text(
              "Agency Wallet",
              style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
            ),
          ],
        ),
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(color: const Color(0xFF6366F1).withOpacity(0.1), shape: BoxShape.circle),
          child: const Icon(LucideIcons.history, color: Color(0xFF6366F1)),
        ),
      ],
    );
  }

  Widget _buildMainWalletCard() {
    // Standard exchange rate: 10,000 beans = 1 USD (adjust per backend settings)
    final double expectedUsd = _balanceBeans / 10000;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF6366F1), Color(0xFFA855F7)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(32),
        boxShadow: [
          BoxShadow(color: const Color(0xFF6366F1).withOpacity(0.4), blurRadius: 24, offset: const Offset(0, 12)),
        ],
      ),
      child: Stack(
        children: [
          Positioned(
            right: -20,
            top: -20,
            child: Icon(LucideIcons.wallet, size: 120, color: Colors.white.withOpacity(0.1)),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text("Total Available Beans", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.8), fontSize: 14)),
              const SizedBox(height: 8),
              Text(
                "$_balanceBeans",
                style: GoogleFonts.outfit(color: Colors.white, fontSize: 40, fontWeight: FontWeight.bold, letterSpacing: 1),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text("Estimated USD", style: GoogleFonts.outfit(color: Colors.white.withOpacity(0.8), fontSize: 12)),
                      Text("\$${expectedUsd.toStringAsFixed(2)}", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                    ],
                  ),
                  _buildPrimaryActionButton(),
                ],
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildPrimaryActionButton() {
    return ElevatedButton(
      onPressed: () {},
      style: ElevatedButton.styleFrom(
        backgroundColor: Colors.white,
        foregroundColor: const Color(0xFF6366F1),
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        elevation: 0,
      ),
      child: Text("WITHDRAW", style: GoogleFonts.outfit(fontWeight: FontWeight.bold, letterSpacing: 1)),
    );
  }

  Widget _buildStatsGrid() {
    return Row(
      children: [
        Expanded(
          child: _buildStatCard("Total Revenue", "\$${_totalRevenue.toStringAsFixed(2)}", LucideIcons.trendingUp, const Color(0xFF10B981)),
        ),
        const SizedBox(width: 16),
        Expanded(
          child: _buildStatCard("Active Hosts", "$_activeHosts", LucideIcons.users, const Color(0xFFF59E0B)),
        ),
      ],
    );
  }

  Widget _buildStatCard(String title, String value, IconData icon, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.03),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(height: 16),
          Text(value, style: GoogleFonts.outfit(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(title, style: GoogleFonts.outfit(color: Colors.white54, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "Quick Actions",
          style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 16),
        _buildActionTile(LucideIcons.arrowLeftRight, "Transfer to Host", "Send beans directly to agency hosts", const Color(0xFF3B82F6)),
        _buildActionTile(LucideIcons.coins, "Coin Exchange", "Convert beans to diamonds", const Color(0xFFEC4899)),
        _buildActionTile(LucideIcons.fileText, "Transaction History", "View all past financial records", const Color(0xFF14B8A6)),
      ],
    );
  }

  Widget _buildActionTile(IconData icon, String title, String subtitle, Color color) {
    return GestureDetector(
      onTap: () {},
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.03),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: color.withOpacity(0.1), shape: BoxShape.circle),
              child: Icon(icon, color: color, size: 24),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                  Text(subtitle, style: GoogleFonts.outfit(color: Colors.white54, fontSize: 12)),
                ],
              ),
            ),
            Icon(LucideIcons.chevronRight, color: Colors.white.withOpacity(0.2)),
          ],
        ),
      ),
    );
  }
}


