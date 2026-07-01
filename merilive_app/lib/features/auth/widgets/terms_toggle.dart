import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Terms + Privacy + 18+ pill toggle. Parity with web landing.
class TermsToggle extends StatelessWidget {
  const TermsToggle({
    super.key,
    required this.agreed,
    required this.onChanged,
  });

  final bool agreed;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () {
        HapticFeedback.selectionClick();
        onChanged(!agreed);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          gradient: agreed
              ? const LinearGradient(colors: [
                  Color(0x3310B981),
                  Color(0x3314B8A6),
                ])
              : null,
          color: agreed ? null : Colors.white.withOpacity(0.05),
          border: Border.all(
            color: agreed
                ? const Color(0x6610B981)
                : Colors.white.withOpacity(0.15),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 250),
              width: 16,
              height: 16,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(4),
                gradient: agreed
                    ? const LinearGradient(colors: [
                        Color(0xFF34D399),
                        Color(0xFF14B8A6),
                      ])
                    : null,
                color: agreed ? null : Colors.white.withOpacity(0.1),
                border: agreed
                    ? null
                    : Border.all(color: Colors.white.withOpacity(0.3)),
              ),
              child: agreed
                  ? const Icon(Icons.check, size: 12, color: Colors.white)
                  : null,
            ),
            const SizedBox(width: 8),
            Flexible(
              child: RichText(
                textAlign: TextAlign.center,
                text: TextSpan(
                  style: TextStyle(
                    fontSize: 10,
                    height: 1.35,
                    letterSpacing: 0.3,
                    color: Colors.white.withOpacity(agreed ? 0.95 : 0.7),
                  ),
                  children: const [
                    TextSpan(text: 'I agree to the '),
                    TextSpan(
                      text: 'Terms of Service',
                      style: TextStyle(decoration: TextDecoration.underline),
                    ),
                    TextSpan(text: ' & '),
                    TextSpan(
                      text: 'Privacy Policy',
                      style: TextStyle(decoration: TextDecoration.underline),
                    ),
                    TextSpan(text: ' • 18+'),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
