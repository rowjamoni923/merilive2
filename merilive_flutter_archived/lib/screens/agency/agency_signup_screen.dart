import 'dart:async';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';
import '../../widgets/nebula_background.dart';

class AgencySignupScreen extends StatefulWidget {
  const AgencySignupScreen({super.key});

  @override
  State<AgencySignupScreen> createState() => _AgencySignupScreenState();
}

class _AgencySignupScreenState extends State<AgencySignupScreen> {
  final _apiService = ApiService();
  bool _isSubmitting = false;

  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _appUidController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _emailController = TextEditingController();
  final TextEditingController _whatsappController = TextEditingController();
  final TextEditingController _emailOtpController = TextEditingController();
  final TextEditingController _appOtpController = TextEditingController();

  Map<String, dynamic>? _foundUser;
  bool _isSearchingUser = false;
  bool _userNotFound = false;

  bool _emailOtpSent = false;
  bool _emailVerified = false;
  bool _isSendingEmailOtp = false;
  bool _isVerifyingEmailOtp = false;
  int _emailTimer = 0;
  Timer? _emailTimerRef;

  bool _appOtpSent = false;
  bool _appVerified = false;
  bool _isSendingAppOtp = false;
  String _generatedAppOtp = "";
  int _appTimer = 0;
  Timer? _appTimerRef;

  @override
  void dispose() {
    _emailTimerRef?.cancel();
    _appTimerRef?.cancel();
    _nameController.dispose();
    _appUidController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    _whatsappController.dispose();
    _emailOtpController.dispose();
    _appOtpController.dispose();
    super.dispose();
  }

