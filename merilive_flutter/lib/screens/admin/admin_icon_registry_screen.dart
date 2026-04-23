import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminIconRegistryScreen extends StatefulWidget {
  const AdminIconRegistryScreen({super.key});

  @override
  State<AdminIconRegistryScreen> createState() => _AdminIconRegistryScreenState();
}

class _AdminIconRegistryScreenState extends State<AdminIconRegistryScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _icons = [];

  @override
  void initState() {
    super.initState();
    _loadIcons();
  }

  Future<void> _loadIcons() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('icon_registry').select().order('category', ascending: true);
      if (mounted) {
        setState(() {
          _icons = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.amberAccent))
              : _buildIconsGrid(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.amber, Colors.orange]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.package, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("GLOBAL ICON REGISTRY", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Manage all system-wide SVGs, Lottie animations and static assets used across the mobile app", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.plus, size: 16),
            label: const Text("REGISTER ASSET"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildIconsGrid() {
    return GridView.builder(
      padding: const EdgeInsets.all(40),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 6, crossAxisSpacing: 24, mainAxisSpacing: 24, childAspectRatio: 1),
      itemCount: _icons.length,
      itemBuilder: (context, index) {
        final i = _icons[index];
        return Container(
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.03))),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (i['url'] != null)
                Image.network(i['url'], width: 40, height: 40, errorBuilder: (c, e, s) => const Icon(LucideIcons.image, color: Colors.white10, size: 32)),
              const SizedBox(height: 12),
              Text(i['name'] ?? 'Asset', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 11)),
              Text(i['category']?.toString().toUpperCase() ?? 'UI', style: const TextStyle(color: Colors.white10, fontSize: 8, fontWeight: FontWeight.bold, letterSpacing: 1)),
            ],
          ),
        );
      },
    );
  }
}
