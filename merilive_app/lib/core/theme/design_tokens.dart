import 'package:flutter/material.dart';

/// Design tokens — MUST match Section 1 spec §4 (pixel parity with web).
class DT {
  const DT._();

  // ── Auth background gradient (deep space purple) ────────────────────────
  static const List<Color> authBgGradient = [
    Color(0xFF0F0C29),
    Color(0xFF302B63),
    Color(0xFF24243E),
    Color(0xFF0F0C29),
  ];

  // ── Glow orbs ───────────────────────────────────────────────────────────
  static const Color glowPurple = Color(0xFF9B87F5);
  static const Color glowPink = Color(0xFFF472B6);
  static const Color glowBlue = Color(0xFF60A5FA);

  // ── Cream card surface (Auth cards) ─────────────────────────────────────
  static const List<Color> cardCream = [
    Color(0xFFFFFBF2),
    Color(0xFFFAF5EA),
    Color(0xFFF5EFDF),
  ];

  // ── Primary button gradients ────────────────────────────────────────────
  static const List<Color> btnStart = [
    Color(0xFF9333EA), // purple-600
    Color(0xFFD946EF), // fuchsia-500
    Color(0xFFEC4899), // pink-500
  ];

  static const List<Color> btnPhone = [
    Color(0xFF22C55E), // green-500
    Color(0xFF10B981), // emerald-500
    Color(0xFF16A34A), // green-600
  ];

  static const List<Color> btnEmail = [
    Color(0xFF4338CA), // indigo-700
    Color(0xFF2563EB), // blue-600
    Color(0xFF0284C7), // sky-600
  ];

  static const List<Color> btnLogin = [
    Color(0xFFDB2777), // pink-600
    Color(0xFFF43F5E), // rose-500
    Color(0xFFDB2777),
  ];

  // ── Radii ───────────────────────────────────────────────────────────────
  static const double btnRadius = 16.0; // rounded-2xl
  static const double cardRadius = 24.0; // rounded-3xl

  // ── Heights ─────────────────────────────────────────────────────────────
  static const double btnHeight = 40.0; // h-10
  static const double dialogBtnHeight = 48.0; // h-12

  // ── Typography (Inter, fallback Poppins) ────────────────────────────────
  static const String fontFamily = 'Inter';
}
