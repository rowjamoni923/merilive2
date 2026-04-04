// Phone number detection patterns for various formats
// Supports: Bangla, English, Hindi, Arabic, Urdu, Chinese, and more

const phonePatterns = [
  // International formats
  /\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
  // Bangladesh numbers
  /(?:\+?880|0)?1[3-9]\d{8}/g,
  // US/Canada numbers
  /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  // UK numbers
  /(?:\+?44|0)?\s?[1-9]\d{1,4}\s?\d{6}/g,
  // India numbers
  /(?:\+?91|0)?[6-9]\d{9}/g,
  // Pakistan numbers
  /(?:\+?92|0)?3[0-9]{2}[-.\s]?\d{7}/g,
  // Saudi/UAE/Middle East numbers
  /(?:\+?966|0)?5[0-9]\d{7}/g,
  /(?:\+?971|0)?5[0-9]\d{7}/g,
  // China numbers
  /(?:\+?86)?1[3-9]\d{9}/g,
  // General pattern for 7+ digit sequences
  /\b\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g,
  // Numbers with spaces
  /\b\d{2,5}\s\d{2,5}\s\d{2,5}\b/g,
  // Bangla numerals
  /[০-৯]{7,}/g,
  // Hindi/Devanagari numerals
  /[०-९]{7,}/g,
  // Arabic numerals (Eastern Arabic)
  /[٠-٩]{7,}/g,
  // Urdu/Persian numerals
  /[۰-۹]{7,}/g,
  // Chinese numerals (common digit characters)
  /[〇一二三四五六七八九零壹贰叁肆伍陆柒捌玖]{7,}/g,
];

// Number words mapping - multi-language
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

// Common obfuscation patterns - multi-language
const obfuscationPatterns = [
  // English
  /my\s*(?:number|phone|cell|mobile)\s*(?:is|:)?\s*[\d\s]+/gi,
  /call\s*(?:me|us)?\s*(?:at|on)?\s*:?\s*[\d\s]+/gi,
  /whatsapp\s*:?\s*[\d\s+]+/gi,
  /viber\s*:?\s*[\d\s+]+/gi,
  /telegram\s*:?\s*[\d\s@]+/gi,
  /imo\s*:?\s*[\d\s+]+/gi,
  /contact\s*:?\s*[\d\s+]+/gi,
  // Bangla
  /নম্বর\s*:?\s*[০-৯\d\s+]+/gi,
  /ফোন\s*:?\s*[০-৯\d\s+]+/gi,
  /মোবাইল\s*:?\s*[০-৯\d\s+]+/gi,
  /হোয়াটসঅ্যাপ\s*:?\s*[০-৯\d\s+]+/gi,
  /কল\s*করো?\s*:?\s*[০-৯\d\s+]+/gi,
  /ইমো\s*:?\s*[০-৯\d\s+]+/gi,
  // Hindi
  /नंबर\s*:?\s*[०-९\d\s+]+/gi,
  /फोन\s*:?\s*[०-९\d\s+]+/gi,
  /मोबाइल\s*:?\s*[०-९\d\s+]+/gi,
  /व्हाट्सएप\s*:?\s*[०-९\d\s+]+/gi,
  /कॉल\s*करो?\s*:?\s*[०-९\d\s+]+/gi,
  // Arabic
  /رقم\s*:?\s*[٠-٩\d\s+]+/gi,
  /هاتف\s*:?\s*[٠-٩\d\s+]+/gi,
  /واتساب\s*:?\s*[٠-٩\d\s+]+/gi,
  /اتصل\s*:?\s*[٠-٩\d\s+]+/gi,
  // Urdu
  /نمبر\s*:?\s*[۰-۹\d\s+]+/gi,
  /فون\s*:?\s*[۰-۹\d\s+]+/gi,
  /موبائل\s*:?\s*[۰-۹\d\s+]+/gi,
  /وٹس ایپ\s*:?\s*[۰-۹\d\s+]+/gi,
];

// Convert number words to digits
function convertNumberWords(text: string): string {
  let result = text.toLowerCase();
  for (const [word, digit] of Object.entries(numberWords)) {
    result = result.replace(new RegExp(word, 'gi'), digit);
  }
  return result;
}

// Convert non-Latin numerals to English digits
function convertToEnglishDigits(text: string): string {
  let result = text;
  // Bangla ০-৯
  const banglaDigits = '০১২৩৪৫৬৭৮৯';
  // Hindi/Devanagari ०-९
  const hindiDigits = '०१२३४५६७८९';
  // Arabic ٠-٩
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
  // Urdu/Persian ۰-۹
  const urduDigits = '۰۱۲۳۴۵۶۷۸۹';

  [banglaDigits, hindiDigits, arabicDigits, urduDigits].forEach(digitSet => {
    for (let i = 0; i < 10; i++) {
      result = result.replace(new RegExp(digitSet[i], 'g'), i.toString());
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

export interface PhoneDetectionResult {
  detected: boolean;
  matches: string[];
  confidence: 'high' | 'medium' | 'low';
}

export function detectPhoneNumber(text: string): PhoneDetectionResult {
  const matches: string[] = [];
  
  // Preprocess text - convert all numeral systems to English digits
  let processedText = convertToEnglishDigits(text);
  processedText = convertNumberWords(processedText);
  
  // Check main patterns
  for (const pattern of phonePatterns) {
    const found = processedText.match(pattern);
    if (found) {
      for (const match of found) {
        // Only count as phone number if it has 7+ digits
        const digitsOnly = match.replace(/\D/g, '');
        if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
          matches.push(match);
        }
      }
    }
  }
  
  // Check obfuscation patterns on original text
  for (const pattern of obfuscationPatterns) {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found);
    }
  }
  
  // Remove duplicates
  const uniqueMatches = [...new Set(matches)];
  
  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (uniqueMatches.length > 0) {
    const hasStandardFormat = uniqueMatches.some(m => {
      const digits = m.replace(/\D/g, '');
      return digits.length >= 10 && digits.length <= 13;
    });
    
    confidence = hasStandardFormat ? 'high' : 'medium';
  }
  
  return {
    detected: uniqueMatches.length > 0,
    matches: uniqueMatches,
    confidence,
  };
}

// Speech-to-text phone number detection (for voice analysis)
export function detectPhoneInSpeech(transcript: string): PhoneDetectionResult {
  // Additional patterns for spoken numbers in multiple languages
  const spokenPatterns = [
    /zero|one|two|three|four|five|six|seven|eight|nine/gi,
    /শূন্য|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়/gi,
    /शून्य|एक|दो|तीन|चार|पांच|छह|सात|आठ|नौ/gi,
    /صفر|واحد|اثنان|ثلاثة|أربعة|خمسة|ستة|سبعة|ثمانية|تسعة/gi,
    /cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve/gi,
  ];
  
  let numberWordCount = 0;
  for (const pattern of spokenPatterns) {
    const m = transcript.match(pattern);
    if (m) {
      numberWordCount += m.length;
    }
  }
  
  // If 7+ number words in sequence, likely a phone number
  if (numberWordCount >= 7) {
    return {
      detected: true,
      matches: [transcript],
      confidence: 'medium',
    };
  }
  
  // Otherwise use standard detection
  return detectPhoneNumber(transcript);
}
