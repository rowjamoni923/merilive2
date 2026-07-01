import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class AdminBeautySdkScreen extends StatefulWidget {
  const AdminBeautySdkScreen({super.key});

  @override
  State<AdminBeautySdkScreen> createState() => _AdminBeautySdkScreenState();
}

class _AdminBeautySdkScreenState extends State<AdminBeautySdkScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  bool _isSaving = false;
  bool _showLicenseKey = false;
  bool _showToken = false;

  final TextEditingController _appIdController = TextEditingController();
  final TextEditingController _licenseKeyController = TextEditingController();
  final TextEditingController _tokenController = TextEditingController();
  bool _isEnabled = true;

  @override
  void initState() {
    super.initState();
    _loadSettings();
  }

  Future<void> _loadSettings() async {
    setState(() => _isLoading = true);
    try {
      final supa = _api.getSupabase();
      final keys = [
        'tencent_beauty_app_id',
        'tencent_beauty_license_key',
        'tencent_beauty_token',
        'tencent_beauty_enabled',
      ];

      final res = await supa.from('app_settings').select('setting_key, setting_value').in_('setting_key', keys);
      
      final Map<String, dynamic> map = {};
      for (var item in res) {
        map[item['setting_key']] = item['setting_value'];
      }

      setState(() {
        _appIdController.text = map['tencent_beauty_app_id']?.toString() ?? "";
        _licenseKeyController.text = map['tencent_beauty_license_key']?.toString() ?? "";
        _tokenController.text = map['tencent_beauty_token']?.toString() ?? "";
        _isEnabled = map['tencent_beauty_enabled'] != false;
        _isLoading = false;
      });
    } catch (e) {
      debugPrint("Error loading beauty settings: $e");
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _saveSettings() async {
    setState(() => _isSaving = true);
    try {
      final supa = _api.getSupabase();
      final updates = [
        {'setting_key': 'tencent_beauty_app_id', 'setting_value': _appIdController.text, 'category': 'tencent_beauty'},
        {'setting_key': 'tencent_beauty_license_key', 'setting_value': _licenseKeyController.text, 'category': 'tencent_beauty'},
        {'setting_key': 'tencent_beauty_token', 'setting_value': _tokenController.text, 'category': 'tencent_beauty'},
        {'setting_key': 'tencent_beauty_enabled', 'setting_value': _isEnabled, 'category': 'tencent_beauty'},
      ];

      for (var update in updates) {
        await supa.from('app_settings').upsert(update);
      }
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Beauty SDK settings saved! ✨")));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Error saving: $e")));
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _isLoading 
      ? const Center(child: CircularProgressIndicator(color: Colors.purpleAccent))
      : SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _buildHeader(),
              const SizedBox(height: 24),
              _buildEnableSwitch(),
              const SizedBox(height: 24),
              _buildCredentialsSection(),
              const SizedBox(height: 32),
              _buildSaveButton(),
            ],
          ),
        );
  }

  Widget _buildHeader() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.purpleAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.purpleAccent.withOpacity(0.1))),
      child: Row(
        children: [
          const Icon(LucideIcons.sparkles, color: Colors.purpleAccent, size: 24),
          const SizedBox(width: 20),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text("AI Beauty AR SDK", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
                SizedBox(height: 4),
                Text("Configure Tencent RTC Beauty filters and AI-based visual stickers for live streaming.", style: TextStyle(color: Colors.white24, fontSize: 12)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildEnableSwitch() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(
            children: [
              const Icon(LucideIcons.shieldCheck, color: Colors.emeraldAccent, size: 20),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: const [
                  Text("SDK Active Status", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
                  Text("Globally enable/disable beauty effects", style: TextStyle(color: Colors.white24, fontSize: 11)),
                ],
              ),
            ],
          ),
          Switch(value: _isEnabled, onChanged: (v) => setState(() => _isEnabled = v), activeColor: Colors.emeraldAccent),
        ],
      ),
    );
  }

  Widget _buildCredentialsSection() {
    return Container(
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.01), borderRadius: BorderRadius.circular(32), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text("SDK CREDENTIALS", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 12, letterSpacing: 1.2)),
          const SizedBox(height: 32),
          _textField("App ID (SDKAppID)", _appIdController, LucideIcons.smartphone, false),
          const SizedBox(height: 24),
          _textField("License Key", _licenseKeyController, LucideIcons.key, !_showLicenseKey, onToggle: () => setState(() => _showLicenseKey = !_showLicenseKey)),
          const SizedBox(height: 24),
          _textField("Security Token", _tokenController, LucideIcons.shield, !_showToken, onToggle: () => setState(() => _showToken = !_showToken)),
        ],
      ),
    );
  }

  Widget _textField(String label, TextEditingController controller, IconData icon, bool obscure, {VoidCallback? onToggle}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(color: Colors.white24, fontSize: 11, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          obscureText: obscure,
          style: const TextStyle(color: Colors.white, fontSize: 14),
          decoration: InputDecoration(
            prefixIcon: Icon(icon, color: Colors.white10, size: 16),
            suffixIcon: onToggle != null ? IconButton(icon: Icon(obscure ? LucideIcons.eye : LucideIcons.eyeOff, color: Colors.white10, size: 16), onPressed: onToggle) : null,
            filled: true,
            fillColor: Colors.white.withOpacity(0.03),
            enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: BorderSide(color: Colors.white.withOpacity(0.05))),
            focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(16), borderSide: const BorderSide(color: Colors.purpleAccent)),
          ),
        ),
      ],
    );
  }

  Widget _buildSaveButton() {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        onPressed: _isSaving ? null : _saveSettings,
        icon: _isSaving ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)) : const Icon(LucideIcons.save, size: 14),
        label: Text(_isSaving ? "SAVING..." : "SAVE CONFIGURATION", style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
        style: ElevatedButton.styleFrom(backgroundColor: Colors.purpleAccent.withOpacity(0.1), foregroundColor: Colors.purpleAccent, padding: const EdgeInsets.symmetric(vertical: 24), shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: BorderSide(color: Colors.purpleAccent.withOpacity(0.2)))),
      ),
    );
  }
}
