import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AgoraSettingsScreen extends StatefulWidget {
  const AgoraSettingsScreen({super.key});

  @override
  State<AgoraSettingsScreen> createState() => _AgoraSettingsScreenState();
}

class _AgoraSettingsScreenState extends State<AgoraSettingsScreen> {
  final ApiService _api = ApiService();
  final TextEditingController _appIdController = TextEditingController();
  final TextEditingController _certController = TextEditingController();
  
  bool _isLoading = true;
  bool _isSaving = false;
  bool _isTesting = false;
  int _activeStreamCount = 0;
  bool _showCert = false;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      
      // Fetch App ID and Certificate
      final res = await supa.from('app_settings').select('*').inFilter('setting_key', ['agora_app_id', 'agora_app_certificate']);
      
      for (var item in res) {
        if (item['setting_key'] == 'agora_app_id') _appIdController.text = item['setting_value'] ?? "";
        if (item['setting_key'] == 'agora_app_certificate') _certController.text = item['setting_value'] ?? "";
      }

      // Fetch Active Streams
      final streamCount = await supa.from('live_streams').select('id', const FetchOptions(count: CountOption.exact)).eq('is_active', true);
      
      setState(() {
        _activeStreamCount = streamCount.count;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading Agora settings: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _saveSettings() async {
    setState(() => _isSaving = true);
    try {
      final supa = _api.getSupabase();
      await supa.from('app_settings').update({'setting_value': _appIdController.text.trim()}).eq('setting_key', 'agora_app_id');
      await supa.from('app_settings').update({'setting_value': _certController.text.trim()}).eq('setting_key', 'agora_app_certificate');
      
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Agora Credentials Updated! 🚀")));
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error: $e")));
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));

    return Container(
      decoration: const BoxDecoration(color: Color(0xFF0F172A)),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(),
            const SizedBox(height: 40),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(flex: 3, child: _buildCredentialsCard()),
                const SizedBox(width: 32),
                Expanded(flex: 2, child: _buildEmergencyCard()),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("AGORA RTC INFRASTRUCTURE", style: GoogleFonts.outfit(color: Colors.white, fontSize: 28, fontWeight: FontWeight.w900)),
        const Text("Manage real-time communication credentials and emergency stream termination", style: TextStyle(color: Colors.white38, fontSize: 14)),
      ],
    );
  }

  Widget _buildCredentialsCard() {
    return FadeInLeft(
      child: Container(
        padding: const EdgeInsets.all(40),
        decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(LucideIcons.video, color: Color(0xFF6366F1), size: 20),
              const SizedBox(width: 16),
              Text("API CREDENTIALS", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)),
            ]),
            const SizedBox(height: 40),
            _buildFieldLabel("Agora App ID"),
            _buildTextField(_appIdController, "e.g. bad7adbb1f9e4fd3bc519fc704e22803"),
            const SizedBox(height: 24),
            _buildFieldLabel("Primary App Certificate"),
            _buildTextField(_certController, "Enter your Agora Certificate", isPassword: !_showCert, suffix: IconButton(icon: Icon(_showCert ? LucideIcons.eyeOff : LucideIcons.eye, color: Colors.white24, size: 16), onPressed: () => setState(() => _showCert = !_showCert))),
            const SizedBox(height: 48),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: _isSaving ? null : _saveSettings,
                    icon: _isSaving ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(LucideIcons.save, size: 16),
                    label: const Text("SAVE CHANGES", style: TextStyle(fontWeight: FontWeight.bold)),
                    style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF6366F1), foregroundColor: Colors.white, height: 56, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                  ),
                ),
                const SizedBox(width: 16),
                OutlinedButton.icon(
                  onPressed: () {},
                  icon: const Icon(LucideIcons.refreshCw, size: 16),
                  label: const Text("TEST CONNECTION"),
                  style: OutlinedButton.styleFrom(foregroundColor: Colors.white70, height: 56, side: const BorderSide(color: Colors.white10), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildEmergencyCard() {
    return FadeInRight(
      child: Container(
        padding: const EdgeInsets.all(40),
        decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.redAccent.withOpacity(0.1))),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Icon(LucideIcons.alertTriangle, color: Colors.redAccent, size: 20),
              const SizedBox(width: 16),
              Text("EMERGENCY CONTROLS", style: GoogleFonts.outfit(color: Colors.redAccent, fontWeight: FontWeight.bold, fontSize: 18)),
            ]),
            const SizedBox(height: 32),
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(20)),
              child: Column(
                children: [
                  Text(_activeStreamCount.toString(), style: GoogleFonts.outfit(color: Colors.redAccent, fontSize: 48, fontWeight: FontWeight.w900)),
                  const Text("ACTIVE STREAMS", style: TextStyle(color: Colors.redAccent, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                ],
              ),
            ),
            const SizedBox(height: 32),
            const Text("Force termination will end all active RTC sessions and trigger a global app re-entry for all connected clients.", style: TextStyle(color: Colors.white24, fontSize: 12)),
            const SizedBox(height: 40),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton.icon(
                onPressed: _activeStreamCount == 0 ? null : () {},
                icon: const Icon(LucideIcons.power, size: 16),
                label: const Text("FORCE STOP ALL", style: TextStyle(fontWeight: FontWeight.bold)),
                style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent.withOpacity(0.1), foregroundColor: Colors.redAccent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFieldLabel(String label) {
    return Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(label.toUpperCase(), style: const TextStyle(color: Colors.white70, fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 1.5)));
  }

  Widget _buildTextField(TextEditingController controller, String hint, {bool isPassword = false, Widget? suffix}) {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(16), border: Border.all(color: Colors.white10)),
      child: TextField(
        controller: controller,
        obscureText: isPassword,
        style: GoogleFonts.robotoMono(color: Colors.white, fontSize: 14),
        decoration: InputDecoration(hintText: hint, hintStyle: const TextStyle(color: Colors.white10), border: InputBorder.none, contentPadding: const EdgeInsets.all(20), suffixIcon: suffix),
      ),
    );
  }
}
