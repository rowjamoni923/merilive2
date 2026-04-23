import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminAppVersionScreen extends StatefulWidget {
  const AdminAppVersionScreen({super.key});

  @override
  State<AdminAppVersionScreen> createState() => _AdminAppVersionScreenState();
}

class _AdminAppVersionScreenState extends State<AdminAppVersionScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  List<Map<String, dynamic>> _versions = [];

  @override
  void initState() {
    super.initState();
    _loadVersions();
  }

  Future<void> _loadVersions() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final res = await supa.from('app_version_settings').select('*').order('platform', ascending: true);
      setState(() {
        _versions = List<Map<String, dynamic>>.from(res);
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading versions: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _isLoading 
      ? const Center(child: CircularProgressIndicator(color: Colors.amberAccent))
      : SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildInfoBanner(),
              const SizedBox(height: 32),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: _versions.map((v) => Expanded(child: _buildVersionCard(v))).toList(),
              ),
            ],
          ),
        );
  }

  Widget _buildInfoBanner() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.blueAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.blueAccent.withOpacity(0.1))),
      child: Row(
        children: [
          const Icon(LucideIcons.info, color: Colors.blueAccent, size: 24),
          const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text("Version Governance", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                SizedBox(height: 4),
                Text("Configure how the app checks for updates on launch. Force Update will prevent users from accessing the app without updating.", style: TextStyle(color: Colors.white24, fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVersionCard(Map<String, dynamic> v) {
    final bool isAndroid = v['platform'] == 'android';
    final Color pColor = isAndroid ? Colors.greenAccent : Colors.white70;
    
    return FadeInLeft(
      child: Container(
        margin: const EdgeInsets.only(right: 20),
        padding: const EdgeInsets.all(32),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(isAndroid ? LucideIcons.smartphone : LucideIcons.apple, color: pColor, size: 24),
                const SizedBox(width: 16),
                Text(isAndroid ? "Android Platform" : "iOS Platform", style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
              ],
            ),
            const SizedBox(height: 32),
            _inputField("Current Version Name", v['current_version'] ?? '1.0.0', LucideIcons.hash),
            const SizedBox(height: 20),
            _inputField("Minimum Version", v['minimum_version'] ?? '1.0.0', LucideIcons.arrowDown),
            const SizedBox(height: 32),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: const [
                    Text("Force Update", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                    Text("Enforce mandatory update", style: TextStyle(color: Colors.white24, fontSize: 11)),
                  ],
                ),
                Switch(value: v['force_update'] ?? false, onChanged: (v) {}, activeColor: Colors.amberAccent),
              ],
            ),
            const SizedBox(height: 32),
            const Text("Update Link", style: TextStyle(color: Colors.white24, fontSize: 11, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(12)),
              child: Text(v['update_url'] ?? 'No URL set', style: const TextStyle(color: Colors.white70, fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: () {},
                icon: const Icon(LucideIcons.save, size: 14),
                label: const Text("SAVE CHANGES", style: TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.white10, foregroundColor: Colors.white, padding: const EdgeInsets.symmetric(vertical: 20), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _inputField(String label, String value, IconData icon) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 11, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Row(
            children: [
              Icon(icon, color: Colors.white10, size: 14),
              const SizedBox(width: 12),
              Text(value, style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
      ],
    );
  }
}
