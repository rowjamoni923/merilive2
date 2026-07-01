import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';

class MyAssetsScreen extends StatefulWidget {
  const MyAssetsScreen({super.key});

  @override
  State<MyAssetsScreen> createState() => _MyAssetsScreenState();
}

class _MyAssetsScreenState extends State<MyAssetsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  int _diamonds = 0;
  int _beans = 0;
  int _coins = 0;

  @override
  void initState() {
    super.initState();
    _loadAssets();
  }

  Future<void> _loadAssets() async {
    setState(() => _isLoading = true);
    try {
      final profile = await _api.getMyProfile();
      if (profile != null) {
        setState(() {
          _diamonds = profile['coins'] ?? 0; // In this app, 'coins' column often stores diamonds
          _beans = profile['beans_balance'] ?? 0;
          _coins = profile['game_coins'] ?? 0;
        });
      }
    } catch (e) {
      debugPrint("Assets load error: $e");
    } finally {
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
                _buildAppBar(),
                Expanded(
                  child: _isLoading 
                    ? const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)))
                    : ListView(
                        padding: const EdgeInsets.all(20),
                        children: [
                          _buildAssetCard(
                            title: "DIAMONDS",
                            value: _diamonds,
                            icon: LucideIcons.gem,
                            color: const Color(0xFF3B82F6),
                            onTap: () => Navigator.pushNamed(context, '/diamond-history'),
                          ),
                          const SizedBox(height: 16),
                          _buildAssetCard(
                            title: "BEANS",
                            value: _beans,
                            icon: LucideIcons.flame,
                            color: const Color(0xFFEC4899),
                            onTap: () => Navigator.pushNamed(context, '/bean-history'),
                          ),
                          const SizedBox(height: 16),
                          _buildAssetCard(
                            title: "COINS",
                            value: _coins,
                            icon: LucideIcons.coins,
                            color: const Color(0xFFF59E0B),
                            onTap: () => Navigator.pushNamed(context, '/coin-history'),
                          ),
                          const SizedBox(height: 40),
                          _buildQuickActions(),
                        ],
                      ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildAppBar() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.chevronLeft, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const SizedBox(width: 8),
          Text(
            "MY ASSETS",
            style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold),
          ),
          const Spacer(),
          IconButton(
            icon: const Icon(LucideIcons.refreshCcw, color: Colors.white70, size: 20),
            onPressed: _loadAssets,
          ),
        ],
      ),
    );
  }

  Widget _buildAssetCard({
    required String title,
    required int value,
    required IconData icon,
    required Color color,
    required VoidCallback onTap,
  }) {
    return FadeInUp(
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: color.withOpacity(0.2)),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.2),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: color, size: 28),
              ),
              const SizedBox(width: 20),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: GoogleFonts.outfit(color: Colors.white70, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      value.toString(),
                      style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.bold),
                    ),
                  ],
                ),
              ),
              Icon(LucideIcons.chevronRight, color: Colors.white24, size: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQuickActions() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          "QUICK ACTIONS",
          style: GoogleFonts.outfit(color: Colors.white38, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 2),
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _actionButton(
                icon: LucideIcons.plusCircle,
                label: "Recharge",
                onTap: () => Navigator.pushNamed(context, '/shop'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: _actionButton(
                icon: LucideIcons.repeat,
                label: "Exchange",
                onTap: () => Navigator.pushNamed(context, '/exchange-beans'),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _actionButton({required IconData icon, required String label, required VoidCallback onTap}) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.05),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: Colors.white.withOpacity(0.1)),
        ),
        child: Column(
          children: [
            Icon(icon, color: Colors.white, size: 24),
            const SizedBox(height: 8),
            Text(
              label,
              style: GoogleFonts.outfit(color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}


