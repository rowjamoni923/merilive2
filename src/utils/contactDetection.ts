/**
 * Contact Information Detection Utility
 * Detects phone numbers, social media handles, and contact info in text
 * Supports: English, Bangla, Hindi, Arabic, Urdu, Chinese, Spanish, and more
 * Used to prevent hosts from sharing external contact info
 */

import { supabase } from '@/integrations/supabase/client';

// ─── F6: Unicode hardening ─────────────────────────────────────────────
// Industry research (Chamet / Bigo / Holla / Telegram anti-spam): the most
// common bypass tricks for contact-info filters are:
//   1. Fullwidth digits    "０１７１２..."     (U+FF10-FF19)
//   2. Mathematical bold   "𝟎𝟏𝟕𝟏𝟐..."        (U+1D7CE…)
//   3. Keycap emoji        "0️⃣1️⃣7️⃣..."   (digit + VS16 + U+20E3)
//   4. Zero-width joiners  "0​1​7​1​2..."    (U+200B/200C/200D/FEFF/2060)
//   5. Combining marks     "0̲1̲7̲1̲2̲..."    (U+0300-036F overlay)
//   6. Tag characters      "0󠀁1󠀁7..."        (U+E0020-E007F)
// NFKC normalization handles (1)+(2). We strip the rest explicitly so the
// downstream digit-script converter and phone regexes see a clean string.
const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF\u180E]/g;
const VARIATION_SELECTORS_RE = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu;
const COMBINING_MARKS_RE = /[\u0300-\u036F\u20D0-\u20FF]/g; // includes U+20E3 keycap
const TAG_CHARS_RE = /[\u{E0020}-\u{E007F}]/gu;
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

function normalizeForDetection(text: string): string {
  if (!text) return '';
  let s = text;
  try { s = s.normalize('NFKC'); } catch { /* old runtimes */ }
  s = s
    .replace(ZERO_WIDTH_RE, '')
    .replace(VARIATION_SELECTORS_RE, '')
    .replace(TAG_CHARS_RE, '')
    .replace(COMBINING_MARKS_RE, '')
    .replace(CONTROL_RE, '');
  return s;
}

// ─── Multi-script numeral conversion ───────────────────────────────────
function convertToEnglishDigits(text: string): string {
  let result = text;
  const digitSets = [
    '০১২৩৪৫৬৭৮৯', // Bangla
    '०१२३४५६७८९', // Hindi/Devanagari
    '٠١٢٣٤٥٦٧٨٩', // Arabic
    '۰۱۲۳۴۵۶۷۸۹', // Urdu/Persian
  ];
  digitSets.forEach(ds => {
    for (let i = 0; i < 10; i++) {
      result = result.replace(new RegExp(ds[i], 'g'), i.toString());
    }
  });
  // Chinese digit characters
  const chineseMap: Record<string, string> = {
    '〇': '0', '零': '0', '一': '1', '壹': '1', '二': '2', '贰': '2',
    '三': '3', '叁': '3', '四': '4', '肆': '4', '五': '5', '伍': '5',
    '六': '6', '陆': '6', '七': '7', '柒': '7', '八': '8', '捌': '8',
    '九': '9', '玖': '9',
  };
  for (const [char, digit] of Object.entries(chineseMap)) {
    result = result.replace(new RegExp(char, 'g'), digit);
  }
  return result;
}

// Number words → digits (multi-language)
const numberWords: Record<string, string> = {
  // English
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  // Bangla
  'শূন্য': '0', 'এক': '1', 'দুই': '2', 'তিন': '3', 'চার': '4',
  'পাঁচ': '5', 'ছয়': '6', 'সাত': '7', 'আট': '8', 'নয়': '9',
  // Hindi
  'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4',
  'पांच': '5', 'छह': '6', 'सात': '7', 'आठ': '8', 'नौ': '9',
  // Arabic
  'صفر': '0', 'واحد': '1', 'اثنان': '2', 'ثلاثة': '3', 'أربعة': '4',
  'خمسة': '5', 'ستة': '6', 'سبعة': '7', 'ثمانية': '8', 'تسعة': '9',
  // Urdu
  'ایک': '1', 'دو': '2', 'تین': '3', 'چار': '4',
  'پانچ': '5', 'چھ': '6', 'سات': '7', 'آٹھ': '8', 'نو': '9',
  // Spanish
  'cero': '0', 'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4',
  'cinco': '5', 'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9',
};

