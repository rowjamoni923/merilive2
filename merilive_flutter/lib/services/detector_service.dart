import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

enum UserRole { user, host, agency }

class DetectorService {
  // Regex for Bangladesh phone numbers and international variations
  // Handles deceptive spacing like 0 1 7, 0.1.7, etc.
  static final RegExp _phoneRegex = RegExp(
    r'(?:\+?88)?0[1-9][0-9\s\.\-]{8,13}',
    caseSensitive: false,
  );

  // Keywords for off-platform diversion (expanded for 100% perfection)
  static final List<String> _restrictedKeywords = [
    'whatsapp', 'imo', 'viber', 'telegram', 'messenger',
    'facebook', 'insta', 'tiktok', 'likee', 'snapchat',
    'call me', 'mobile', 'phone', 'contact', 'imo number',
    'wp', 'fb', 'msg', 'whatsapp number', 'whatsapp message',
    'add me', 'follow me', 'my id', 'contact me',
  ];

  /// Detects if the string contains potentially restricted content
  static bool hasInfraction(String text) {
    if (text.isEmpty) return false;
    
    // Normalize text for regex check (remove all common separators)
    String normalizedText = text.replaceAll(RegExp(r'[\s\.\-]'), '').toLowerCase();
    
    // De-verbalize numbers (e.g. 'zero' -> '0') to prevent word-based bypass
    final Map<String, String> wordReplacements = {
      'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
      'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
      'o': '0', // Common shortcut for zero
    };
    
    String textWithDigits = normalizedText;
    wordReplacements.forEach((word, digit) {
      textWithDigits = textWithDigits.replaceAll(word, digit);
    });

    // Check for phone numbers in both normalized and de-verbalized text
    if (_phoneRegex.hasMatch(normalizedText) || _phoneRegex.hasMatch(textWithDigits)) return true;

    // Check for keywords
    final lowerText = text.toLowerCase();
    for (var keyword in _restrictedKeywords) {
      if (lowerText.contains(keyword)) return true;
    }

    return false;
  }

  /// Masks infractions with stars (****)
  static String maskContent(String text) {
    String masked = text;
    
    // Mask phone numbers
    masked = masked.replaceAllMapped(_phoneRegex, (match) => ' **** ');

    // Mask keywords
    final lowerText = masked.toLowerCase();
    for (var keyword in _restrictedKeywords) {
      if (lowerText.contains(keyword)) {
        // Use regex for case-insensitive keyword replacement
        final kwRegex = RegExp(keyword, caseSensitive: false);
        masked = masked.replaceAll(kwRegex, '****');
      }
    }

    return masked;
  }

  /// Visibility Logic based on Audio feedback:
  /// Agencies can share with Users/Agencies.
  /// Users can share with Users.
  /// Hosts can NEVER share.
  /// No one can share directly with Hosts (except for Stars).
  static bool shouldMask({
    required UserRole senderRole,
    required UserRole recipientRole,
    required String content,
  }) {
    if (!hasInfraction(content)) return false;

    // 1. Hosts can never share anything (Always Masked for recipient)
    if (senderRole == UserRole.host) return true;

    // 2. No one can share unmasked with a Host
    if (recipientRole == UserRole.host) return true;

    // 3. User to User sharing is allowed
    if (senderRole == UserRole.user && recipientRole == UserRole.user) return false;

    // 4. Agency can share with User/Agency
    if (senderRole == UserRole.agency && (recipientRole == UserRole.user || recipientRole == UserRole.agency)) {
      return false;
    }

    // Default to masking for safety (User to Agency, etc.)
    return true;
  }
}


