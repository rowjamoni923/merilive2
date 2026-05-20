import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// ─── Multi-script numeral conversion ───────────────────────────────────
function convertMultiScriptDigits(text: string): string {
  let result = text;
  const digitSets = [
    '০১২৩৪৫৬৭৮৯',
    '०१२३४५६७८९',
    '٠١٢٣٤٥٦٧٨٩',
    '۰۱۲۳۴۵۶۷۸۹',
  ];
  digitSets.forEach(ds => {
    for (let i = 0; i < 10; i++) {
      result = result.replace(new RegExp(ds[i], 'g'), i.toString());
    }
  });
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
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'শূন্য': '0', 'এক': '1', 'দুই': '2', 'তিন': '3', 'চার': '4',
  'পাঁচ': '5', 'ছয়': '6', 'সাত': '7', 'আট': '8', 'নয়': '9',
  'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4',
  'पांच': '5', 'छह': '6', 'सात': '7', 'आठ': '8', 'नौ': '9',
  'صفر': '0', 'واحد': '1', 'اثنان': '2', 'ثلاثة': '3', 'أربعة': '4',
  'خمسة': '5', 'ستة': '6', 'سبعة': '7', 'ثمانية': '8', 'تسعة': '9',
  'ایک': '1', 'دو': '2', 'تین': '3', 'چار': '4',
  'پانچ': '5', 'چھ': '6', 'سات': '7', 'آٹھ': '8', 'نو': '9',
  'cero': '0', 'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4',
  'cinco': '5', 'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9',
};

// Full social media keywords list
const SOCIAL_MEDIA_KEYWORDS = [
  'whatsapp', 'whats app', 'imo', 'facebook', 'messenger', 'instagram',
  'insta', 'tiktok', 'tik tok', 'telegram', 'snapchat', 'twitter',
  'viber', 'signal app', 'wechat', 'weixin', 'line app', 'linkedin',
  'skype', 'discord', 'kik', 'zalo', 'kakaotalk',
  'হোয়াটসঅ্যাপ', 'ইমো', 'ফেসবুক', 'মেসেঞ্জার', 'ইনস্টাগ্রাম',
  'টিকটক', 'টেলিগ্রাম', 'স্ন্যাপচ্যাট', 'টুইটার', 'ভাইবার',
  'ডিসকর্ড', 'ইউটিউব', 'স্কাইপ',
  'व्हाट्सएप', 'फेसबुक', 'इंस्टाग्राम', 'टेलीग्राम', 'टिकटॉक',
  'واتساب', 'واتس اب', 'فيسبوك', 'انستغرام', 'تيليجرام', 'تيك توك', 'سناب شات',
  'وٹس ایپ', 'فیسبک', 'انسٹاگرام', 'تلیگرام', 'ٹک ٹاک',
  '微信',
];

const PHONE_PATTERNS = [
  /(?:\+?880|0)1[3-9]\d{8}/g,
  /\+\d{1,3}[\s-]?\d{6,14}/g,
  /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  /(?:\+?91|0)?[6-9]\d{9}/g,
  /(?:\+?92|0)?3[0-9]{2}[-.\s]?\d{7}/g,
  /\d{3}[\s.-]?\d{3,4}[\s.-]?\d{4,6}/g,
  /\b\d{7,15}\b/g,
];

const URL_PATTERNS = [
  /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi,
  /(?:www\.)?(?:facebook|fb|instagram|tiktok|twitter|x|t|wa|telegram)\.(?:com|me|be|co)\/[^\s]*/gi,
  /wa\.me\/[^\s]+/gi,
  /t\.me\/[^\s]+/gi,
];

