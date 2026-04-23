import 'dart:async';
import 'package:flutter/material.dart';
import 'package:animate_do/animate_do.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:shared_preferences/shared_preferences.dart';

class RatingPromoBanner extends StatefulWidget {
  const RatingPromoBanner({super.key});

  @override
  State<RatingPromoBanner> createState() => _RatingPromoBannerState();
}

class _RatingPromoBannerState extends State<RatingPromoBanner> {
  int _countdown = 3;
  bool _canSkip = false;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      setState(() {
        if (_countdown > 1) {
          _countdown--;
        } else {
          _canSkip = true;
          _timer?.cancel();
        }
      });
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _dismiss() {
    Navigator.of(context).pop();
  }

  Future<void> _handleRatingClick() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('rating_popup_dismissed', true);
    await prefs.setBool('rating_reward_return_pending', true);
    
    if (mounted) _dismiss();

    final Uri playStoreUri = Uri.parse('https://play.google.com/store/apps/details?id=com.merilive.app');
    if (await canLaunchUrl(playStoreUri)) {
      await launchUrl(playStoreUri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Stack(
        children: [
          // Background Dim
          Positioned.fill(
            child: GestureDetector(
              onTap: _canSkip ? _dismiss : null,
              child: Container(color: Colors.black87),
            ),
          ),
          
          Center(
            child: ZoomIn(
              duration: const Duration(milliseconds: 300),
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  GestureDetector(
                    onTap: _handleRatingClick,
                    child: Container(
                      width: MediaQuery.of(context).size.width * 0.85,
                      constraints: const BoxConstraints(maxWidth: 400),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(color: Colors.purple.withOpacity(0.5), blurRadius: 40, spreadRadius: 5),
                          BoxShadow(color: Colors.amber.withOpacity(0.2), blurRadius: 20),
                        ],
                      ),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(24),
                        child: Image.asset(
                          'assets/images/banner-rating-reward.jpg',
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) => Container(
                            height: 300,
                            color: const Color(0xFF1A1035),
                            child: const Center(child: Text("⭐ RATE US FOR 500 BEANS", style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold))),
                          ),
                        ),
                      ),
                    ),
                  ),
                  
                  // Skip Button / Countdown
                  Positioned(
                    top: 16, right: 16,
                    child: _canSkip
                      ? GestureDetector(
                          onTap: _dismiss,
                          child: Container(
                            width: 36, height: 36,
                            decoration: BoxDecoration(
                              color: Colors.black.withOpacity(0.6),
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white.withOpacity(0.2)),
                            ),
                            child: const Icon(LucideIcons.x, color: Colors.white, size: 16),
                          ),
                        )
                      : Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                          decoration: BoxDecoration(
                            color: Colors.black.withOpacity(0.6),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: Colors.white.withOpacity(0.2)),
                          ),
                          child: Text("${_countdown}s", style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                        ),
                  ),
                  
                  // Bottom Hint
                  Positioned(
                    bottom: 16,
                    left: 0, right: 0,
                    child: Center(
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                        decoration: BoxDecoration(
                          color: Colors.black.withOpacity(0.55),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: Colors.white.withOpacity(0.15)),
                        ),
                        child: const Text("Tap banner to rate on Play Store", style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w600)),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}