  void _startEmailTimer() {
    _emailTimer = 300;
    _emailTimerRef?.cancel();
    _emailTimerRef = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_emailTimer == 0) {
        timer.cancel();
      } else {
        setState(() => _emailTimer--);
      }
    });
  }

  void _startAppTimer() {
    _appTimer = 300;
    _appTimerRef?.cancel();
    _appTimerRef = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_appTimer == 0) {
        timer.cancel();
      } else {
        setState(() => _appTimer--);
      }
    });
  }

  Future<void> _searchUser() async {
    final uid = _appUidController.text.trim().toUpperCase();
    if (uid.isEmpty) return;

    setState(() {
      _isSearchingUser = true;
      _userNotFound = false;
      _foundUser = null;
    });

    try {
      final user = await _apiService.searchUserByAppUid(uid);
      if (user != null) {
        if (user['agency_id'] != null) {
          _showError("⚠️ Already in Agency", "User is already part of another agency.");
          setState(() => _userNotFound = true);
          return;
        }
        setState(() => _foundUser = user);
      } else {
        setState(() => _userNotFound = true);
      }
    } finally {
      setState(() => _isSearchingUser = false);
    }
  }

  Future<void> _sendEmailOtp() async {
    final email = _emailController.text.trim();
    if (email.isEmpty || !email.contains('@')) return;

    setState(() => _isSendingEmailOtp = true);
    final res = await _apiService.sendEmailOtp(email);
    setState(() => _isSendingEmailOtp = false);

    if (res['success'] == true) {
      setState(() => _emailOtpSent = true);
      _startEmailTimer();
      _showSuccess("✅ OTP Sent!", "Check your email for the verification code.");
    } else {
      _showError("Error", res['error'] ?? "Failed to send OTP");
    }
  }

  Future<void> _verifyEmailOtp() async {
    final otp = _emailOtpController.text.trim();
    if (otp.length != 6) return;

    setState(() => _isVerifyingEmailOtp = true);
    final res = await _apiService.verifyEmailOtp(_emailController.text.trim(), otp);
    setState(() => _isVerifyingEmailOtp = false);

    if (res['success'] == true) {
      setState(() => _emailVerified = true);
      _showSuccess("✅ Verified!", "Email verification successful.");
    } else {
      _showError("Error", res['error'] ?? "Verification failed");
    }
  }

  Future<void> _submit() async {
    if (_nameController.text.trim().isEmpty) { _showError("Error", "Please enter agency name"); return; }
    if (_foundUser == null) { _showError("Error", "Please verify a user first"); return; }
    if (!_emailVerified) { _showError("Error", "Please verify email first"); return; }

    setState(() => _isSubmitting = true);
    try {
      final chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
      String agencyCode = "AG${List.generate(6, (index) => chars[Random().nextInt(chars.length)]).join()}";

      final res = await _apiService.createAgencyForUser(
        ownerId: _foundUser!['id'],
        name: _nameController.text.trim(),
        agencyCode: agencyCode,
        email: _emailController.text.trim(),
        whatsapp: _whatsappController.text.trim(),
        level: "A1",
        commissionRate: 3.0,
      );

      if (res['success'] == true || res['id'] != null) {
        if (mounted) {
           _showSuccess("🎉 Success!", "Agency Nexus created: $agencyCode");
           Navigator.pop(context);
        }
      } else {
        _showError("Error", res['error'] ?? "Creation failed");
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  void _showError(String title, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$title: $msg"), backgroundColor: Colors.redAccent, behavior: SnackBarBehavior.floating));
  }

  void _showSuccess(String title, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("$title: $msg"), backgroundColor: Colors.greenAccent, foregroundColor: Colors.black, behavior: SnackBarBehavior.floating));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          const NebulaBackground(),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildHeader(),
                  const SizedBox(height: 32),
                  _buildIntroCard(),
                  const SizedBox(height: 32),
                  _buildSectionLabel("AGENCY IDENTITY"),
                  _buildTextField(_nameController, "Agency Display Name", LucideIcons.building),
                  const SizedBox(height: 24),
                  _buildSectionLabel("OWNER VERIFICATION"),
                  _buildOwnerVerificationModule(),
                  const SizedBox(height: 24),
                  _buildSectionLabel("COMMUNICATION HUB"),
                  _buildEmailVerificationModule(),
                  const SizedBox(height: 16),
                  _buildTextField(_whatsappController, "WhatsApp (Optional)", LucideIcons.messageCircle),
                  const SizedBox(height: 48),
                  _buildSubmitButton(),
                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
          if (_isSubmitting)
            const Center(child: CircularProgressIndicator(color: Colors.cyanAccent)),
        ],
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        IconButton(icon: const Icon(LucideIcons.chevronLeft, color: Colors.white), onPressed: () => Navigator.pop(context)),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text("Agent Form", style: GoogleFonts.outfit(color: Colors.white, fontSize: 22, fontWeight: FontWeight.bold)),
            Text("Master Copy • Agency License Portal", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 11)),
          ],
        ),
      ],
    );
  }

  Widget _buildIntroCard() {
    return FadeInDown(
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.02),
          borderRadius: BorderRadius.circular(32),
          border: Border.all(color: Colors.white.withOpacity(0.05)),
        ),
        child: Row(
          children: [
            Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: Colors.purpleAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(16)), child: const Icon(LucideIcons.sparkles, color: Colors.purpleAccent, size: 24)),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text("Agency License", style: GoogleFonts.outfit(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                  Text("Register your agency license and start your recruitment journey.", style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 10, height: 1.4)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionLabel(String label) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 12),
      child: Text(label, style: GoogleFonts.outfit(color: Colors.white24, fontSize: 10, fontWeight: FontWeight.w900, letterSpacing: 2)),
    );
  }

  Widget _buildTextField(TextEditingController controller, String hint, IconData icon) {
    return Container(
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: TextField(
        controller: controller,
        style: const TextStyle(color: Colors.white),
        decoration: InputDecoration(
          hintText: hint,
          hintStyle: const TextStyle(color: Colors.white10, fontSize: 13),
          prefixIcon: Icon(icon, color: Colors.white24, size: 18),
          border: InputBorder.none,
          contentPadding: const EdgeInsets.all(20),
        ),
      ),
    );
  }

  Widget _buildOwnerVerificationModule() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(28), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _appUidController,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(hintText: "Enter App UID", hintStyle: TextStyle(color: Colors.white10, fontSize: 13), border: InputBorder.none),
                ),
              ),
              IconButton(
                onPressed: _isSearchingUser ? null : _searchUser,
                icon: _isSearchingUser ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.cyanAccent)) : const Icon(LucideIcons.search, color: Colors.cyanAccent, size: 20),
              ),
            ],
          ),
          if (_foundUser != null) ...[
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.greenAccent.withOpacity(0.05), borderRadius: BorderRadius.circular(16)),
              child: Row(
                children: [
                  CircleAvatar(radius: 16, backgroundImage: NetworkImage(_foundUser!['avatar_url'] ?? '')),
                  const SizedBox(width: 12),
                  Expanded(child: Text(_foundUser!['display_name'] ?? 'Owner Found', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 13))),
                  const Icon(LucideIcons.checkCircle2, color: Colors.greenAccent, size: 16),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildEmailVerificationModule() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.02), borderRadius: BorderRadius.circular(28), border: Border.all(color: Colors.white.withOpacity(0.05))),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _emailController,
                  style: const TextStyle(color: Colors.white),
                  decoration: const InputDecoration(hintText: "Official Email Address", hintStyle: TextStyle(color: Colors.white10, fontSize: 13), border: InputBorder.none),
                ),
              ),
              if (!_emailVerified)
                TextButton(
                  onPressed: _isSendingEmailOtp ? null : _sendEmailOtp,
                  child: Text(_emailOtpSent ? "RESEND" : "VERIFY", style: const TextStyle(color: Colors.cyanAccent, fontWeight: FontWeight.bold, fontSize: 12)),
                ),
            ],
          ),
          if (_emailOtpSent && !_emailVerified) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _emailOtpController,
                    style: const TextStyle(color: Colors.white),
                    decoration: const InputDecoration(hintText: "Enter 6-digit code", hintStyle: TextStyle(color: Colors.white10, fontSize: 13), border: InputBorder.none),
                  ),
                ),
                ElevatedButton(
                  onPressed: _isVerifyingEmailOtp ? null : _verifyEmailOtp,
                  style: ElevatedButton.styleFrom(backgroundColor: Colors.white.withOpacity(0.05), elevation: 0, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  child: const Text("OK", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ],
          if (_emailVerified)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Row(children: [const Icon(LucideIcons.checkCircle2, color: Colors.greenAccent, size: 14), const SizedBox(width: 8), Text(_emailController.text, style: const TextStyle(color: Colors.greenAccent, fontSize: 11))]),
            ),
        ],
      ),
    );
  }

  Widget _buildSubmitButton() {
    bool ready = _emailVerified && _foundUser != null && _nameController.text.isNotEmpty;
    return FadeInUp(
      child: SizedBox(
        width: double.infinity,
        height: 60,
        child: ElevatedButton(
          onPressed: ready && !_isSubmitting ? _submit : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: ready ? const Color(0xFF6366F1) : Colors.white10,
            foregroundColor: ready ? Colors.white : Colors.white24,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
            elevation: 0,
          ),
          child: Text("ACTIVATE AGENCY LICENSE", style: GoogleFonts.outfit(fontWeight: FontWeight.w900, fontSize: 14, letterSpacing: 1.5)),
        ),
      ),
    );
  }
}
