import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminLandingPageManagerScreen extends StatefulWidget {
  const AdminLandingPageManagerScreen({super.key});

  @override
  State<AdminLandingPageManagerScreen> createState() => _AdminLandingPageManagerScreenState();
}

class _AdminLandingPageManagerScreenState extends State<AdminLandingPageManagerScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _sections = [];

  @override
  void initState() {
    super.initState();
    _loadSections();
  }

  Future<void> _loadSections() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('landing_page_sections').select().order('sort_order');
      if (mounted) {
        setState(() {
          _sections = List<Map<String, dynamic>>.from(res);
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
              ? const Center(child: CircularProgressIndicator(color: Colors.indigoAccent))
              : _buildSectionList(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.indigo, Colors.blueAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.layout, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("LANDING PAGE MANAGER", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Control web landing page content, SEO meta and visual sections", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.eye, size: 16),
            label: const Text("VIEW LIVE PAGE"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionList() {
    return ListView.builder(
      padding: const EdgeInsets.symmetric(horizontal: 40),
      itemCount: _sections.length,
      itemBuilder: (context, index) {
        final s = _sections[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 20),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Row(
            children: [
              Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: Colors.indigo.withOpacity(0.1), borderRadius: BorderRadius.circular(16)), child: const Icon(LucideIcons.layers, color: Colors.indigo, size: 24)),
              const SizedBox(width: 32),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s['title'] ?? 'Section ${index + 1}', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                    const SizedBox(height: 8),
                    Text(s['subtitle'] ?? 'Landing page content block', style: const TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
              Row(
                children: [
                  _actionIconButton(LucideIcons.chevronUp, Colors.white10, () {}),
                  const SizedBox(width: 12),
                  _actionIconButton(LucideIcons.chevronDown, Colors.white10, () {}),
                  const SizedBox(width: 32),
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
