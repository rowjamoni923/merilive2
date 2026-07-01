import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../utils/design_system.dart';
import 'customer_service_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = true;
  String _appVersion = "1.0.0";
  String _buildNumber = "1";
  String _selectedLanguage = "auto";
  Map<String, dynamic>? _profile;
  bool _isDeleteLoading = false;

  final List<Map<String, dynamic>> _languages = [
    {"code": "auto", "name": "Automatic", "flag": "🌍"},
    {"code": "bn", "name": "Bengali", "flag": "🇧🇩"},
    {"code": "en", "name": "English", "flag": "🇺🇸"},
    {"code": "hi", "name": "Hindi", "flag": "🇮🇳"},
    {"code": "ar", "name": "Arabic", "flag": "🇸🇦"},
  ];

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    try {
      final results = await Future.wait([
        _api.getMyProfile(),
        PackageInfo.fromPlatform(),
        SharedPreferences.getInstance(),
      ]);

      _profile = results[0] as Map<String, dynamic>?;
      final packageInfo = results[1] as PackageInfo;
      final prefs = results[2] as SharedPreferences;

      _appVersion = packageInfo.version;
      _buildNumber = packageInfo.buildNumber;
      _selectedLanguage = prefs.getString("meri_app_language") ?? "auto";

    } catch (e) {
      debugPrint("Error loading settings: $e");
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _handleLogout() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text("Log Out", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
        content: Text("Are you sure you want to log out from MeriLive?", style: GoogleFonts.outfit(color: Colors.white70)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text("CANCEL", style: TextStyle(color: Colors.white38))),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text("LOGOUT", style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await _api.getSupabase().auth.signOut();
      if (mounted) Navigator.pushNamedAndRemoveUntil(context, '/auth', (route) => false);
    }
  }

  void _showLanguageDialog() {
    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogState) => Dialog(
          backgroundColor: const Color(0xFF0F172A),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          child: Container(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text("Select Language", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 20),
                Flexible(
                  child: ListView.builder(
                    shrinkWrap: true,
                    itemCount: _languages.length,
                    itemBuilder: (context, index) {
                      final lang = _languages[index];
                      final bool isSelected = _selectedLanguage == lang['code'];
                      return GestureDetector(
                        onTap: () async {
                          final prefs = await SharedPreferences.getInstance();
                          await prefs.setString("meri_app_language", lang['code']);
                          setState(() => _selectedLanguage = lang['code']);
                          if (mounted) Navigator.pop(context);
                        },
                        child: Container(
                          margin: const EdgeInsets.only(bottom: 10),
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            color: isSelected ? Colors.blue.withOpacity(0.1) : Colors.white.withOpacity(0.05),
                            borderRadius: BorderRadius.circular(16),
                            border: Border.all(color: isSelected ? Colors.blue : Colors.transparent),
                          ),
                          child: Row(
                            children: [
                              Text(lang['flag'], style: const TextStyle(fontSize: 20)),
                              const SizedBox(width: 16),
                              Text(lang['name'], style: GoogleFonts.outfit(color: Colors.white, fontWeight: isSelected ? FontWeight.bold : FontWeight.normal)),
                              const Spacer(),
                              if (isSelected) const Icon(LucideIcons.check, color: Colors.blue, size: 18),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) return const Scaffold(backgroundColor: Color(0xFF0F172A), body: Center(child: CircularProgressIndicator(color: Colors.blue)));

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
        title: Text("SETTINGS", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16, letterSpacing: 1.5)),
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        physics: const BouncingScrollPhysics(),
        children: [
          _buildSection("PREFERENCES", [
            _tile(LucideIcons.bell, "Notifications", value: "Enabled", onTap: () {}),
            _tile(LucideIcons.globe, "Language", value: _languages.firstWhere((l) => l['code'] == _selectedLanguage)['name'], onTap: _showLanguageDialog),
          ]),
          _buildSection("PRIVACY & SECURITY", [
            _tile(LucideIcons.ban, "Blacklist", onTap: () => Navigator.pushNamed(context, '/blacklist')),
            _tile(LucideIcons.users, "User Management", onTap: () {}),
            _tile(LucideIcons.shieldCheck, "Privacy Policy", onTap: () {}),
            _tile(LucideIcons.fileText, "User Agreement", onTap: () {}),
          ]),
          _buildSection("SUPPORT", [
            _tile(LucideIcons.headphones, "Customer Service", onTap: () => Navigator.push(context, MaterialPageRoute(builder: (c) => const CustomerServiceScreen()))),
            _tile(LucideIcons.info, "About Us", onTap: () {}),
            _tile(LucideIcons.star, "Rate MeriLive", onTap: () {}),
          ]),
          _buildSection("SYSTEM", [
            _tile(LucideIcons.trash2, "Clear Cache", value: "0 KB", onTap: () {}),
            _tile(LucideIcons.smartphone, "Version", value: "$_appVersion ($_buildNumber)", showArrow: false),
          ]),
          _buildSection("ACCOUNT DANGER", [
            _tile(LucideIcons.userX, "Delete Account", color: Colors.redAccent, onTap: _showDeleteAccountDialog),
          ]),
          const SizedBox(height: 30),
          FadeInUp(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20),
              child: ElevatedButton.icon(
                onPressed: _handleLogout,
                icon: const Icon(LucideIcons.logOut, size: 18),
                label: Text("LOG OUT", style: GoogleFonts.outfit(fontWeight: FontWeight.bold, letterSpacing: 1)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.redAccent.withOpacity(0.1),
                  foregroundColor: Colors.redAccent,
                  minimumSize: const Size(double.infinity, 56),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20), side: const BorderSide(color: Colors.redAccent, width: 0.5)),
                  elevation: 0,
                ),
              ),
            ),
          ),
          const SizedBox(height: 50),
        ],
      ),
    );
  }

  Widget _buildSection(String title, List<Widget> children) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(left: 10, bottom: 10, top: 10),
          child: Text(title, style: GoogleFonts.outfit(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1)),
        ),
        Container(
          decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
          child: Column(children: children),
        ),
        const SizedBox(height: 10),
      ],
    );
  }

  Widget _tile(IconData icon, String title, {String? value, Color? color, VoidCallback? onTap, bool showArrow = true}) {
    return ListTile(
      onTap: onTap,
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(color: (color ?? Colors.white).withOpacity(0.1), borderRadius: BorderRadius.circular(12)),
        child: Icon(icon, color: color ?? Colors.white70, size: 20),
      ),
      title: Text(title, style: GoogleFonts.outfit(color: color ?? Colors.white, fontSize: 14, fontWeight: FontWeight.w500)),
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (value != null) Text(value, style: GoogleFonts.outfit(color: Colors.white38, fontSize: 13)),
          if (showArrow) const SizedBox(width: 8),
          if (showArrow) Icon(LucideIcons.chevronRight, color: (color ?? Colors.white).withOpacity(0.2), size: 18),
        ],
      ),
    );
  }

  void _showDeleteAccountDialog() {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: Text("Delete Account", style: GoogleFonts.outfit(color: Colors.redAccent, fontWeight: FontWeight.bold)),
        content: Text(
          "Warning: This action is permanent. Your account and all data will be deleted in 30 days. You can cancel this request anytime before then.",
          style: GoogleFonts.outfit(color: Colors.white70),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("CANCEL", style: TextStyle(color: Colors.white38))),
          TextButton(
            onPressed: () async {
              Navigator.pop(context);
              setState(() => _isDeleteLoading = true);
              final res = await _api.requestAccountDeletion();
              setState(() => _isDeleteLoading = false);
              if (mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(res['success'] ? "Account deletion scheduled." : res['error'])));
              }
            },
            child: const Text("CONFIRM DELETE", style: TextStyle(color: Colors.redAccent, fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}
