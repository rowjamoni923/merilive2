import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminEventThemesScreen extends StatefulWidget {
  const AdminEventThemesScreen({super.key});

  @override
  State<AdminEventThemesScreen> createState() => _AdminEventThemesScreenState();
}

class _AdminEventThemesScreenState extends State<AdminEventThemesScreen> {
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
      final res = await _api.getSupabase().from('event_themes').select().order('created_at', ascending: false);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.pinkAccent))
              : _buildThemeGrid(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.pink, Colors.purple]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.palette, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("EVENT THEMES MANAGER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Customize app visuals for holidays, events and seasonal campaigns", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("CREATE NEW THEME"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildThemeGrid() {
    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 3, crossAxisSpacing: 32, mainAxisSpacing: 32, childAspectRatio: 1.5),
      itemCount: _themes.length,
      itemBuilder: (context, index) {
        final t = _themes[index];
        final bool isActive = t['is_active'] ?? false;

        return FadeInUp(
          delay: Duration(milliseconds: 50 * index),
          child: Container(
            decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: isActive ? Colors.pinkAccent.withOpacity(0.3) : Colors.white10)),
            child: Column(
              children: [
                Expanded(child: ClipRRect(borderRadius: const BorderRadius.vertical(top: Radius.circular(24)), child: Image.network(_api.resolveAssetUrl(t['preview_image'], bucket: 'banners'), fit: BoxFit.cover, errorBuilder: (c,e,s) => Container(color: Colors.white.withOpacity(0.05), child: const Icon(LucideIcons.image, color: Colors.white10))))),
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(t['name'] ?? 'Seasonal Theme', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                          const SizedBox(height: 4),
                          Text(isActive ? "CURRENTLY ACTIVE" : "INACTIVE", style: TextStyle(color: isActive ? Colors.pinkAccent : Colors.white24, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1)),
                        ],
                      ),
                      Row(
                        children: [
                          _actionIconButton(LucideIcons.edit2, Colors.white24, () {}),
                          const SizedBox(width: 12),
                          _actionIconButton(LucideIcons.power, isActive ? Colors.pinkAccent : Colors.white24, () {}),
                        ],
                      ),
                    ],
                  ),
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
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(14)),
      child: InkWell(onTap: onTap, child: Icon(icon, color: color, size: 18)),
    );
  }
}
