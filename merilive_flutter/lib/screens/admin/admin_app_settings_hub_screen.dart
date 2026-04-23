import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminAppSettingsHubScreen extends StatefulWidget {
  const AdminAppSettingsHubScreen({super.key});

  @override
  State<AdminAppSettingsHubScreen> createState() => _AdminAppSettingsHubScreenState();
}

class _AdminAppSettingsHubScreenState extends State<AdminAppSettingsHubScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _settings = [];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('app_settings').select().order('setting_key');
      if (mounted) {
        setState(() {
          _settings = List<Map<String, dynamic>>.from(res);
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
          _buildTabHeader(),
          Expanded(
            child: _isLoading 
              ? const Center(child: CircularProgressIndicator(color: Colors.blueAccent))
              : TabBarView(
                  controller: _tabController,
                  children: [
                    _buildSettingsList('general'),
                    _buildSettingsList('security'),
                    _buildSettingsList('communication'),
                    _buildSettingsList('advanced'),
                  ],
                ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(40),
      child: Row(
        children: [
          FadeInLeft(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blueAccent, Colors.purpleAccent]), borderRadius: BorderRadius.circular(16)),
              child: const Icon(LucideIcons.settings, color: Colors.white, size: 28),
            ),
          ),
          const SizedBox(width: 24),
          FadeInDown(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("APP SETTINGS HUB", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                const Text("Centralized configuration for app behavior, security and features", style: TextStyle(color: Colors.white24, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTabHeader() {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 40),
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TabBar(
        controller: _tabController,
        indicator: BoxDecoration(gradient: const LinearGradient(colors: [Colors.blueAccent, Colors.purpleAccent]), borderRadius: BorderRadius.circular(12)),
        dividerColor: Colors.transparent,
        labelStyle: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
        unselectedLabelColor: Colors.white24,
        tabs: const [
          Tab(text: "GENERAL"),
          Tab(text: "SECURITY"),
          Tab(text: "COMMUNICATION"),
          Tab(text: "ADVANCED"),
        ],
      ),
    );
  }

  Widget _buildSettingsList(String category) {
    // Simplified filtering logic
    final filtered = _settings; 

    return ListView.builder(
      padding: const EdgeInsets.all(40),
      itemCount: filtered.length,
      itemBuilder: (context, index) {
        final s = filtered[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 16),
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(s['setting_key'].toString().replaceAll('_', ' ').toUpperCase(), style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                    const SizedBox(height: 4),
                    Text(s['description'] ?? 'No description provided', style: const TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
              ),
              const SizedBox(width: 40),
              Container(
                width: 300,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white10)),
                child: TextField(
                  controller: TextEditingController(text: s['setting_value']?.toString()),
                  style: const TextStyle(color: Colors.white70, fontSize: 13),
                  decoration: const InputDecoration(border: InputBorder.none),
                ),
              ),
              const SizedBox(width: 20),
              _actionIconButton(LucideIcons.save, Colors.blueAccent, () {}),
            ],
          ),
        );
      },
    );
  }

  Widget _actionIconButton(IconData icon, Color color, VoidCallback onTap) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: color.withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
      child: InkWell(onTap: onTap, child: Icon(icon, color: color, size: 16)),
    );
  }
}
