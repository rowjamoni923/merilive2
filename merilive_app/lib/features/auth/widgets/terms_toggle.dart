import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

/// Terms + Privacy + 18+ pill toggle. Parity with web landing.
///
/// The Terms of Service and Privacy Policy spans are tappable and open
/// the canonical Meri Live URLs in the device browser (parity with the
/// web `<a href="/terms">` and `<a href="/privacy">` links).
class TermsToggle extends StatefulWidget {
  const TermsToggle({
    super.key,
    required this.agreed,
    required this.onChanged,
    this.termsUrl = 'https://merilive.top/terms',
    this.privacyUrl = 'https://merilive.top/privacy',
  });

  final bool agreed;
  final ValueChanged<bool> onChanged;
  final String termsUrl;
  final String privacyUrl;

  @override
  State<TermsToggle> createState() => _TermsToggleState();
}

class _TermsToggleState extends State<TermsToggle> {
  late final TapGestureRecognizer _termsTap;
  late final TapGestureRecognizer _privacyTap;

  @override
  void initState() {
    super.initState();
    _termsTap = TapGestureRecognizer()..onTap = () => _open(widget.termsUrl);
    _privacyTap = TapGestureRecognizer()
      ..onTap = () => _open(widget.privacyUrl);
  }

  @override
  void dispose() {
    _termsTap.dispose();
    _privacyTap.dispose();
    super.dispose();
  }

  Future<void> _open(String url) async {
    HapticFeedback.selectionClick();
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } else if (mounted) {
      ScaffoldMessenger.of(context)
        ..clearSnackBars()
        ..showSnackBar(SnackBar(
          behavior: SnackBarBehavior.floating,
          content: Text('Could not open $url'),
        ));
    }
  }

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: () {
        HapticFeedback.selectionClick();
        widget.onChanged(!widget.agreed);
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(12),
          gradient: widget.agreed
              ? const LinearGradient(colors: [
                  Color(0x3310B981),
                  Color(0x3314B8A6),
                ])
              : null,
          color: widget.agreed ? null : Colors.white.withOpacity(0.05),
          border: Border.all(
            color: widget.agreed
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
                gradient: widget.agreed
                    ? const LinearGradient(colors: [
                        Color(0xFF34D399),
                        Color(0xFF14B8A6),
                      ])
                    : null,
                color: widget.agreed ? null : Colors.white.withOpacity(0.1),
                border: widget.agreed
                    ? null
                    : Border.all(color: Colors.white.withOpacity(0.3)),
              ),
              child: widget.agreed
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
                    color:
                        Colors.white.withOpacity(widget.agreed ? 0.95 : 0.7),
                  ),
                  children: [
                    const TextSpan(text: 'I agree to the '),
                    TextSpan(
                      text: 'Terms of Service',
                      style: const TextStyle(
                        decoration: TextDecoration.underline,
                        fontWeight: FontWeight.w700,
                      ),
                      recognizer: _termsTap,
                    ),
                    const TextSpan(text: ' & '),
                    TextSpan(
                      text: 'Privacy Policy',
                      style: const TextStyle(
                        decoration: TextDecoration.underline,
                        fontWeight: FontWeight.w700,
                      ),
                      recognizer: _privacyTap,
                    ),
                    const TextSpan(text: ' • 18+'),
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
