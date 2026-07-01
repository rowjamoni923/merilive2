import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lucide_icons/lucide_icons.dart';

class DeviceBannedScreen extends StatelessWidget {
  const DeviceBannedScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // Intercept back button to prevent escaping the screen
    return PopScope(
      canPop: false,
      child: Scaffold(
        backgroundColor: Colors.black,
        body: Container(
          width: double.infinity,
          decoration: const BoxDecoration(
            gradient: RadialGradient(
              center: Alignment.center,
              radius: 1.5,
              colors: [
                Color(0xFF450A0A), // Red-950
                Colors.black,
              ],
            ),
          ),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Bouncing shield icon
              TweenAnimationBuilder<double>(
                tween: Tween(begin: 0.8, end: 1.2),
                duration: const Duration(seconds: 2),
                builder: (context, val, child) {
                  return Transform.scale(
                    scale: val,
                    child: child,
                  );
                },
                child: Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.red.withOpacity(0.5),
                        blurRadius: 50,
                        spreadRadius: 10,
                      )
                    ],
                  ),
                  child: const Center(
                    child: Icon(
                      LucideIcons.shieldAlert,
                      color: Colors.redAccent,
                      size: 80,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 48),
              
              Text(
                "ACCESS DENIED",
                style: GoogleFonts.lexend(
                  color: Colors.redAccent,
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  letterSpacing: 4,
                ),
              ),
              
              const SizedBox(height: 16),
              
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: Text(
                  "Your Device/ID has been Permanently Banned.",
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              
              const SizedBox(height: 24),
              
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40),
                child: Text(
                  "Due to severe violations of our community guidelines, this device is no longer allowed to access MeriLive.",
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                    color: Colors.white54,
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
              ),
              
              const SizedBox(height: 48),
              
              // Exit button to close the app natively
              GestureDetector(
                onTap: () {
                  SystemNavigator.pop();
                },
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                  decoration: BoxDecoration(
                    color: Colors.redAccent.withOpacity(0.1),
                    border: Border.all(color: Colors.redAccent.withOpacity(0.3)),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    "EXIT APP",
                    style: GoogleFonts.inter(
                      color: Colors.redAccent,
                      fontWeight: FontWeight.bold,
                      letterSpacing: 2,
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