function detectContactInText(text: string): { hasViolation: boolean; detectedContent: string; pattern: string } {
  if (!text || text.length < 1) return { hasViolation: false, detectedContent: '', pattern: '' };

  const processed = convertMultiScriptDigits(text);
  const lower = text.toLowerCase();

  // Step 1: Check phone numbers
  for (const pattern of PHONE_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = processed.match(pattern);
    if (matches) {
      for (const match of matches) {
        const digits = match.replace(/\D/g, '');
        if (digits.length >= 7 && digits.length <= 15) {
          return { hasViolation: true, detectedContent: match, pattern: 'phone_number' };
        }
      }
    }
  }

  // Step 2: Check URLs
  for (const pattern of URL_PATTERNS) {
    pattern.lastIndex = 0;
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      return { hasViolation: true, detectedContent: matches[0], pattern: 'external_link' };
    }
  }

  // Step 3: Check social media keywords
  for (const keyword of SOCIAL_MEDIA_KEYWORDS) {
    if (lower.includes(keyword.toLowerCase()) || text.includes(keyword)) {
      return { hasViolation: true, detectedContent: keyword, pattern: keyword };
    }
  }

  // Step 4: Check email
  const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  if (emailMatch) {
    return { hasViolation: true, detectedContent: emailMatch[0], pattern: 'email' };
  }

  // Step 5: AGGRESSIVE - Any sequence of 5+ digits in ANY script
  const consecutiveDigits = processed.match(/\d{5,}/g);
  if (consecutiveDigits) {
    return {
      hasViolation: true,
      detectedContent: consecutiveDigits[0],
      pattern: 'digit_sharing',
    };
  }

  // Step 6: Number words in any language
  for (const word of Object.keys(numberWords)) {
    if (lower.includes(word.toLowerCase()) || text.includes(word)) {
      return { hasViolation: true, detectedContent: word, pattern: 'digit_sharing' };
    }
  }

  return { hasViolation: false, detectedContent: '', pattern: '' };
}

