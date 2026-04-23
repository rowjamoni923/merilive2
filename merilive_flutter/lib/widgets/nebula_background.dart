import 'package:flutter/material.dart';
import 'dart:ui';

class NebulaBackground extends StatelessWidget {
  final Widget? child;
  const NebulaBackground({super.key, this.child});

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // 1. Deep Base Gradient
        Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [
                Color(0xFF1A0533),
                Color(0xFF0F0720),
                Color(0xFF080312),
              ],
            ),
          ),
        ),

        // 2. Top-Left Warm Accent (Purple)
        Positioned(
          top: -100,
          left: -100,
          child: Container(
            width: 300,
            height: 300,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF7E22CE).withOpacity(0.15),
            ),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 100, sigmaY: 100),
              child: Container(color: Colors.transparent),
            ),
          ),
        ),

        // 3. Top-Right Cool Accent (Indigo)
        Positioned(
          top: 50,
          right: -100,
          child: Container(
            width: 280,
            height: 280,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF4F46E5).withOpacity(0.12),
            ),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 90, sigmaY: 90),
              child: Container(color: Colors.transparent),
            ),
          ),
        ),

        // 4. Center Subtle Pink/Fuchsia
        Positioned(
          top: MediaQuery.of(context).size.height * 0.3,
          left: MediaQuery.of(context).size.width * 0.1,
          child: Container(
            width: 320,
            height: 200,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFFA21CAF).withOpacity(0.08),
            ),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 80, sigmaY: 80),
              child: Container(color: Colors.transparent),
            ),
          ),
        ),

        // 5. Bottom Subtle Glow
        Positioned(
          bottom: 100,
          left: 50,
          child: Container(
            width: 250,
            height: 250,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: const Color(0xFF581C87).withOpacity(0.15),
            ),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 100, sigmaY: 100),
              child: Container(color: Colors.transparent),
            ),
          ),
        ),

        // 6. Optional Fine Grain Texture (approximated with very low opacity noise pattern or just skip for performance)
        
        if (child != null) child!,
      ],
    );
  }
}


