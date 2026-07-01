import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminThemeManagerScreen extends StatefulWidget {
  const AdminThemeManagerScreen({super.key});

  @override
  State<AdminThemeManagerScreen> createState() => _AdminThemeManagerScreenState();
}

class _AdminThemeManagerScreenState extends State<AdminThemeManagerScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _themes = [];

  @override
  void initState() {
    super.initState();
    _loadThemes();
  }

  Future<void> _loadThemes() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('app_themes').select().order('created_at', ascending: false);
      if (mounted) {
        setState(() {
          _themes = List<Map<String, dynamic>>.from(res);
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
              : _buildThemesGrid(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.purple, Colors.pink]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.palette, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("GLOBAL THEME MANAGER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Control platform-wide visual themes, event skins and seasonal color palettes", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("CREATE THEME"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildThemesGrid() {
    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 5, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 1),
      itemCount: _themes.length,
      itemBuilder: (context, index) {
        final t = _themes[index];
        final bool isActive = t['is_active'] == true;

        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: isActive ? Colors.purpleAccent.withOpacity(0.3) : Colors.white.withOpacity(0.05))),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(width: 48, height: 48, decoration: BoxDecoration(color: Color(int.parse(t['primary_color']?.toString().replaceAll('#', '0xFF') ?? '0xFF6366F1')), shape: BoxShape.circle, border: Border.all(color: Colors.white24, width: 2))),
                const SizedBox(height: 16),
                Text(t['name'] ?? 'Custom Theme', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                const SizedBox(height: 12),
                Container(padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4), decoration: BoxDecoration(color: (isActive ? Colors.emeraldAccent : Colors.white10).withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Text(isActive ? "ACTIVE" : "INACTIVE", style: TextStyle(color: isActive ? Colors.emeraldAccent : Colors.white24, fontSize: 8, fontWeight: FontWeight.bold))),
              ],
            ),
          ),
        );
      },
    );
  }
}
