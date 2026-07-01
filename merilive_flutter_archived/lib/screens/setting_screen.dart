import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:animate_do/animate_do.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/auth_service.dart';
import '../services/api_service.dart';
import '../widgets/nebula_background.dart';

class SettingScreen extends StatefulWidget {
  const SettingScreen({super.key});

  @override
  State<SettingScreen> createState() => _SettingScreenState();
}

class _SettingScreenState extends State<SettingScreen> {
  final ApiService _api = ApiService();
  bool _isLoading = false;

  void _showLanguageSelector(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1E1B4B),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Select Language", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 20),
            _buildLangTile("English", "en"),
            _buildLangTile("বাংলা (Bengali)", "bn"),
            _buildLangTile("اردو (Urdu)", "ur"),
            _buildLangTile("हिंदी (Hindi)", "hi"),
          ],
        ),
      ),
    );
  }

  Widget _buildLangTile(String name, String code) {
    return ListTile(
      title: Text(name, style: const TextStyle(color: Colors.white)),
      trailing: const Icon(LucideIcons.chevronRight, color: Colors.white24, size: 16),
      onTap: () async {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('language_code', code);
        if (mounted) Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Language changed to $name")));
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F1015),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: Column(
              children: [
                _buildHeader(context),
                Expanded(
                  child: SingleChildScrollView(
                    physics: const BouncingScrollPhysics(),
                    padding: const EdgeInsets.symmetric(horizontal: 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        FadeInUp(duration: const Duration(milliseconds: 300), child: _buildSectionTitle("PREFERENCES")),
                        FadeInUp(delay: const Duration(milliseconds: 100), child: _buildSettingsGroup([
                          _buildSettingTile(LucideIcons.bell, "Notifications & Permissions", null, onTapOverride: () => ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Permissions are managed by OS settings")))),
                          _buildSettingTile(LucideIcons.globe, "Select Language", null, trailingText: "English", onTapOverride: () => _showLanguageSelector(context)),
                        ])),
                        const SizedBox(height: 24),
                        FadeInUp(delay: const Duration(milliseconds: 200), child: _buildSectionTitle("ACCOUNT")),
                        FadeInUp(delay: const Duration(milliseconds: 300), child: _buildSettingsGroup([
                          _buildSettingTile(LucideIcons.ban, "Blacklist", '/blocked_users'),
                          _buildSettingTile(LucideIcons.users, "User Management", '/settings/user-management'),
                        ])),
                        const SizedBox(height: 24),
                        FadeInUp(delay: const Duration(milliseconds: 400), child: _buildSectionTitle("ABOUT & SUPPORT")),
                        FadeInUp(delay: const Duration(milliseconds: 500), child: _buildSettingsGroup([
                          _buildSettingTile(LucideIcons.shield, "Privacy Policy", '/settings/privacy-policy'),
                          _buildSettingTile(LucideIcons.fileText, "User Agreement", '/settings/user-agreement'),
                          _buildSettingTile(LucideIcons.info, "About Us", '/settings/about-us'),
                          _buildSettingTile(LucideIcons.smartphone, "Version", null, trailingText: "v8.1.0"),
                          _buildSettingTile(LucideIcons.headphones, "Customer Service", '/support'),
                        ])),
                        const SizedBox(height: 24),
                        FadeInUp(delay: const Duration(milliseconds: 600), child: _buildSectionTitle("DANGER ZONE")),
                        FadeInUp(delay: const Duration(milliseconds: 650), child: _buildSettingsGroup([
                          _buildSettingTile(LucideIcons.userX, "Delete Account", null, isDanger: true, onTapOverride: () => _showDeleteConfirm(context)),
                        ])),
                        const SizedBox(height: 40),
                        FadeInUp(delay: const Duration(milliseconds: 700), child: _buildLogoutButton(context)),
                        const SizedBox(height: 40),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(LucideIcons.arrowLeft, color: Colors.white),
            onPressed: () => Navigator.pop(context),
          ),
          const SizedBox(width: 8),
          Text("Settings", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 8, bottom: 12),
      child: Text(title, style: GoogleFonts.outfit(color: Colors.white38, fontSize: 12, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
    );
  }

  Widget _buildSettingsGroup(List<Widget> children) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.05),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withOpacity(0.05)),
      ),
      child: Column(children: children),
    );
  }

  Widget _buildSettingTile(IconData icon, String title, String? route, {String? trailingText, bool isDanger = false, VoidCallback? onTapOverride}) {
    return InkWell(
      onTap: onTapOverride ?? (route != null ? () => Navigator.pushNamed(context, route) : null),
      borderRadius: BorderRadius.circular(20),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        child: Row(
          children: [
            Icon(icon, color: isDanger ? Colors.redAccent : Colors.white70, size: 20),
            const SizedBox(width: 16),
            Expanded(child: Text(title, style: GoogleFonts.outfit(color: isDanger ? Colors.redAccent : Colors.white, fontSize: 15, fontWeight: FontWeight.w500))),
            if (trailingText != null) Text(trailingText, style: GoogleFonts.outfit(color: Colors.white38, fontSize: 13)),
            if (trailingText == null) const Icon(LucideIcons.chevronRight, color: Colors.white24, size: 18),
          ],
        ),
      ),
    );
  }

  Widget _buildLogoutButton(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      height: 56,
      child: ElevatedButton(
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.redAccent.withOpacity(0.1),
          foregroundColor: Colors.redAccent,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          side: BorderSide(color: Colors.redAccent.withOpacity(0.2)),
        ),
        onPressed: () async {
          setState(() => _isLoading = true);
          try {
            final auth = Provider.of<AuthService>(context, listen: false);
            final prefs = await SharedPreferences.getInstance();
            await prefs.clear();
            await auth.signOut();
            if (context.mounted) Navigator.pushNamedAndRemoveUntil(context, '/auth', (route) => false);
          } finally {
            if (mounted) setState(() => _isLoading = false);
          }
        },
        child: _isLoading 
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.redAccent))
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(LucideIcons.logOut, size: 18),
                  const SizedBox(width: 10),
                  Text("LOG OUT", style: GoogleFonts.outfit(fontSize: 14, fontWeight: FontWeight.bold, letterSpacing: 1)),
                ],
              ),
      ),
    );
  }

  void _showDeleteConfirm(BuildContext context) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E1B4B),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text("Delete Account?", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold)),
        content: Text("Your account will be permanently deleted after 30 days. This action cannot be undone.", style: GoogleFonts.outfit(color: Colors.white70, fontSize: 14)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Cancel")),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.redAccent, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
            onPressed: () => Navigator.pop(ctx),
            child: const Text("Confirm"),
          )
        ],
      ),
    );
  }
}
