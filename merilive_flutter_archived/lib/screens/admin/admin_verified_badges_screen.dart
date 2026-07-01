import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminVerifiedBadgesScreen extends StatefulWidget {
  const AdminVerifiedBadgesScreen({super.key});

  @override
  State<AdminVerifiedBadgesScreen> createState() => _AdminVerifiedBadgesScreenState();
}

class _AdminVerifiedBadgesScreenState extends State<AdminVerifiedBadgesScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _badges = [];

  @override
  void initState() {
    super.initState();
    _loadBadges();
  }

  Future<void> _loadBadges() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('verified_badges').select().order('created_at', ascending: false);
      if (mounted) {
        setState(() {
          _badges = List<Map<String, dynamic>>.from(res);
          _isLoading = false;
        });
      }
    } catch (e) {
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
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.blueAccent))
              : _buildBadgesGrid(),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(40),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              FadeInLeft(
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.cyan]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.checkBadge, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("VERIFIED BADGES HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Manage official verified status, celebrity tags and agency badges", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("CREATE NEW BADGE"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildBadgesGrid() {
    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 6, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 0.9),
      itemCount: _badges.length,
      itemBuilder: (context, index) {
        final b = _badges[index];
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.network(_api.resolveAssetUrl(b['image_url'], bucket: 'assets'), width: 48, height: 48, errorBuilder: (c,e,s) => const Icon(LucideIcons.shieldCheck, color: Colors.blueAccent, size: 40))),
                const SizedBox(height: 16),
                Text(b['name'] ?? 'Official', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                const SizedBox(height: 16),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _actionIconButton(LucideIcons.edit2, Colors.white12, () {}),
                    const SizedBox(width: 8),
                    _actionIconButton(LucideIcons.trash2, Colors.redAccent, () {}),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _actionIconButton(IconData icon, Color color, VoidCallback onTap) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(10)),
      child: InkWell(onTap: onTap, child: Icon(icon, color: color, size: 14)),
    );
  }
}
