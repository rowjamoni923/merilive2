import 'package:flutter/material.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:animate_do/animate_do.dart';
import '../../services/api_service.dart';

class BannedScreen extends StatefulWidget {
  const BannedScreen({super.key});

  @override
  State<BannedScreen> createState() => _BannedScreenState();
}

class _BannedScreenState extends State<BannedScreen> {
  final ApiService _api = ApiService();
  String? _banReason;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchReason();
  }

  Future<void> _fetchReason() async {
    try {
      final user = _api.getSupabase().auth.currentUser;
      if (user == null) return;

      final data = await _api.getSupabase()
          .from('profiles')
          .select('blocked_reason')
          .eq('id', user.id)
          .single();

      if (data != null && data['blocked_reason'] != null) {
        setState(() {
          _banReason = data['blocked_reason'];
        });
      }
    } catch (e) {
      debugPrint("Error fetching ban reason: $e");
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _handleLogout() async {
    await _api.logout();
    if (mounted) {
      Navigator.of(context).pushReplacementNamed('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Icon
              ZoomIn(
                duration: const Duration(milliseconds: 600),
                child: Container(
                  width: 100,
                  height: 100,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: RadialGradient(
                      colors: [
                        Colors.red.withOpacity(0.3),
                        Colors.red.shade900.withOpacity(0.3),
                      ],
                    ),
                    border: Border.all(color: Colors.red.withOpacity(0.5), width: 2),
                  ),
                  child: const Icon(LucideIcons.shieldX, color: Colors.redAccent, size: 48),
                ),
              ),
              const SizedBox(height: 32),

              // Title
              FadeInUp(
                delay: const Duration(milliseconds: 300),
                child: Text(
                  "Your Account Has Been Permanently Banned",
                  textAlign: TextAlign.center,
                  style: GoogleFonts.outfit(
                    color: Colors.white,
                    fontSize: 24,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Description
              FadeInUp(
                delay: const Duration(milliseconds: 400),
                child: Text(
                  "Your account has been permanently suspended for violating our Community Guidelines.\nIf you believe this is a mistake, please contact our support team.",
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.6),
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
              ),
              const SizedBox(height: 32),

              // Ban Reason
              if (_banReason != null)
                FadeInUp(
                  delay: const Duration(milliseconds: 450),
                  child: Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.red.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: Colors.red.withOpacity(0.3)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: const [
                            Icon(LucideIcons.ban, color: Colors.redAccent, size: 14),
                            SizedBox(width: 8),
                            Text(
                              "Ban Reason",
                              style: TextStyle(color: Colors.redAccent, fontSize: 10, fontWeight: FontWeight.bold),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          _banReason!,
                          style: const TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500),
                        ),
                      ],
                    ),
                  ),
                ),
              const SizedBox(height: 16),

              // Support info
              FadeInUp(
                delay: const Duration(milliseconds: 500),
                child: Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.02),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white.withOpacity(0.05)),
                  ),
                  child: Column(
                    children: [
                      Text(
                        "SUPPORT EMAIL",
                        style: TextStyle(color: Colors.white.withOpacity(0.3), fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 1),
                      ),
                      const SizedBox(height: 6),
                      const Text(
                        "support@merilive.com",
                        style: TextStyle(color: Colors.white, fontSize: 14, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 48),

              // Logout button
              FadeInUp(
                delay: const Duration(milliseconds: 600),
                child: SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: OutlinedButton.icon(
                    onPressed: _handleLogout,
                    icon: const Icon(LucideIcons.logOut, size: 18),
                    label: const Text("LOG OUT"),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: BorderSide(color: Colors.white.withOpacity(0.1)),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      backgroundColor: Colors.white.withOpacity(0.05),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
