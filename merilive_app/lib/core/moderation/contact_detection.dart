/// P0 #2 — Contact-sharing moderation (Dart port of `src/utils/contactDetection.ts`).
///
/// Detects phone numbers, social handles, external URLs, platform names, and
/// digit-sharing intent in text. Bypass-resistant (F6 hardening):
///   • NFKC normalize (fullwidth / mathematical-bold digits)
///   • Strip zero-width joiners / variation selectors / combining marks
///   • Convert Bangla / Hindi / Arabic / Urdu / Persian digits → English
///   • Convert number-words → digits (English + Bangla + Hindi + Arabic + Spanish)
///
/// Returns [DetectionResult] with pattern label so the server RPC
/// `process_contact_violation` can classify the offence.
///
/// Mask semantics mirror web `maskContactContent`:
///   • Digit runs ≥6: keep first 5, replace tail with `***`
///   • Social names / URLs / emails / number-words: full `***`
///
/// Skipped vs web (deferred to follow-up phase):
///   • Chinese digit characters (〇零一...) — rare in target market
///   • Full 50+ language number-word coverage
///   • Image OCR (`imageContactDetection.ts`) — needs MLKit pipeline
library;

// ─── F6 Unicode-hardening character classes ────────────────────────────

final RegExp _kZeroWidth = RegExp(r'[\u200B-\u200D\u2060\uFEFF\u180E]');
final RegExp _kVariationSelectors =
    RegExp(r'[\uFE00-\uFE0F]', unicode: true);
final RegExp _kCombining = RegExp(r'[\u0300-\u036F\u20D0-\u20FF]');
final RegExp _kControl = RegExp(r'[\u0000-\u0008\u000B-\u001F\u007F]');

String _normalize(String text) {
  if (text.isEmpty) return '';
  // Dart strings are already UTF-16; no runtime NFKC in the SDK. The web
  // path relies on NFKC to fold fullwidth + math-bold digits — we handle
  // those two families explicitly in [_convertToEnglishDigits].
  return text
      .replaceAll(_kZeroWidth, '')
      .replaceAll(_kVariationSelectors, '')
      .replaceAll(_kCombining, '')
      .replaceAll(_kControl, '');
}

// ─── Multi-script → English digit map ─────────────────────────────────

const List<String> _kDigitScripts = [
  '০১২৩৪৫৬৭৮৯', // Bangla
  '०१२३४५६७८९', // Hindi/Devanagari
  '٠١٢٣٤٥٦٧٨٩', // Arabic
  '۰۱۲۳۴۵۶۷۸۹', // Urdu/Persian
  '\uFF10\uFF11\uFF12\uFF13\uFF14\uFF15\uFF16\uFF17\uFF18\uFF19', // Fullwidth
];

String _convertToEnglishDigits(String s) {
  var out = s;
  for (final set in _kDigitScripts) {
    for (var i = 0; i < 10; i++) {
      out = out.replaceAll(set[i], '$i');
    }
  }
  // Mathematical-bold digits (U+1D7CE..U+1D7D7) live outside the BMP — map
  // by codeunit pair. Cheap loop since these are rare.
  const mathBoldStart = 0x1D7CE;
  const mathBoldEnd = 0x1D7D7;
  if (out.codeUnits.contains(0xD835)) {
    final buf = StringBuffer();
    final runes = out.runes.toList();
    for (final r in runes) {
      if (r >= mathBoldStart && r <= mathBoldEnd) {
        buf.write(r - mathBoldStart);
      } else {
        buf.writeCharCode(r);
      }
    }
    out = buf.toString();
  }
  return out;
}

const Map<String, String> _kNumberWords = {
  // English
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  // Bangla
  'শূন্য': '0', 'এক': '1', 'দুই': '2', 'তিন': '3', 'চার': '4',
  'পাঁচ': '5', 'ছয়': '6', 'সাত': '7', 'আট': '8', 'নয়': '9',
  // Hindi
  'शून्य': '0', 'दो': '2', 'तीन': '3', 'पांच': '5', 'छह': '6',
  'सात': '7', 'आठ': '8', 'नौ': '9',
  // Arabic
  'صفر': '0', 'واحد': '1', 'اثنان': '2', 'ثلاثة': '3', 'أربعة': '4',
  'خمسة': '5', 'ستة': '6', 'سبعة': '7', 'ثمانية': '8', 'تسعة': '9',
  // Spanish
  'cero': '0', 'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4',
  'cinco': '5', 'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9',
};

String _convertNumberWords(String s) {
  var out = s;
  _kNumberWords.forEach((word, digit) {
    out = out.replaceAll(RegExp(word, caseSensitive: false), digit);
  });
  return out;
}

