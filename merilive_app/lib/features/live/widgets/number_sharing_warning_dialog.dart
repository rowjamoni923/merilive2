import 'package:flutter/material.dart';

import '../../../core/moderation/contact_moderation.dart';

/// P0 #2 — Flutter port of `NumberSharingWarningDialog.tsx`.
///
/// Three modes (mirrors web):
///   • `showGeneric` — non-host attempted to share contact info; educational only
///   • `showViolation` — verified host, N-th offence, beans deducted
///   • `showBanned` — verified host, cap reached, account suspended
class NumberSharingWarningDialog {
  static Future<void> showGeneric(BuildContext context) {
    return showDialog(
      context: context,
      builder: (_) => const _WarningDialog(
        icon: Icons.shield_outlined,
        accent: Color(0xFFE11D48),
        title: '🚫 Contact Sharing Prohibited',
        body:
            'Sharing phone numbers, social media links, or personal contact information is strictly prohibited on this platform.',
        subBody:
            'Your message was flagged and reported to admin. Repeated violations may result in account suspension.',
      ),
    );
  }

  static Future<void> showOutcome(
    BuildContext context,
    ModerationOutcome outcome,
  ) {
    if (outcome.isBanned) {
      return showDialog(
        context: context,
        barrierDismissible: false,
        builder: (_) => const _WarningDialog(
          icon: Icons.block_rounded,
          accent: Color(0xFFDC2626),
          title: '⛔ Account Suspended',
          body:
              'Your account has been permanently suspended due to repeated contact sharing violations. You are no longer allowed to use this platform.',
        ),
      );
    }
    final beans = outcome.beansDeducted;
    final n = outcome.violationNumber;
    return showDialog(
      context: context,
      builder: (_) => _WarningDialog(
        icon: Icons.warning_amber_rounded,
        accent: const Color(0xFFF59E0B),
        title: '⚠️ Warning #$n',
        body:
            'You attempted to share contact information. This violates platform policy for hosts.',
        subBody: beans > 0
            ? '$beans beans have been deducted from your balance. Continued violations will lead to a permanent ban.'
            : 'Continued violations will lead to a permanent ban.',
      ),
    );
  }
}

class _WarningDialog extends StatelessWidget {
  const _WarningDialog({
    required this.icon,
    required this.accent,
    required this.title,
    required this.body,
    this.subBody,
  });

  final IconData icon;
  final Color accent;
  final String title;
  final String body;
  final String? subBody;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFFFFFBF2),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      title: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [accent, accent.withOpacity(0.75)],
              ),
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: accent.withOpacity(0.35),
                  blurRadius: 14,
                  offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Icon(icon, color: Colors.white, size: 30),
          ),
          const SizedBox(height: 12),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Color(0xFF0F172A),
              fontSize: 17,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            body,
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: Color(0xFF334155),
              fontSize: 13.5,
              height: 1.45,
            ),
          ),
          if (subBody != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: accent.withOpacity(0.10),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: accent.withOpacity(0.25)),
              ),
              child: Text(
                subBody!,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: accent.withOpacity(0.95),
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ],
      ),
      actionsAlignment: MainAxisAlignment.center,
      actions: [
        FilledButton(
          style: FilledButton.styleFrom(
            backgroundColor: accent,
            minimumSize: const Size(140, 42),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
          onPressed: () => Navigator.of(context).maybePop(),
          child: const Text('OK, I Understand'),
        ),
      ],
    );
  }
}