function convertNumberWords(text: string): string {
  let result = text;
  for (const [word, digit] of Object.entries(numberWords)) {
    result = result.replace(new RegExp(word, 'gi'), digit);
  }
  return result;
}

// ─── Phone number patterns ─────────────────────────────────────────────
const PHONE_PATTERNS = [
  // Bangladesh phone numbers (01XXXXXXXXX, +8801XXXXXXXXX)
  /(?:\+?880|0)1[3-9]\d{8}/g,
  // International phone numbers with country code
  /\+\d{1,3}[\s-]?\d{6,14}/g,
  // US/Canada
  /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  // UK
  /(?:\+?44|0)?\s?[1-9]\d{1,4}\s?\d{6}/g,
  // India
  /(?:\+?91|0)?[6-9]\d{9}/g,
  // Pakistan
  /(?:\+?92|0)?3[0-9]{2}[-.\s]?\d{7}/g,
  // Saudi/UAE
  /(?:\+?966|0)?5[0-9]\d{7}/g,
  /(?:\+?971|0)?5[0-9]\d{7}/g,
  // China
  /(?:\+?86)?1[3-9]\d{9}/g,
  // Generic phone numbers (7-15 digits with optional separators)
  /\d{3}[\s.-]?\d{3,4}[\s.-]?\d{4,6}/g,
  // Numbers with spaces (e.g. "017 890 64577")
  /\b\d{2,5}\s\d{2,5}\s\d{2,5}\b/g,
  // Phone with text keywords (multi-language)
  /(?:call|phone|mobile|cell|contact|number|নম্বর|ফোন|মোবাইল|কল|नंबर|फोन|مोبائل|رقم|هاتف)\s*[:\-]?\s*\+?\d{6,15}/gi,
  // General 7+ digit sequence
  /\b\d{7,15}\b/g,
];