// ─── Pattern banks ─────────────────────────────────────────────────────

final List<RegExp> _kPhonePatterns = [
  // Bangladesh (01XXXXXXXXX / +8801XXXXXXXXX)
  RegExp(r'(?:\+?880|0)1[3-9]\d{8}'),
  // International (country code + 6-14 digits)
  RegExp(r'\+\d{1,3}[\s\-]?\d{6,14}'),
  // US/Canada
  RegExp(
      r'(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}'),
  // India
  RegExp(r'(?:\+?91|0)?[6-9]\d{9}'),
  // Pakistan
  RegExp(r'(?:\+?92|0)?3[0-9]{2}[-.\s]?\d{7}'),
  // Saudi / UAE
  RegExp(r'(?:\+?966|0)?5[0-9]\d{7}'),
  RegExp(r'(?:\+?971|0)?5[0-9]\d{7}'),
  // China mobile
  RegExp(r'(?:\+?86)?1[3-9]\d{9}'),
  // Generic 7-15 digits with separators
  RegExp(r'\d{3}[\s.\-]?\d{3,4}[\s.\-]?\d{4,6}'),
  // 3-block spaced numbers (e.g. "017 890 64577")
  RegExp(r'\b\d{2,5}\s\d{2,5}\s\d{2,5}\b'),
  // Bare 7+ digit run
  RegExp(r'\b\d{7,15}\b'),
];

final List<RegExp> _kUrlPatterns = [
  RegExp(r'https?://\S+', caseSensitive: false),
  RegExp(
      r'(?:www\.)?(?:facebook|fb|instagram|tiktok|twitter|x|t|wa|telegram|snapchat|linkedin|youtube|youtu)\.(?:com|me|be|co|tv)/\S*',
      caseSensitive: false),
  RegExp(r'wa\.me/\S+', caseSensitive: false),
  RegExp(r'm\.me/\S+', caseSensitive: false),
  RegExp(r't\.me/\S+', caseSensitive: false),
];

final RegExp _kEmail =
    RegExp(r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}');

/// (keyword, platform) — mentioning the platform alone counts as violation.
const List<List<String>> _kSocialNameOnly = [
  // English
  ['whatsapp', 'whatsapp'], ['whats app', 'whatsapp'], ['imo', 'imo'],
  ['facebook', 'facebook'], ['messenger', 'messenger'],
  ['instagram', 'instagram'], ['insta', 'instagram'],
  ['tiktok', 'tiktok'], ['tik tok', 'tiktok'],
  ['telegram', 'telegram'], ['snapchat', 'snapchat'], ['twitter', 'twitter'],
  ['viber', 'viber'], ['signal app', 'signal'], ['wechat', 'wechat'],
  ['line app', 'line'], ['linkedin', 'linkedin'], ['skype', 'skype'],
  ['discord', 'discord'], ['kik', 'kik'], ['zalo', 'zalo'],
  ['kakaotalk', 'kakaotalk'],
  // Bangla
  ['হোয়াটসঅ্যাপ', 'whatsapp'], ['ইমো', 'imo'], ['ফেসবুক', 'facebook'],
  ['মেসেঞ্জার', 'messenger'], ['ইনস্টাগ্রাম', 'instagram'],
  ['টিকটক', 'tiktok'], ['টেলিগ্রাম', 'telegram'],
  ['স্ন্যাপচ্যাট', 'snapchat'], ['টুইটার', 'twitter'],
  ['ভাইবার', 'viber'], ['ডিসকর্ড', 'discord'],
  // Hindi
  ['व्हाट्सएप', 'whatsapp'], ['फेसबुक', 'facebook'],
  ['इंस्टाग्राम', 'instagram'], ['टेलीग्राम', 'telegram'],
  ['टिकटॉक', 'tiktok'],
  // Arabic
  ['واتساب', 'whatsapp'], ['فيسبوك', 'facebook'],
  ['انستغرام', 'instagram'], ['تيليجرام', 'telegram'],
  ['تيك توك', 'tiktok'], ['سناب شات', 'snapchat'],
];

const List<String> _kContactIntent = [
  'call me', 'contact me', 'message me', 'dm me', 'inbox me',
  'add me', 'follow me', 'text me', 'reach me',
  'my number', 'my whatsapp', 'my facebook', 'my imo', 'my insta',
  'আমাকে কল', 'আমার নম্বর', 'ইনবক্স করো', 'মেসেজ করো',
  'আমার হোয়াটসঅ্যাপ', 'আমার ফেসবুক',
  'मुझे कॉल', 'मेरा नंबर', 'مुझे मैसेज',
  'اتصل بي', 'رقمي',
];

