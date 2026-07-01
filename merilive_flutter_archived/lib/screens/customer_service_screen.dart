import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../services/api_service.dart';
import '../widgets/ai_support_chat.dart';

class CustomerServiceScreen extends StatefulWidget {
  const CustomerServiceScreen({super.key});

  @override
  State<CustomerServiceScreen> createState() => _CustomerServiceScreenState();
}

class _CustomerServiceScreenState extends State<CustomerServiceScreen> {
  final ApiService _api = ApiService();
  bool _showChat = false;
  int _userLevel = 1;
  String _displayName = "User";
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadUser();
  }

  Future<void> _loadUser() async {
    final profile = await _api.getMyProfile();
    if (profile != null) {
      setState(() {
        _userLevel = profile['user_level'] ?? 1;
        _displayName = profile['display_name'] ?? "User";
      });
    }
    setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_showChat) {
      return AISupportChat(
        userLevel: _userLevel,
        userName: _displayName,
        onClose: () => setState(() => _showChat = false),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(icon: const Icon(LucideIcons.arrowLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
        title: Text("Customer Service", style: GoogleFonts.outfit(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 16)),
        centerTitle: true,
      ),
      body: _isLoading 
          ? const Center(child: CircularProgressIndicator(color: Colors.blue))
          : ListView(
              padding: const EdgeInsets.all(24),
              children: [
                _buildHeroCard(),
                const SizedBox(height: 24),
                _buildQuickStats(),
                const SizedBox(height: 32),
                _buildCommonIssues(),
                const SizedBox(height: 40),
                _buildLevelInfo(),
              ],
            ),
    );
  }

  Widget _buildHeroCard() {
    final bool isPremium = _userLevel >= 6;
    return FadeInDown(
      child: GestureDetector(
        onTap: () => setState(() => _showChat = true),
        child: Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                const Color(0xFF3B82F6).withOpacity(0.2),
                const Color(0xFF2563EB).withOpacity(0.1),
              ],
            ),
            borderRadius: BorderRadius.circular(32),
            border: Border.all(color: Colors.blue.withOpacity(0.3)),
          ),
          child: Stack(
            children: [
              if (isPremium)
                Positioned(
                  top: 0, right: 0,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: Colors.amber.withOpacity(0.2), borderRadius: BorderRadius.circular(10), border: Border.all(color: Colors.amber.withOpacity(0.3))),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(LucideIcons.sparkles, color: Colors.amber, size: 10),
                        const SizedBox(width: 4),
                        Text("PRIORITY", style: GoogleFonts.outfit(color: Colors.amber, fontSize: 8, fontWeight: FontWeight.w900)),
                      ],
                    ),
                  ),
                ),
              Row(
                children: [
                  Container(
                    width: 64, height: 64,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Colors.blue, Color(0xFF1D4ED8)]),
                      borderRadius: BorderRadius.circular(22),
                      boxShadow: [BoxShadow(color: Colors.blue.withOpacity(0.3), blurRadius: 15, offset: const Offset(0, 8))],
                    ),
                    child: const Icon(LucideIcons.bot, color: Colors.white, size: 32),
                  ),
                  const SizedBox(width: 20),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text("Chat with AI Support", style: GoogleFonts.outfit(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        Text("Get instant help 24/7 or talk to an agent", style: GoogleFonts.outfit(color: Colors.white54, fontSize: 12)),
                        const SizedBox(height: 16),
                        ElevatedButton.icon(
                          onPressed: () => setState(() => _showChat = true),
                          icon: const Icon(LucideIcons.messageCircle, size: 16),
                          label: const Text("START CHAT", style: TextStyle(fontSize: 10, fontWeight: FontWeight.w900)),
                          style: ElevatedButton.styleFrom(backgroundColor: Colors.blue, foregroundColor: Colors.white, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildQuickStats() {
    return Row(
      children: [
        Expanded(child: _infoCard(LucideIcons.mail, "Email Support", "merilive.us@gmail.com", Colors.blue)),
        const SizedBox(width: 16),
        Expanded(child: _infoCard(LucideIcons.clock, "Response Time", "Within 24 Hours", Colors.green)),
      ],
    );
  }

  Widget _infoCard(IconData icon, String title, String value, Color color) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.03), borderRadius: BorderRadius.circular(24), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 20),
          const SizedBox(height: 12),
          Text(title, style: GoogleFonts.outfit(color: Colors.white38, fontSize: 10, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(value, style: GoogleFonts.outfit(color: Colors.white70, fontSize: 11, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }

  Widget _buildCommonIssues() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text("COMMON ISSUES", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 11, fontWeight: FontWeight.w900, letterSpacing: 1)),
        const SizedBox(height: 16),
        _issueTile("Account Issues", "Login, verification, profile problems"),
        _issueTile("Payment Issues", "Recharge, diamonds, transactions"),
        _issueTile("Technical Issues", "App crashes, bugs, errors"),
      ],
    );
  }

  Widget _issueTile(String title, String desc) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: ListTile(
        onTap: () => setState(() => _showChat = true),
        title: Text(title, style: GoogleFonts.outfit(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w600)),
        subtitle: Text(desc, style: GoogleFonts.outfit(color: Colors.white38, fontSize: 11)),
        trailing: const Icon(LucideIcons.messageCircle, color: Colors.white24, size: 18),
      ),
    );
  }

  Widget _buildLevelInfo() {
    return Center(
      child: Column(
        children: [
          Text("Your Support Level: $_userLevel", style: GoogleFonts.outfit(color: Colors.white38, fontSize: 12)),
          if (_userLevel < 6)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text("Reach Level 6 to unlock Priority Support", style: GoogleFonts.outfit(color: Colors.blue.withOpacity(0.5), fontSize: 10, fontWeight: FontWeight.bold)),
            ),
        ],
      ),
    );
  }
}
