import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/design_tokens.dart';

/// Reusable full-width gradient CTA — matches web `h-10 rounded-2xl` buttons.
class GradientButton extends StatelessWidget {
  const GradientButton({
    super.key,
    required this.gradient,
    required this.label,
    required this.icon,
    required this.onPressed,
    this.loading = false,
    this.glowColor,
  });

  final List<Color> gradient;
  final String label;
  final Widget icon;
  final VoidCallback? onPressed;
  final bool loading;
  final Color? glowColor;

  @override
  Widget build(BuildContext context) {
    final glow = glowColor ?? gradient.last;
    return Semantics(
      button: true,
      label: label,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(DT.btnRadius),
          onTap: onPressed == null
              ? null
              : () {
                  HapticFeedback.selectionClick();
                  onPressed!();
                },
          child: Ink(
            height: DT.btnHeight,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.centerLeft,
                end: Alignment.centerRight,
                colors: gradient,
              ),
              borderRadius: BorderRadius.circular(DT.btnRadius),
              border: Border.all(color: Colors.white.withOpacity(0.18)),
              boxShadow: [
                BoxShadow(
                  color: glow.withOpacity(0.45),
                  blurRadius: 18,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                if (loading)
                  const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.2,
                      valueColor: AlwaysStoppedAnimation(Color(0xFFFCD34D)),
                    ),
                  )
                else
                  IconTheme(
                    data: const IconThemeData(color: Colors.white, size: 20),
                    child: icon,
                  ),
                const SizedBox(width: 8),
                Text(
                  label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.3,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
