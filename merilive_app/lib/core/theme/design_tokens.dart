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

  // ── Home shell — pearl-cream bottom nav (parity with BottomNavigation.tsx)
  static const Color navCreamTop = Color(0xFFFFFDF8);   // rgba(255,253,248,0.96)
  static const Color navCreamBottom = Color(0xFFFCF7ED); // rgba(252,247,237,0.98)
  static const Color champagne = Color(0xFFC9A84C);      // brand accent line
  static const Color champagneDeep = Color(0xFF8B6914);
  static const Color champagneLight = Color(0xFFB8860B);
  static const Color navInkMuted = Color(0xFF64748B);    // slate-500
  static const List<Color> navPillActive = [
    Color(0xFFFFF0FA),
    Color(0xFFFDE4F3),
  ];

  // Center Create FAB gradient (radial in web, linear approximation here)
  static const List<Color> createFabRadial = [
    Color(0xFFFFD1EA),
    Color(0xFFEC4899),
    Color(0xFFA855F7),
    Color(0xFF6366F1),
  ];

  // Action-sheet gradients (Go Live / Create Party / Random Call)
  static const List<Color> actionGoLive = [
    Color(0xFFEF4444), Color(0xFFEC4899), Color(0xFFF43F5E),
  ];
  static const List<Color> actionParty = [
    Color(0xFF9333EA), Color(0xFF8B5CF6), Color(0xFF6366F1),
  ];
  static const List<Color> actionMatchCall = [
    Color(0xFF06B6D4), Color(0xFF14B8A6), Color(0xFF10B981),
  ];

  // Per-tab active accent (matches web nav gradients)
  static const List<Color> tabHome = [Color(0xFFEC4899), Color(0xFFF43F5E)];
  static const List<Color> tabParty = [Color(0xFFA855F7), Color(0xFF6366F1)];
  static const List<Color> tabReels = [Color(0xFFF97316), Color(0xFFF59E0B)];
  static const List<Color> tabProfile = [Color(0xFF06B6D4), Color(0xFF3B82F6)];
}

