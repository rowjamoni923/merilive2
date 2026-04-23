import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'dart:async';
import 'dart:ui';
import '../services/api_service.dart';
import '../screens/recharge_screen.dart';

class FloatingCampaignWidget extends StatefulWidget {
  const FloatingCampaignWidget({super.key});

  @override
  State<FloatingCampaignWidget> createState() => _FloatingCampaignWidgetState();
}

class _FloatingCampaignWidgetState extends State<FloatingCampaignWidget> with SingleTickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  Map<String, dynamic>? _campaign;
  Timer? _timer;
  Duration _timeLeft = const Duration(minutes: 29, seconds: 59); // Fake/Demo timer mirroring Web Parity
  late AnimationController _pulseController;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(vsync: this, duration: const Duration(seconds: 2))..repeat(reverse: true);
    _loadCampaign();
  }

  Future<void> _loadCampaign() async {
    try {
      final cp = await _apiService.getActiveRechargeCampaign();
      if (cp != null && mounted) {
        setState(() => _campaign = cp);
        _startTimer();
      }
    } catch (e) {
      debugPrint("Floating Campaign Error: $e");
    }
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        if (_timeLeft.inSeconds > 0) {
          _timeLeft -= const Duration(seconds: 1);
        } else {
          _timer?.cancel();
        }
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _pulseController.dispose();
    super.dispose();
  }

  String get _formattedTime {
    String twoDigits(int n) => n.toString().padLeft(2, "0");
    String m = twoDigits(_timeLeft.inMinutes.remainder(60));
    String s = twoDigits(_timeLeft.inSeconds.remainder(60));
    return "$m:$s";
  }

  void _showCampaignPopup() {
    if (_campaign == null) return;
    final int bonus = _campaign!['bonus_percentage'] ?? 0;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      isScrollControlled: true,
      builder: (context) => ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
          child: Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topCenter, end: Alignment.bottomCenter,
                colors: [Color(0xFF1E1B4B), Color(0xFF0F0C29)],
              ),
              border: Border(top: BorderSide(color: Colors.amber.withOpacity(0.3), width: 2)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.white24, borderRadius: BorderRadius.circular(2))),
                const SizedBox(height: 24),
                
                // Glowing Title
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: Colors.amber.withOpacity(0.1),
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: Colors.amber.withOpacity(0.5), blurRadius: 40)],
                  ),
                  child: const Icon(LucideIcons.flame, color: Colors.amber, size: 48),
                ),
                const SizedBox(height: 16),
                
                Text(
                  "🔥 $bonus% EXCLUSIVE BONUS 🔥",
                  style: GoogleFonts.inter(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w900, letterSpacing: 1),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  "Top up now and claim your extra diamonds instantly. Limited time offer before the campaign expires!",
                  style: GoogleFonts.inter(color: Colors.white70, fontSize: 13, height: 1.5),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                
                // Timer
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  decoration: BoxDecoration(color: Colors.redAccent.withOpacity(0.1), borderRadius: BorderRadius.circular(20), border: Border.all(color: Colors.redAccent.withOpacity(0.5))),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(LucideIcons.timer, color: Colors.redAccent, size: 16),
                      const SizedBox(width: 8),
                      Text("Expires in $_formattedTime", style: GoogleFonts.inter(color: Colors.redAccent, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
                const SizedBox(height: 32),
                
                // BUY NOW Button
                GestureDetector(
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(context, MaterialPageRoute(builder: (context) => const RechargeScreen()));
                  },
                  child: Container(
                    width: double.infinity,
                    height: 56,
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(colors: [Color(0xFFF59E0B), Color(0xFFD97706)]),
                      borderRadius: BorderRadius.circular(28),
                      boxShadow: [BoxShadow(color: Colors.amber.withOpacity(0.4), blurRadius: 15, offset: const Offset(0, 5))],
                    ),
                    child: Center(
                      child: Text("BUY NOW", style: GoogleFonts.inter(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w900, letterSpacing: 2)),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_campaign == null) return const SizedBox.shrink();
    final bonus = _campaign!['bonus_percentage'] ?? 0;

    return GestureDetector(
      onTap: _showCampaignPopup,
      child: AnimatedBuilder(
        animation: _pulseController,
        builder: (context, child) {
          return Transform.scale(
            scale: 1.0 + (_pulseController.value * 0.05),
            child: child,
          );
        },
        child: Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: const LinearGradient(
              colors: [Color(0xFFFBBF24), Color(0xFFF59E0B)],
              begin: Alignment.topLeft, end: Alignment.bottomRight,
            ),
            boxShadow: [
              BoxShadow(color: const Color(0xFFF59E0B).withOpacity(0.5), blurRadius: 20, spreadRadius: 5),
              BoxShadow(color: const Color(0xFFEF4444).withOpacity(0.5), blurRadius: 10, spreadRadius: -2),
            ],
            border: Border.all(color: Colors.redAccent, width: 2),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              // Inner glowing ring
              Container(
                margin: const EdgeInsets.all(4),
                decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: Colors.white54, width: 1)),
              ),
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(color: Colors.redAccent, borderRadius: BorderRadius.circular(8)),
                    child: Text(_formattedTime, style: GoogleFonts.inter(color: Colors.white, fontSize: 9, fontWeight: FontWeight.w900)),
                  ),
                  const SizedBox(height: 4),
                  Text("$bonus%", style: GoogleFonts.inter(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w900, shadows: [const Shadow(color: Colors.black54, blurRadius: 4)])),
                  Text("BONUS", style: GoogleFonts.inter(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold, letterSpacing: 0.5)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}


