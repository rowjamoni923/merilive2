import 'package:flutter/material.dart';
import 'dart:ui';

/// App3DDesign
/// 
/// Centralized Design System for "3D Professional" aesthetics.
/// Provides standardized 3D shadows, light-leak gradients, and glassmorphic presets.
class App3DDesign {
  // --- Colors ---
  static const Color spaceDark = Color(0xFF0C091D);
  static const Color primaryPurple = Color(0xFF8B5CF6);
  static const Color accentPink = Color(0xFFEC4899);
  static const Color glassBorder = Color(0x1AFFFFFF);
  static const Color goldGlow = Color(0xFFFFD700);

  // --- Gradients ---
  static const LinearGradient premiumGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [primaryPurple, accentPink],
  );

  static const LinearGradient darkGlassGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0x1FFFFFFF), Color(0x0AFFFFFF)],
  );

  // --- 3D Shadows & Depth ---
  static List<BoxShadow> get premium3DShadow => [
    BoxShadow(
      color: Colors.black.withOpacity(0.5),
      offset: const Offset(4, 8),
      blurRadius: 16,
      spreadRadius: -4,
    ),
    BoxShadow(
      color: accentPink.withOpacity(0.2),
      offset: const Offset(-2, -4),
      blurRadius: 12,
      spreadRadius: -2,
    ),
  ];

  static List<BoxShadow> get buttonGlowShadow => [
    BoxShadow(
      color: accentPink.withOpacity(0.6),
      blurRadius: 20,
      spreadRadius: -5,
      offset: const Offset(0, 10),
    ),
  ];

  // --- Glassmorphism Preset ---
  static BoxDecoration glassDecoration({
    double borderRadius = 24.0,
    double opacity = 0.07,
    bool showBorder = true,
  }) {
    return BoxDecoration(
      color: Colors.white.withOpacity(opacity),
      borderRadius: BorderRadius.circular(borderRadius),
      border: showBorder ? Border.all(color: glassBorder, width: 1.2) : null,
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.2),
          blurRadius: 40,
          offset: const Offset(0, 20),
        )
      ],
    );
  }

  // --- Complex 3D Card Decoration ---
  static BoxDecoration card3DDecoration({
    Color? color,
    double borderRadius = 28.0,
  }) {
    return BoxDecoration(
      color: color ?? spaceDark,
      borderRadius: BorderRadius.circular(borderRadius),
      boxShadow: premium3DShadow,
      gradient: color == null ? darkGlassGradient : null,
      border: Border.all(color: glassBorder, width: 1.0),
    );
  }

  // --- 3D Economy Icons ---
  static Widget diamondIcon({double size = 20}) {
    return Image.asset(
      'assets/images/premium_3d_diamond.png',
      width: size,
      height: size,
      fit: BoxFit.contain,
    );
  }

  static Widget beanIcon({double size = 20}) {
    return Image.asset(
      'assets/images/premium_3d_bean.png',
      width: size,
      height: size,
      fit: BoxFit.contain,
    );
  }

  // --- Ambient Background Light Leak ---
  static Widget buildAmbientGlow(BuildContext context) {
    return Stack(
      children: [
        Positioned(
          top: -100, right: -50,
          child: Container(
            width: 300, height: 300,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0x1AEC4899),
              boxShadow: [BoxShadow(color: Color(0x1AEC4899), blurRadius: 150)],
            ),
          ),
        ),
        Positioned(
          bottom: 100, left: -100,
          child: Container(
            width: 400, height: 400,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: Color(0x128B5CF6),
              boxShadow: [BoxShadow(color: Color(0x128B5CF6), blurRadius: 200)],
            ),
          ),
        ),
      ],
    );
  }
}


