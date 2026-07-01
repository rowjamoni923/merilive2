import 'package:flutter/material.dart';

import '../../../core/theme/design_tokens.dart';

/// Shared cream-gradient card used across every auth step
/// (gender, email input, OTP, password, login).
class CreamCard extends StatelessWidget {
  const CreamCard({super.key, required this.child, this.maxWidth = 380});
  final Widget child;
  final double maxWidth;

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: BoxConstraints(maxWidth: maxWidth),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: DT.cardCream,
        ),
        borderRadius: BorderRadius.circular(DT.cardRadius),
        border: Border.all(color: const Color(0x4D9333EA)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.25),
            blurRadius: 30,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: child,
    );
  }
}

class FieldLabel extends StatelessWidget {
  const FieldLabel(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 2),
        child: Text(
          text,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w700,
            color: Color(0xFF334155),
          ),
        ),
      );
}

InputDecoration authInputDeco({
  required String hint,
  IconData? prefix,
  Widget? suffix,
  Color focus = const Color(0xFFEC4899),
}) {
  return InputDecoration(
    counterText: '',
    hintText: hint,
    hintStyle: const TextStyle(color: Color(0xFF94A3B8)),
    prefixIcon: prefix != null
        ? Icon(prefix, color: const Color(0xFF64748B), size: 20)
        : null,
    suffixIcon: suffix,
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    border: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
    ),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(12),
      borderSide: BorderSide(color: focus, width: 1.4),
    ),
  );
}

/// Shared brand header — icon halo + gradient title + subtitle.
class AuthCardHeader extends StatelessWidget {
  const AuthCardHeader({
    super.key,
    required this.icon,
    required this.title,
    required this.subtitle,
    this.gradientColors = const [
      Color(0xFFBE185D),
      Color(0xFFE11D48),
      Color(0xFFD97706),
    ],
    this.haloColors = const [Color(0x4D9333EA), Color(0x4DEC4899)],
    this.iconColor = const Color(0xFF9333EA),
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final List<Color> gradientColors;
  final List<Color> haloColors;
  final Color iconColor;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: LinearGradient(colors: haloColors),
          ),
          child: Icon(icon, color: iconColor, size: 34),
        ),
        const SizedBox(height: 12),
        ShaderMask(
          shaderCallback: (r) =>
              LinearGradient(colors: gradientColors).createShader(r),
          child: Text(
            title,
            style: const TextStyle(
              fontSize: 22,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: const TextStyle(fontSize: 12, color: Color(0xFF475569)),
        ),
      ],
    );
  }
}

/// Pill CTA — used as primary submit on every auth card.
class PillGradientButton extends StatelessWidget {
  const PillGradientButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.gradient = DT.btnStart,
    this.icon = Icons.arrow_forward_rounded,
    this.glow = const Color(0xFFEC4899),
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final List<Color> gradient;
  final IconData icon;
  final Color glow;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null && !loading;
    return SizedBox(
      height: DT.dialogBtnHeight,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(999),
          onTap: enabled ? onPressed : null,
          child: Ink(
            decoration: BoxDecoration(
              gradient: LinearGradient(colors: gradient),
              borderRadius: BorderRadius.circular(999),
              boxShadow: [
                BoxShadow(
                  color: glow.withOpacity(enabled ? 0.5 : 0),
                  blurRadius: 18,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: loading
                  ? const [
                      SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                          strokeWidth: 2.2,
                          valueColor: AlwaysStoppedAnimation(Colors.white),
                        ),
                      ),
                    ]
                  : [
                      Text(
                        label,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Icon(icon, color: Colors.white, size: 18),
                    ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Snackbar helper reused by every auth page.
void authSnack(BuildContext context, String msg, {bool error = false}) {
  ScaffoldMessenger.of(context)
    ..clearSnackBars()
    ..showSnackBar(SnackBar(
      behavior: SnackBarBehavior.floating,
      backgroundColor: error ? const Color(0xFFDC2626) : const Color(0xFF10B981),
      content: Text(msg, style: const TextStyle(color: Colors.white)),
    ));
}
