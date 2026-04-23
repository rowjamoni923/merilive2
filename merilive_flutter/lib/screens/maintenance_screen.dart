import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';
import 'package:animate_do/animate_do.dart';

class MaintenanceScreen extends StatelessWidget {
  final String? reason;
  const MaintenanceScreen({super.key, this.reason});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      body: Stack(
        children: [
          // 1. Premium Background Glows
          Positioned(
            top: -100,
            left: -100,
            child: Container(
              width: 300,
              height: 300,
              decoration: BoxDecoration(
                color: const Color(0xFFD946EF).withOpacity(0.15),
                shape: BoxShape.circle,
              ),
            ),
          ),
          
          Center(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 40),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  FadeInDown(
                    duration: const Duration(milliseconds: 600),
                    child: Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: Colors.white.withOpacity(0.05),
                        shape: BoxShape.circle,
                        border: Border.all(color: Colors.white10),
                      ),
                      child: const Icon(
                        LucideIcons.hammer,
                        color: Color(0xFFD946EF),
                        size: 64,
                      ),
                    ),
                  ),
                  const SizedBox(height: 40),
                  FadeIn(
                    delay: const Duration(milliseconds: 300),
                    child: Text(
                      "Upgrading the Fun",
                      style: GoogleFonts.outfit(
                        color: Colors.white,
                        fontSize: 28,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1,
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  FadeIn(
                    delay: const Duration(milliseconds: 500),
                    child: Text(
                      reason ?? "We're currently performing some technical maintenance to provide you with a even more premium experience. We'll be back shortly!",
                      textAlign: TextAlign.center,
                      style: GoogleFonts.inter(
                        color: Colors.white60,
                        fontSize: 15,
                        height: 1.6,
                      ),
                    ),
                  ),
                  const SizedBox(height: 60),
                  FadeInUp(
                    delay: const Duration(milliseconds: 700),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      decoration: BoxDecoration(
                        color: Colors.white10,
                        borderRadius: BorderRadius.circular(100),
                        border: Border.all(color: Colors.white54),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const SizedBox(
                            width: 12, height: 12,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Color(0xFFD946EF),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Text(
                            "Waiting for Server...",
                            style: GoogleFonts.inter(
                              color: Colors.white70,
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
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


