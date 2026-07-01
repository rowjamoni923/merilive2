import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminRoleFramesScreen extends StatefulWidget {
  const AdminRoleFramesScreen({super.key});

  @override
  State<AdminRoleFramesScreen> createState() => _AdminRoleFramesScreenState();
}

class _AdminRoleFramesScreenState extends State<AdminRoleFramesScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _frames = [];

  @override
  void initState() {
    super.initState();
    _loadFrames();
  }

  Future<void> _loadFrames() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('role_frames').select().order('created_at', ascending: false);
      if (mounted) {
        setState(() {
          _frames = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.purpleAccent))
              : _buildFramesGrid(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.purple, Colors.pinkAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.userSquare, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("ROLE-BASED FRAMES", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Configure avatar frames based on user roles, nobility levels and agency status", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("CREATE ROLE FRAME"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildFramesGrid() {
    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 6, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 0.9),
      itemCount: _frames.length,
      itemBuilder: (context, index) {
        final f = _frames[index];
        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.network(_api.resolveAssetUrl(f['image_url'], bucket: 'avatar_frames'), width: 56, height: 56, errorBuilder: (c,e,s) => const Icon(LucideIcons.user, color: Colors.white10, size: 40))),
                const SizedBox(height: 16),
                Text(f['role_name'] ?? 'Super Admin', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
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