// ─── Public API ────────────────────────────────────────────────────────

class DetectionResult {
  final bool hasViolation;
  final String detectedContent;
  final String pattern;
  final List<String> allMatches;

  const DetectionResult({
    required this.hasViolation,
    required this.detectedContent,
    required this.pattern,
    required this.allMatches,
  });

  static const empty = DetectionResult(
    hasViolation: false,
    detectedContent: '',
    pattern: '',
    allMatches: [],
  );
}

DetectionResult detectContactInfo(String text) {
  if (text.isEmpty) return DetectionResult.empty;

  final normalized = _normalize(text);
  var processed = _convertToEnglishDigits(normalized);
  processed = _convertNumberWords(processed);

  // 1. Phone patterns → highest priority
  final phoneMatches = <String>[];
  for (final p in _kPhonePatterns) {
    for (final m in p.allMatches(processed)) {
      final match = m.group(0)!;
      final digitsOnly = match.replaceAll(RegExp(r'\D'), '');
      if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
        phoneMatches.add(match);
      }
    }
  }
  if (phoneMatches.isNotEmpty) {
    return DetectionResult(
      hasViolation: true,
      detectedContent: phoneMatches.first,
      pattern: 'phone_number',
      allMatches: phoneMatches.toSet().toList(),
    );
  }

  // 2. URLs
  for (final p in _kUrlPatterns) {
    final matches = p.allMatches(normalized).map((m) => m.group(0)!).toList();
    if (matches.isNotEmpty) {
      return DetectionResult(
        hasViolation: true,
        detectedContent: matches.first,
        pattern: 'external_link',
        allMatches: matches,
      );
    }
  }

  // 3. Email
  final emailMatches =
      _kEmail.allMatches(normalized).map((m) => m.group(0)!).toList();
  if (emailMatches.isNotEmpty) {
    return DetectionResult(
      hasViolation: true,
      detectedContent: emailMatches.first,
      pattern: 'email',
      allMatches: emailMatches,
    );
  }

  // 4. Social platform names
  final lower = normalized.toLowerCase();
  for (final entry in _kSocialNameOnly) {
    final keyword = entry[0];
    final platform = entry[1];
    if (lower.contains(keyword.toLowerCase()) ||
        normalized.contains(keyword)) {
      return DetectionResult(
        hasViolation: true,
        detectedContent: keyword,
        pattern: platform,
        allMatches: [keyword],
      );
    }
  }

  // 5. Intent + digit/handle
  for (final k in _kContactIntent) {
    if (lower.contains(k.toLowerCase())) {
      final hasNumber = RegExp(r'\d{5,}').hasMatch(processed);
      final hasHandle = RegExp(r'@[a-zA-Z0-9._]+').hasMatch(normalized);
      if (hasNumber || hasHandle) {
        return DetectionResult(
          hasViolation: true,
          detectedContent: k,
          pattern: 'contact_intent',
          allMatches: [k],
        );
      }
    }
  }

  // 6. Bare 5+ consecutive digits (partial phone leak)
  final digitRuns = RegExp(r'\d{5,}').allMatches(processed).map((m) => m.group(0)!).toList();
  if (digitRuns.isNotEmpty) {
    return DetectionResult(
      hasViolation: true,
      detectedContent: digitRuns.first,
      pattern: 'digit_sharing',
      allMatches: digitRuns.toSet().toList(),
    );
  }

  return DetectionResult.empty;
}

/// Web-truth mask: keep first 5 digits of runs ≥6, full-mask everything else.
/// Applied to text before it's shown to peers when the sender is a host.
String maskContactContent(String text, DetectionResult detection) {
  if (!detection.hasViolation) return text;
  var masked = _normalize(text);

  // Digit runs (any script)
  final digitClass =
      RegExp('[0-9০-৯०-९٠-٩۰-۹\uFF10-\uFF19]{4,}');
  masked = masked.replaceAllMapped(digitClass, (m) {
    final run = m.group(0)!;
    if (run.length <= 5) return run;
    return '${run.substring(0, 5)}***';
  });

  // Social names
  for (final entry in _kSocialNameOnly) {
    masked = masked.replaceAll(
      RegExp(RegExp.escape(entry[0]), caseSensitive: false),
      '***',
    );
  }
  // URLs
  for (final p in _kUrlPatterns) {
    masked = masked.replaceAll(p, '***');
  }
  // Emails
  masked = masked.replaceAll(_kEmail, '***');
  // Number words
  for (final w in _kNumberWords.keys) {
    masked = masked.replaceAll(RegExp(RegExp.escape(w), caseSensitive: false), '***');
  }
  return masked;
}
