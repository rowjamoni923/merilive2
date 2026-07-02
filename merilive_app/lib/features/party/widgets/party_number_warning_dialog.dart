import 'package:flutter/material.dart';

/// G18 — NumberSharingWarningDialog.
///
/// Detects likely phone-number / social-handle sharing in chat and warns
/// the user before sending. Web-truth: `NumberSharingWarningDialog.tsx`.
class PartyNumberWarningDialog {
  static final _phoneRegex = RegExp(r'(?:\+?\d[\d\s\-]{5,}\d)');
  static final _handleRegex = RegExp(
    r'\b(whats?app|wechat|telegram|imo|viber|snapchat|instagram|tiktok|line|signal|discord)\b',
    caseSensitive: false,
  );

  /// Returns true when message is safe to send.
  static bool isFlagged(String text) {
    if (text.isEmpty) return false;
    return _phoneRegex.hasMatch(text) || _handleRegex.hasMatch(text);
  }

  static Future<bool> confirm(BuildContext context) async {
    final res = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1F1B36),
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        title: Row(children: const [
          Icon(Icons.warning_amber_rounded, color: Color(0xFFF59E0B)),
          SizedBox(width: 8),
          Text('Careful sharing',
              style: TextStyle(
                  color: Colors.white, fontWeight: FontWeight.w700)),
        ]),
        content: const Text(
          'Sharing phone numbers or off-platform handles violates community '
          'guidelines and can lead to account suspension. Are you sure you '
          'want to send this?',
          style: TextStyle(color: Colors.white70, fontSize: 13),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel',
                style: TextStyle(color: Colors.white54)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFFEF4444)),
            child: const Text('Send anyway',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
    return res == true;
  }
}
