import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminOnboardingSlidesScreen extends StatefulWidget {
  const AdminOnboardingSlidesScreen({super.key});

  @override
  State<AdminOnboardingSlidesScreen> createState() => _AdminOnboardingSlidesScreenState();
}

class _AdminOnboardingSlidesScreenState extends State<AdminOnboardingSlidesScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _slides = [];

  @override
  void initState() {
    super.initState();
    _loadSlides();
  }

  Future<void> _loadSlides() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('onboarding_slides').select().order('sort_order');
      if (mounted) {
        setState(() {
          _slides = List<Map<String, dynamic>>.from(res);
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
              : _buildSlidesList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blue, Colors.lightBlueAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.images, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("ONBOARDING SLIDES", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Configure the introduction screens that new users see when first opening the app", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("ADD NEW SLIDE"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildSlidesList() {
    return ListView.builder(
      padding: const EdgeInsets.all(40),
      itemCount: _slides.length,
      itemBuilder: (context, index) {
        final s = _slides[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 24),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Row(
            children: [
              ClipRRect(borderRadius: BorderRadius.circular(16), child: Image.network(_api.resolveAssetUrl(s['image_url'], bucket: 'assets'), width: 120, height: 160, fit: BoxFit.cover, errorBuilder: (c,e,st) => Container(color: Colors.white.withOpacity(0.05), width: 120, height: 160, child: const Icon(LucideIcons.image, color: Colors.white10)))),
              const SizedBox(width: 40),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s['title'] ?? 'Welcome to MeriLive', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                    const SizedBox(height: 8),
                    Text(s['description'] ?? 'Discover amazing features and connect with hosts.', style: const TextStyle(color: Colors.white24, fontSize: 13)),
                    const SizedBox(height: 24),
                    Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(8)), child: Text("ORDER: ${s['sort_order'] ?? index}", style: const TextStyle(color: Colors.blueAccent, fontSize: 10, fontWeight: FontWeight.bold))),
                  ],
                ),
              ),
              Row(
                children: [
                  _actionIconButton(LucideIcons.edit2, Colors.blueAccent, () {}),
                  const SizedBox(width: 12),
                  _actionIconButton(LucideIcons.trash2, Colors.redAccent, () {}),
                ],
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _actionIconButton(IconData icon, Color color, VoidCallback onTap) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
      child: InkWell(onTap: onTap, child: Icon(icon, color: color, size: 18)),
    );
  }
}