// ─── Social media patterns (with handles/numbers/links) ─────────────
const SOCIAL_MEDIA_PATTERNS: { platform: string; patterns: RegExp[] }[] = [
  {
    platform: 'whatsapp',
    patterns: [
      /whatsapp[\s:@#]*\+?\d{6,15}/gi,
      /wa\.me\/\d+/gi,
      /\bwa\b[\s:]*\+?\d{6,15}/gi,
      /whats\s*app[\s:]*\+?\d{6,15}/gi,
      /হোয়াটসঅ্যাপ[\s:]*[+\d৬-৯০-৫]{6,}/gi,
      /व्हाट्सएप[\s:]*[+\d]{6,}/gi,
      /واتساب[\s:]*[+\d]{6,}/gi,
      /وٹس\s*ایپ[\s:]*[+\d]{6,}/gi,
    ]
  },
  {
    platform: 'imo',
    patterns: [
      /imo[\s:@#]*\+?\d{6,15}/gi,
      /\bimo\b.*\d{6,15}/gi,
      /ইমো[\s:]*[+\d৬-৯০-৫]{6,}/gi,
    ]
  },
  {
    platform: 'facebook',
    patterns: [
      /facebook\.com\/[a-zA-Z0-9._]+/gi,
      /fb\.com\/[a-zA-Z0-9._]+/gi,
      /fb[\s:@#]+[a-zA-Z0-9._]+/gi,
      /facebook[\s:@#]+[a-zA-Z0-9._]+/gi,
      /ফেসবুক[\s:]+[a-zA-Z0-9._]+/gi,
      /m\.me\/[a-zA-Z0-9._]+/gi,
      /फेसबुक[\s:]+[a-zA-Z0-9._]+/gi,
      /فیسبک[\s:]+[a-zA-Z0-9._]+/gi,
    ]
  },
  {
    platform: 'messenger',
    patterns: [
      /messenger[\s:@#]+[a-zA-Z0-9._]+/gi,
      /m\.me\/[a-zA-Z0-9._]+/gi,
      /মেসেঞ্জার[\s:]+[a-zA-Z0-9._]+/gi,
    ]
  },
  {
    platform: 'instagram',
    patterns: [
      /instagram\.com\/[a-zA-Z0-9._]+/gi,
      /ig[\s:@#]+[a-zA-Z0-9._]+/gi,
      /insta[\s:@#]+[a-zA-Z0-9._]+/gi,
      /instagram[\s:@#]+[a-zA-Z0-9._]+/gi,
      /@[a-zA-Z0-9._]+.*instagram/gi,
      /ইনস্টাগ্রাম[\s:]+[a-zA-Z0-9._]+/gi,
      /इंस्टाग्राम[\s:]+[a-zA-Z0-9._]+/gi,
    ]
  },
  {
    platform: 'tiktok',
    patterns: [
      /tiktok\.com\/@?[a-zA-Z0-9._]+/gi,
      /tiktok[\s:@#]+[a-zA-Z0-9._]+/gi,
      /টিকটক[\s:]+[a-zA-Z0-9._]+/gi,
    ]
  },
  {
    platform: 'telegram',
    patterns: [
      /t\.me\/[a-zA-Z0-9._]+/gi,
      /telegram[\s:@#]+[a-zA-Z0-9._]+/gi,
      /টেলিগ্রাম[\s:]+[a-zA-Z0-9._]+/gi,
      /تلیگرام[\s:]+[a-zA-Z0-9._]+/gi,
    ]
  },
  {
    platform: 'snapchat',
    patterns: [
      /snapchat[\s:@#]+[a-zA-Z0-9._]+/gi,
      /snap[\s:@#]+[a-zA-Z0-9._]+/gi,
      /স্ন্যাপচ্যাট[\s:]+[a-zA-Z0-9._]+/gi,
    ]
  },
  {
    platform: 'twitter',
    patterns: [
      /twitter\.com\/[a-zA-Z0-9._]+/gi,
      /x\.com\/[a-zA-Z0-9._]+/gi,
      /twitter[\s:@#]+[a-zA-Z0-9._]+/gi,
      /টুইটার[\s:]+[a-zA-Z0-9._]+/gi,
    ]
  },
  {
    platform: 'viber',
    patterns: [
      /viber[\s:@#]*\+?\d{6,15}/gi,
      /ভাইবার[\s:]*[+\d৬-৯০-৫]{6,}/gi,
    ]
  },
  {
    platform: 'signal',
    patterns: [
      /signal[\s:@#]*\+?\d{6,15}/gi,
    ]
  },
  {
    platform: 'wechat',
    patterns: [
      /wechat[\s:@#]+[a-zA-Z0-9._]+/gi,
      /weixin[\s:@#]+[a-zA-Z0-9._]+/gi,
      /微信[\s:]*[a-zA-Z0-9._]+/gi,
    ]
  },
  {
    platform: 'line',
    patterns: [
      /\bline[\s:@#]+[a-zA-Z0-9._]+/gi,
      /line\.me\/[a-zA-Z0-9._]+/gi,
    ]
  },
  {
    platform: 'email',
    patterns: [
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi,
      /email[\s:]+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/gi,
      /ইমেইল[\s:]+[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/gi,
    ]
  },
];

// ─── URL / Link detection ──────────────────────────────────────────────
const URL_PATTERNS = [
  /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
  /(?:www\.)?(?:facebook|fb|instagram|tiktok|twitter|x|t|wa|telegram|snapchat|linkedin|youtube|youtu)\.(?:com|me|be|co|tv)\/[^\s]*/gi,
  /wa\.me\/[^\s]+/gi,
  /m\.me\/[^\s]+/gi,
  /t\.me\/[^\s]+/gi,
];

// ─── Social media name-only keywords (just mentioning = violation) ────
const SOCIAL_MEDIA_NAME_ONLY: { keyword: string; platform: string }[] = [
  // English
  { keyword: 'whatsapp', platform: 'whatsapp' },
  { keyword: 'whats app', platform: 'whatsapp' },
  { keyword: 'imo', platform: 'imo' },
  { keyword: 'facebook', platform: 'facebook' },
  { keyword: 'messenger', platform: 'messenger' },
  { keyword: 'instagram', platform: 'instagram' },
  { keyword: 'insta', platform: 'instagram' },
  { keyword: 'tiktok', platform: 'tiktok' },
  { keyword: 'tik tok', platform: 'tiktok' },
  { keyword: 'telegram', platform: 'telegram' },
  { keyword: 'snapchat', platform: 'snapchat' },
  { keyword: 'twitter', platform: 'twitter' },
  { keyword: 'viber', platform: 'viber' },
  { keyword: 'signal app', platform: 'signal' },
  { keyword: 'wechat', platform: 'wechat' },
  { keyword: 'weixin', platform: 'wechat' },
  { keyword: 'line app', platform: 'line' },
  { keyword: 'linkedin', platform: 'linkedin' },
  { keyword: 'skype', platform: 'skype' },
  { keyword: 'discord', platform: 'discord' },
  { keyword: 'kik', platform: 'kik' },
  { keyword: 'zalo', platform: 'zalo' },
  { keyword: 'kakaotalk', platform: 'kakaotalk' },
  // Bangla
  { keyword: 'হোয়াটসঅ্যাপ', platform: 'whatsapp' },
  { keyword: 'ইমো', platform: 'imo' },
  { keyword: 'ফেসবুক', platform: 'facebook' },
  { keyword: 'মেসেঞ্জার', platform: 'messenger' },
  { keyword: 'ইনস্টাগ্রাম', platform: 'instagram' },
  { keyword: 'টিকটক', platform: 'tiktok' },
  { keyword: 'টেলিগ্রাম', platform: 'telegram' },
  { keyword: 'স্ন্যাপচ্যাট', platform: 'snapchat' },
  { keyword: 'টুইটার', platform: 'twitter' },
  { keyword: 'ভাইবার', platform: 'viber' },
  { keyword: 'ডিসকর্ড', platform: 'discord' },
  { keyword: 'ইউটিউব', platform: 'youtube' },
  { keyword: 'স্কাইপ', platform: 'skype' },
  // Hindi
  { keyword: 'व्हाट्सएप', platform: 'whatsapp' },
  { keyword: 'फेसबुक', platform: 'facebook' },
  { keyword: 'इंस्टाग्राम', platform: 'instagram' },
  { keyword: 'टेलीग्राम', platform: 'telegram' },
  { keyword: 'टिकटॉक', platform: 'tiktok' },
  // Arabic
  { keyword: 'واتساب', platform: 'whatsapp' },
  { keyword: 'واتس اب', platform: 'whatsapp' },
  { keyword: 'فيسبوك', platform: 'facebook' },
  { keyword: 'انستغرام', platform: 'instagram' },
  { keyword: 'تيليجرام', platform: 'telegram' },
  { keyword: 'تيك توك', platform: 'tiktok' },
  { keyword: 'سناب شات', platform: 'snapchat' },
  // Urdu
  { keyword: 'وٹس ایپ', platform: 'whatsapp' },
  { keyword: 'فیسبک', platform: 'facebook' },
  { keyword: 'انسٹاگرام', platform: 'instagram' },
  { keyword: 'تلیگرام', platform: 'telegram' },
  { keyword: 'ٹک ٹاک', platform: 'tiktok' },
  // Chinese
  { keyword: '微信', platform: 'wechat' },
];

// Keywords that suggest contact sharing intent
const CONTACT_KEYWORDS = [
  'call me', 'contact me', 'message me', 'dm me', 'inbox me',
  'add me', 'follow me', 'join me', 'text me', 'reach me',
  'my number', 'my whatsapp', 'my facebook', 'my imo', 'my insta',
  'আমাকে কল', 'আমার নম্বর', 'ইনবক্স করো', 'মেসেজ করো',
  'ফলো করো', 'অ্যাড করো', 'আমার হোয়াটসঅ্যাপ', 'আমার ফেসবুক',
  'मुझे कॉल', 'मेरा नंबर', 'मुझे मैसेज',
  'اتصل بي', 'رقمي',
];

export interface DetectionResult {
  hasViolation: boolean;
  detectedContent: string;
  pattern: string;
  allMatches: string[];
}

export interface ContactPolicyProfile {
  is_host?: boolean | null;
  is_agency_owner?: boolean | null;
  is_topup_helper?: boolean | null;
}

export function isContactRestrictedHost(profile: ContactPolicyProfile | null | undefined): boolean {
  return profile?.is_host === true && profile?.is_agency_owner !== true && profile?.is_topup_helper !== true;
}

/**
 * Detects phone numbers, social media handles, links, and platform names in text
 */
/**
 * Mask detected contact info in text with asterisks
 * Replaces digits, social media names, emails, URLs with ***
 */
/**
 * Industry-standard partial reveal (Chamet / Bigo / Holla pattern):
 *   - Phone-like digit runs (4+ digits): keep first 5 visible, rest → ***
 *   - Short digit runs (≤5): leave as-is (cannot be a phone)
 *   - Social platform names, URLs, emails: fully masked with ***
 * Works across all numeral scripts (after NFKC + zero-width strip).
 */
export function maskContactContent(text: string, detection: DetectionResult): string {
  if (!detection.hasViolation) return text;

  // F6: normalize first so fullwidth / math-bold / keycap / zero-width
  // bypasses are flattened before we mask. Peers never see the trick form.
  let masked = normalizeForDetection(text);

  // Partial-reveal digit runs (multi-script). Keep up to first 5 digits, mask rest.
  masked = masked.replace(/[0-9০-৯०-९٠-٩۰-۹]{4,}/g, (run) => {
    if (run.length <= 5) return run;
    return run.slice(0, 5) + '***';
  });

  // Mask social media platform names (case insensitive) — full mask
  for (const { keyword } of SOCIAL_MEDIA_NAME_ONLY) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    masked = masked.replace(new RegExp(escaped, 'gi'), '***');
  }

  // Mask URLs — full mask
  for (const pattern of URL_PATTERNS) {
    const freshPattern = new RegExp(pattern.source, pattern.flags);
    masked = masked.replace(freshPattern, '***');
  }

  // Mask emails — full mask
  masked = masked.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi, '***');

  // Mask number words (one/two/তিন/etc) — full mask
  for (const word of Object.keys(numberWords)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    masked = masked.replace(new RegExp(escaped, 'gi'), '***');
  }

  return masked;
}

export function detectContactInfo(text: string): DetectionResult {
  if (!text || typeof text !== 'string') {
    return { hasViolation: false, detectedContent: '', pattern: '', allMatches: [] };
  }

  // ★ Step 0 (F6 Unicode hardening): NFKC + strip zero-width / variation
  // selectors / combining marks / tag chars so bypasses like "𝟎𝟏𝟕" /
  // "０１７" / "0️⃣1️⃣7️⃣" / "0​1​7" cannot slip past the regex layer.
  const normalized = normalizeForDetection(text);
  const allMatches: string[] = [];

  // ★ Step 1: Convert all numeral scripts + number words to English digits
  let processedText = convertToEnglishDigits(normalized);
  processedText = convertNumberWords(processedText);

  // ★ Step 2: Check for phone numbers on CONVERTED text
  for (const pattern of PHONE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = processedText.match(pattern);
    if (matches) {
      for (const match of matches) {
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
          allMatches.push(match);
        }
      }
    }
  }

  if (allMatches.length > 0) {
    return {
      hasViolation: true,
      detectedContent: allMatches[0],
      pattern: 'phone_number',
      allMatches: [...new Set(allMatches)],
    };
  }

  // ★ Step 3: Check for URLs/links (social media links) — use normalized text
  for (const pattern of URL_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = normalized.match(pattern);
    if (matches && matches.length > 0) {
      return {
      };
    }
  }

  // ★ Step 4: Check for social media handles with numbers (normalized)
  for (const { platform, patterns } of SOCIAL_MEDIA_PATTERNS) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      const matches = normalized.match(pattern);
      if (matches && matches.length > 0) {
        return {
        };
      }
    }
  }

  // ★ Step 5: Check for social media platform NAMES ALONE (any language) — normalized
  const lowerText = normalized.toLowerCase();
  for (const { keyword, platform } of SOCIAL_MEDIA_NAME_ONLY) {
    if (lowerText.includes(keyword.toLowerCase()) || normalized.includes(keyword)) {
      return {
      };
    }
  }

  // ★ Step 6: Check for contact sharing intent keywords
  for (const keyword of CONTACT_KEYWORDS) {
    if (lowerText.includes(keyword.toLowerCase())) {
      const hasNumber = /\d{5,}/.test(processedText);
      const hasHandle = /@[a-zA-Z0-9._]+/.test(normalized);
      if (hasNumber || hasHandle) {
        return {
        };
      }
    }
  }

  // ★ Step 7: Check for sequences of 5+ digits (potential partial phone numbers)
  // Only flag if there are 5+ consecutive digits after numeral conversion
  const consecutiveDigits = processedText.match(/\d{5,}/g);
  if (consecutiveDigits && consecutiveDigits.length > 0) {
    return {
    };
  }

  return { hasViolation: false, detectedContent: '', pattern: '', allMatches: [] };
}

/**
 * Process a contact violation for a host
 * Applies progressive penalties (beans deduction → ban)
 */
export async function processHostViolation(
  hostId: string,
  detectedContent: string,
  detectedPattern: string,
  sourceType: 'chat' | 'live_stream' | 'private_call' | 'private_message',
  sourceId?: string
): Promise<{
  success: boolean;
  violationNumber?: number;
  beansDeducted?: number;
  isBanned?: boolean;
  error?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('process_contact_violation', {
      p_host_id: hostId,
      p_detected_content: detectedContent,
      p_detected_pattern: detectedPattern,
      p_source_type: sourceType,
      p_source_id: sourceId || null,
    });

    if (error) {
      console.error('Error processing violation:', error);
      return { success: false, error: error.message };
    }

    const result = data as {
      violation_number: number;
      beans_deducted: number;
      is_banned: boolean;
    };

    console.log(`⚠️ Host violation processed: #${result.violation_number}, ${result.beans_deducted} beans deducted, banned: ${result.is_banned}`);

    return {
    };
  } catch (err) {
    console.error('Exception processing violation:', err);
    return { success: false, error: 'Failed to process violation' };
  }
}

/**
 * Check if user is a real restricted host.
 * Agency owners/helpers are support/payment roles and may share numbers.
 */
export async function checkIsHost(userId: string): Promise<boolean> {
  try {
    const [{ data, error }, { data: helper }] = await Promise.all([
      supabase
      .from('profiles')
        .select('is_host, is_agency_owner')
      .eq('id', userId)
        .single(),
      supabase
        .from('topup_helpers')
        .select('id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .eq('is_verified', true)
        .maybeSingle(),
    ]);

    if (error) {
      console.error('[ContactDetection] checkIsHost error:', error.message);
      return false;
    }
    if (!data) return false;
    const restricted = isContactRestrictedHost(data) && !helper;
    console.log('[ContactDetection] checkIsHost:', userId, '→', restricted);
    return restricted;
  } catch (err) {
    console.error('[ContactDetection] checkIsHost exception:', err);
    return false;
  }
}

/**
 * Full detection and processing pipeline.
 *
 * Rule (owner-locked):
 *   Mask + violation pipeline fires ONLY when the SENDER is a verified host.
 *   user↔user, user↔agency, agency↔agency, user→host, agency→host all flow
 *   freely with no mask, no warning, no admin alert. Only verified hosts are
 *   prohibited from sharing phone numbers / social handles.
 *
 *   The `recipientIncludesHost` parameter is kept for call-site compatibility
 *   but is no longer used as a gate — only sender role matters.
 */
export async function detectAndProcessViolation(
  senderId: string,
  messageContent: string,
  sourceType: 'chat' | 'live_stream' | 'private_call' | 'private_message',
  sourceId?: string,
  _recipientIncludesHost: boolean = false
): Promise<{ detected: boolean; warningOnly?: boolean; violationNumber?: number; beansDeducted?: number; isBanned?: boolean }> {
  console.log('[ContactDetection] Checking message from:', senderId);

  // Detect contact info FIRST (cheap regex pass)
  const detection = detectContactInfo(messageContent);
  if (!detection.hasViolation) {
    return { detected: false };
  }

  // Resolve sender role — only real verified hosts are subject to the rule.
  // Agency owners and verified top-up helpers are official support/payment roles.
  let senderIsHost = false;
  try {
    const [{ data }, { data: helper }] = await Promise.all([
      supabase
        .from('profiles')
        .select('is_host, is_agency_owner')
        .eq('id', senderId)
        .single(),
      supabase
        .from('topup_helpers')
        .select('id')
        .eq('user_id', senderId)
        .eq('is_active', true)
        .eq('is_verified', true)
        .maybeSingle(),
    ]);
    senderIsHost = isContactRestrictedHost(data) && !helper;
  } catch {}

  if (!senderIsHost) {
    console.log('[ContactDetection] Sender is not a verified host — freely allowed');
    return { detected: false };
  }

  // Host sender: server RPC handles 2,000-bean deduction, logs, ban escalation
  const result = await processHostViolation(
    senderId,
    detection.detectedContent,
    detection.pattern,
    sourceType,
    sourceId
  );

  return {
    detected: true,
    warningOnly: false,
    violationNumber: result.violationNumber || 1,
    beansDeducted: result.beansDeducted || 0,
    isBanned: result.isBanned || false,
  };
}
