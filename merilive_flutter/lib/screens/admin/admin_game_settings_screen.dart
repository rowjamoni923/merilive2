import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminGameSettingsScreen extends StatefulWidget {
  const AdminGameSettingsScreen({super.key});

  @override
  State<AdminGameSettingsScreen> createState() => _AdminGameSettingsScreenState();
}

class _AdminGameSettingsScreenState extends State<AdminGameSettingsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  Map<String, dynamic> _config = {};

  @override
  void initState() {
    super.initState();
    _loadConfig();
  }

  Future<void> _loadConfig() async {
    setState(() => _isLoading = true);
    try {
      final res = await _api.getSupabase().from('app_settings').select().eq('setting_key', 'game_config').maybeSingle();
      if (mounted) {
        setState(() {
          _config = res?['setting_value'] ?? {};
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
              : _buildConfigForm(),
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
                  decoration: BoxDecoration(gradient: const LinearGradient(colors: [Colors.amber, Colors.orangeAccent]), borderRadius: BorderRadius.circular(16)),
                  child: const Icon(LucideIcons.gamepad2, color: Colors.white, size: 28),
                ),
              ),
              const SizedBox(width: 24),
              FadeInDown(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text("GAME SYSTEM SETTINGS", style: GoogleFonts.outfit(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w900)),
                    const Text("Configure game tax, house edge, betting limits and automated server protocols", style: TextStyle(color: Colors.white24, fontSize: 13)),
                  ],
                ),
              ),
            ],
          ),
          ElevatedButton.icon(
            onPressed: () {},
            icon: const Icon(LucideIcons.save, size: 16),
            label: const Text("SAVE GAME CONFIG"),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 18), shape: BorderRadius.circular(12)),
          ),
        ],
      ),
    );
  }

  Widget _buildConfigForm() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(40),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildSectionTitle("Economic Parameters"),
          const SizedBox(height: 24),
          _buildInputRow("Platform Tax (Percentage)", "5%"),
          const SizedBox(height: 16),
          _buildInputRow("House Advantage (Global)", "2.5%"),
          const SizedBox(height: 16),
          _buildInputRow("Jackpot Contribution", "1%"),
          const SizedBox(height: 48),
          _buildSectionTitle("Betting Limitations"),
          const SizedBox(height: 24),
          _buildInputRow("Minimum Bet (Diamonds)", "10"),
          const SizedBox(height: 16),
          _buildInputRow("Maximum Bet (Per Round)", "100,000"),
          const SizedBox(height: 48),
          _buildSectionTitle("System Controls"),
          const SizedBox(height: 24),
          _buildSwitchRow("Enable Automated Server", true),
          const SizedBox(height: 16),
          _buildSwitchRow("Enable Jackpot System", true),
          const SizedBox(height: 16),
          _buildSwitchRow("Maintenance Mode (Games Only)", false),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(title.toUpperCase(), style: GoogleFonts.outfit(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 2));
  }

  Widget _buildInputRow(String label, String value) {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70)),
          Text(value, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildSwitchRow(String label, bool val) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white.withOpacity(0.03))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.white70)),
          Switch(value: val, onChanged: (v) {}, activeColor: Colors.amberAccent),
        ],
      ),
    );
  }
}