// ─── Google Cloud Vision OCR ───────────────────────────────────────────
async function extractTextWithVisionAPI(imageUrl: string): Promise<string> {
  const apiKey = Deno.env.get('GOOGLE_VISION_API_KEY');
  if (!apiKey) {
    console.log('[scan-image-contact] GOOGLE_VISION_API_KEY not set, skipping Vision OCR');
    return '';
  }

  try {
    // Download image and convert to base64
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) {
      console.error('[scan-image-contact] Failed to fetch image for Vision API:', imgResponse.status);
      return '';
    }

    const imgBuffer = await imgResponse.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

    console.log(`[scan-image-contact] Sending ${Math.round(imgBuffer.byteLength / 1024)}KB image to Vision API`);

    // Call Google Cloud Vision API
    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [
                { type: 'TEXT_DETECTION', maxResults: 10 },
                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
              ],
            },
          ],
        }),
      }
    );

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      console.error('[scan-image-contact] Vision API error:', visionResponse.status, errorText);
      return '';
    }

    const visionData = await visionResponse.json();
    const annotations = visionData.responses?.[0];

    if (!annotations) {
      console.log('[scan-image-contact] No Vision API response');
      return '';
    }

    // Get full text from DOCUMENT_TEXT_DETECTION (more comprehensive)
    let fullText = annotations.fullTextAnnotation?.text || '';

    // Also get individual text annotations as backup
    if (!fullText && annotations.textAnnotations?.length > 0) {
      fullText = annotations.textAnnotations[0]?.description || '';
    }

    console.log(`[scan-image-contact] Vision API extracted ${fullText.length} chars: "${fullText.substring(0, 100)}..."`);
    return fullText;

  } catch (err) {
    console.error('[scan-image-contact] Vision API exception:', err);
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageUrl, senderId, sourceType, sourceId } = await req.json();

    if (!imageUrl || !senderId) {
      return new Response(
        JSON.stringify({ error: 'Missing imageUrl or senderId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[scan-image-contact] Scanning image for user ${senderId}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if sender is a host
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_host')
      .eq('id', senderId)
      .single();

    const isHost = profile?.is_host === true;

    // Non-hosts (user / agency / L1–L5 helper) can share images freely — no scan, no penalty.
    if (!isHost) {
      console.log(`[scan-image-contact] Sender ${senderId} is not a host — skipping scan entirely`);
      return new Response(
        JSON.stringify({ detected: false, skipped: 'non_host' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Check image filename for suspicious patterns
    const urlLower = imageUrl.toLowerCase();
    const filenameSuspicious = [
      'whatsapp', 'imo', 'facebook', 'messenger', 'telegram',
      'contact', 'number', 'phone', 'wa_', 'fb_',
    ].some(p => urlLower.includes(p));

    // ═══════════════════════════════════════════════════════════════
    // PRIMARY: Google Cloud Vision API OCR (accurate text extraction)
    // ═══════════════════════════════════════════════════════════════
    let extractedText = '';

    // Try Google Vision API first (best accuracy)
    extractedText = await extractTextWithVisionAPI(imageUrl);

    // FALLBACK: Binary text extraction if Vision API unavailable
    if (!extractedText) {
      console.log('[scan-image-contact] Falling back to binary text extraction');
      try {
        const headResponse = await fetch(imageUrl, { method: 'HEAD' });
        const contentType = headResponse.headers.get('content-type') || '';

        if (contentType.startsWith('image/')) {
          const imgResponse = await fetch(imageUrl);
          const imgBuffer = await imgResponse.arrayBuffer();
          const imgBytes = new Uint8Array(imgBuffer);

          const textChunks: string[] = [];
          let currentChunk = '';

          for (let i = 0; i < imgBytes.length; i++) {
            const byte = imgBytes[i];
            if ((byte >= 32 && byte <= 126) || (byte >= 0xC0 && byte <= 0xFF)) {
              currentChunk += String.fromCharCode(byte);
            } else {
              if (currentChunk.length >= 4) {
                textChunks.push(currentChunk);
              }
              currentChunk = '';
            }
          }
          if (currentChunk.length >= 4) {
            textChunks.push(currentChunk);
          }

          extractedText = textChunks.join(' ');

          try {
            const decoder = new TextDecoder('utf-8', { fatal: false });
            const decodedText = decoder.decode(imgBytes);
            const readableSegments = decodedText.match(/[\u0980-\u09FF\u0900-\u097F\u0600-\u06FF\u4E00-\u9FFF\w\s@.+\-()]{5,}/g);
            if (readableSegments) {
              extractedText += ' ' + readableSegments.join(' ');
            }
          } catch (_e) {
            // Ignore decode errors
          }

          console.log(`[scan-image-contact] Fallback extracted ${extractedText.length} chars`);
        }
      } catch (fetchErr) {
        console.error('[scan-image-contact] Fallback extraction error:', fetchErr);
      }
    }

    // Detect contact info in extracted text + filename
    const combinedText = extractedText + ' ' + decodeURIComponent(imageUrl.split('/').pop() || '');
    const detection = detectContactInText(combinedText);

    if (!detection.hasViolation && filenameSuspicious) {
      console.log('[scan-image-contact] Suspicious filename detected:', imageUrl);
    }

    if (detection.hasViolation) {
      console.log(`[scan-image-contact] VIOLATION FOUND: ${detection.pattern} - "${detection.detectedContent}"`);

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const validConversationId = sourceId && uuidRegex.test(sourceId) ? sourceId : null;

      // Log to chat_moderation_logs
      await supabase.from('chat_moderation_logs').insert({
        user_id: senderId,
        conversation_id: validConversationId,
        violation_type: detection.pattern || 'contact_sharing',
        detected_content: `[IMAGE-OCR] ${detection.detectedContent}`,
        action_taken: 'detected',
        notes: `Vision OCR scan: ${detection.pattern} | Source: ${sourceType}`,
        is_auto_action: true,
      });

      // Only process penalties for hosts
      if (isHost) {
        const { data: violationResult, error: violationError } = await supabase.rpc('process_contact_violation', {
          p_host_id: senderId,
          p_detected_content: `[IMAGE-OCR] ${detection.detectedContent}`,
          p_detected_pattern: detection.pattern,
          p_source_type: sourceType,
          p_source_id: sourceId,
        });

        if (violationError) {
          console.error('[scan-image-contact] Violation processing error:', violationError);
          return new Response(
            JSON.stringify({ detected: true, error: violationError.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const result = violationResult as {
          success: boolean;
          violation_number: number;
          beans_deducted: number;
          is_banned: boolean;
        };

        return new Response(
          JSON.stringify({
            detected: true,
            violationNumber: result.violation_number,
            beansDeducted: result.beans_deducted,
            isBanned: result.is_banned,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Non-host: warning only
      return new Response(
        JSON.stringify({ detected: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ detected: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('[scan-image-contact] Error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
