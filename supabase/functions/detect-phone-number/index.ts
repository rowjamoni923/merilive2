import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getProviderConfig, providerScanContent } from "../_shared/externalVerify.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ====== COMPREHENSIVE PHONE NUMBER DETECTION ======

// Number word mappings for multiple languages
const numberWordMappings: Record<string, string> = {
  // English
  'zero': '0', 'one': '1', 'two': '2', 'three': '3', 'four': '4',
  'five': '5', 'six': '6', 'seven': '7', 'eight': '8', 'nine': '9',
  'ten': '10', 'eleven': '11', 'twelve': '12',
  
  // Bengali (বাংলা)
  'শূন্য': '0', 'এক': '1', 'দুই': '2', 'তিন': '3', 'চার': '4',
  'পাঁচ': '5', 'ছয়': '6', 'সাত': '7', 'আট': '8', 'নয়': '9',
  'দশ': '10', 'এগারো': '11', 'বারো': '12',
  
  // Hindi (हिंदी)
  'शून्य': '0', 'एक': '1', 'दो': '2', 'तीन': '3', 'चार': '4',
  'पाँच': '5', 'छह': '6', 'सात': '7', 'आठ': '8', 'नौ': '9',
  
  // Arabic (العربية)
  'صفر': '0', 'واحد': '1', 'اثنان': '2', 'ثلاثة': '3', 'أربعة': '4',
  'خمسة': '5', 'ستة': '6', 'سبعة': '7', 'ثمانية': '8', 'تسعة': '9',
  
  // Urdu
  'ایک': '1', 'دو': '2', 'تین': '3', 'چار': '4', 'پانچ': '5',
  'چھ': '6', 'سات': '7', 'آٹھ': '8', 'نو': '9',
  
  // Spanish
  'cero': '0', 'uno': '1', 'dos': '2', 'tres': '3', 'cuatro': '4',
  'cinco': '5', 'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9',
  
  // French
  'zéro': '0', 'un_fr': '1', 'deux': '2', 'trois': '3', 'quatre': '4',
  'cinq': '5', 'sept': '7', 'huit': '8', 'neuf': '9',
};

// Convert all numeral systems to standard digits
function normalizeNumerals(text: string): string {
  const numeralSystems: Record<string, string> = {
    // Bengali numerals
    '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4',
    '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
    // Hindi/Devanagari numerals
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9',
    // Arabic numerals (Eastern Arabic)
    '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
    '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
    // Persian/Urdu numerals
    '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
    '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
    // Thai numerals
    '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4',
    '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9',
  };
  
  let result = text;
  for (const [numeral, digit] of Object.entries(numeralSystems)) {
    result = result.replace(new RegExp(numeral, 'g'), digit);
  }
  return result;
}

// Convert number words to digits
function convertNumberWords(text: string): string {
  let result = text.toLowerCase();
  for (const [word, digit] of Object.entries(numberWordMappings)) {
    // Case insensitive replacement
    result = result.replace(new RegExp(word, 'gi'), digit);
  }
  return result;
}

// Phone number patterns for ALL countries
const phonePatterns = [
  // International format with + prefix
  /\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
  
  // Bangladesh numbers (01X-XXXXXXXX)
  /(?:\+?880|0)?1[3-9]\d{8}/g,
  /(?:\+?৮৮০|০)?১[৩-৯][০-৯]{8}/g, // Bengali numerals
  
  // India numbers (+91, 91, or starts with 6-9)
  /(?:\+?91|0)?[6-9]\d{9}/g,
  
  // Pakistan numbers
  /(?:\+?92|0)?3\d{9}/g,
  
  // US/Canada numbers
  /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/g,
  
  // UK numbers
  /(?:\+?44|0)?\s?[1-9]\d{1,4}\s?\d{6}/g,
  
  // UAE numbers
  /(?:\+?971|0)?5[0-9]\d{7}/g,
  
  // Saudi Arabia
  /(?:\+?966|0)?5\d{8}/g,
  
  // General patterns
  /\b\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g,
  /\b\d{2,5}\s\d{2,5}\s\d{2,5}\b/g,
  /\b\d{10,13}\b/g, // 10-13 consecutive digits
  
  // Numbers with spaces/separators
  /\b\d{1,4}[\s.-]\d{1,4}[\s.-]\d{1,4}[\s.-]?\d{0,4}\b/g,
];

// Common obfuscation patterns in multiple languages
const obfuscationPatterns = [
  // English
  /my\s*(?:number|phone|cell|mobile)\s*(?:is|:)?\s*[\d\s]+/gi,
  /call\s*(?:me|us)?\s*(?:at|on)?\s*:?\s*[\d\s]+/gi,
  /contact\s*(?:me|us)?\s*(?:at|on)?\s*:?\s*[\d\s]+/gi,
  /reach\s*(?:me|us)?\s*(?:at|on)?\s*:?\s*[\d\s]+/gi,
  /text\s*(?:me|us)?\s*(?:at|on)?\s*:?\s*[\d\s]+/gi,
  
  // App names (common for sharing numbers)
  /whatsapp\s*:?\s*[\d\s+]+/gi,
  /viber\s*:?\s*[\d\s+]+/gi,
  /telegram\s*:?\s*[\d\s@]+/gi,
  /imo\s*:?\s*[\d\s+]+/gi,
  /signal\s*:?\s*[\d\s+]+/gi,
  /messenger\s*:?\s*[\d\s+]+/gi,
  /wechat\s*:?\s*[\d\s+]+/gi,
  /line\s*:?\s*[\d\s+]+/gi,
  /snapchat\s*:?\s*[\d\s@]+/gi,
  
  // Bengali (বাংলা)
  /(?:আমার\s*)?নম্বর\s*(?:হলো|হচ্ছে|:)?\s*[০-৯\d\s+]+/gi,
  /ফোন\s*(?:নম্বর)?\s*(?:হলো|:)?\s*[০-৯\d\s+]+/gi,
  /মোবাইল\s*(?:নম্বর)?\s*(?:হলো|:)?\s*[০-৯\d\s+]+/gi,
  /কল\s*(?:করো|করুন|দাও|দিও)?\s*:?\s*[০-৯\d\s+]+/gi,
  /যোগাযোগ\s*(?:করো|করুন)?\s*:?\s*[০-৯\d\s+]+/gi,
  /হোয়াটসঅ্যাপ\s*(?:নম্বর)?\s*:?\s*[০-৯\d\s+]+/gi,
  /ইমো\s*(?:নম্বর)?\s*:?\s*[০-৯\d\s+]+/gi,
  /টেলিগ্রাম\s*:?\s*[০-৯\d\s@]+/gi,
  
  // Hindi (हिंदी)
  /(?:मेरा\s*)?(?:नंबर|नम्बर|फ़ोन)\s*(?:है|:)?\s*[\d\s+]+/gi,
  /कॉल\s*(?:करो|करें)?\s*:?\s*[\d\s+]+/gi,
  /संपर्क\s*(?:करो|करें)?\s*:?\s*[\d\s+]+/gi,
  /मोबाइल\s*(?:नंबर)?\s*:?\s*[\d\s+]+/gi,
  
  // Arabic (العربية)
  /(?:رقمي|رقم\s*(?:الهاتف|الجوال))\s*(?:هو|:)?\s*[\d\s+]+/gi,
  /اتصل\s*(?:بي|علي)?\s*:?\s*[\d\s+]+/gi,
  /واتساب\s*:?\s*[\d\s+]+/gi,
  
  // Urdu
  /(?:میرا\s*)?نمبر\s*(?:ہے|:)?\s*[\d\s+]+/gi,
  /فون\s*(?:نمبر)?\s*:?\s*[\d\s+]+/gi,
  
  // Number patterns with common separators
  /(\d)\s*[-_.]\s*(\d)/g,
  /(\d)\s+(\d)/g, // Numbers separated by spaces
];

// Spoken number word sequences (7+ words = likely phone number)
const spokenNumberPatterns = [
  // English
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine)(?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine)){6,}\b/gi,
  
  // Bengali
  /\b(?:শূন্য|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়)(?:\s+(?:শূন্য|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়)){6,}\b/gi,
  
  // Hindi
  /\b(?:शून्य|एक|दो|तीन|चार|पाँच|छह|सात|आठ|नौ)(?:\s+(?:शून्य|एक|दो|तीन|चार|पाँच|छह|सात|आठ|नौ)){6,}\b/gi,
];

function detectPhoneNumber(text: string): { detected: boolean; matches: string[]; confidence: string } {
  const matches: string[] = [];
  
  // Step 1: Normalize all numerals to standard digits
  let processedText = normalizeNumerals(text);
  
  // Step 2: Convert number words to digits
  processedText = convertNumberWords(processedText);
  
  // Step 3: Check main phone patterns on processed text
  for (const pattern of phonePatterns) {
    const found = processedText.match(pattern);
    if (found) {
      for (const match of found) {
        const digitsOnly = match.replace(/\D/g, '');
        // Valid phone numbers have 7-15 digits
        if (digitsOnly.length >= 7 && digitsOnly.length <= 15) {
          matches.push(match);
        }
      }
    }
  }
  
  // Step 4: Check obfuscation patterns on ORIGINAL text (to catch language-specific patterns)
  for (const pattern of obfuscationPatterns) {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found);
    }
  }
  
  // Step 5: Check spoken number patterns
  for (const pattern of spokenNumberPatterns) {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found);
    }
  }
  
  // Step 6: Also check processed text for obfuscation (after numeral conversion)
  for (const pattern of obfuscationPatterns) {
    const found = processedText.match(pattern);
    if (found) {
      matches.push(...found);
    }
  }
  
  // Remove duplicates
  const uniqueMatches = [...new Set(matches)];
  
  // Determine confidence
  let confidence = 'low';
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
    confidence
  };
}

// Auto deduction amount for phone number violation
const AUTO_DEDUCTION_BEANS = 2000;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData?.user?.id) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { message, userId, messageId, conversationId, groupId } = await req.json();

    if (!message || !userId) {
      return jsonResponse({ error: 'Message and userId are required' }, 400);
    }

    if (authData.user.id !== userId) {
      return jsonResponse({ error: 'Forbidden userId' }, 403);
    }

    // Check if detection is enabled.
    // NOTE: `setting_value` is a TEXT column but historically the admin panel
    // has written both raw `true` and JSON-quoted `"true"` here. Accept BOTH
    // forms — otherwise an accidental JSON encode silently disables the entire
    // phone-number moderation pipeline (which was the case in production).
    const { data: settings } = await supabase
      .from('app_settings')
      .select('setting_value')
      .eq('setting_key', 'phone_detection_enabled')
      .maybeSingle();

    const enabled = String(settings?.setting_value ?? '')
      .trim()
      .replace(/^"|"$/g, '')
      .toLowerCase();
    if (enabled !== 'true' && enabled !== '1') {
      return new Response(
        JSON.stringify({ detected: false, reason: 'Detection disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check user profile (for ALL users, not just hosts)
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id, is_host, display_name, app_uid, beans_balance, phone_violation_count')
      .eq('id', userId)
      .single();

    if (!userProfile) {
      console.log(`[PhoneDetection] User ${userId} not found`);
      return new Response(
        JSON.stringify({ detected: false, reason: 'User not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Detect phone numbers with comprehensive patterns (for ALL users)
    const result = detectPhoneNumber(message);

    // ── Supplemental external scan (phone-specific provider key) ───────────
    // Catches obfuscations / language variants the local regexes might miss.
    let providerHit: { phones: string[]; socials: string[]; keywords: string[]; urls: string[] } | null = null;
    try {
      const cfg = getProviderConfig("VERIFY_PHONE_API_KEY");
      if (cfg) {
        const r = await providerScanContent(cfg, {
          external_user_id: userId,
          mode: "text",
          text: message,
        });
        if (r && r.flagged) {
          providerHit = {
            phones: r.phones || [],
            socials: r.socials || [],
            keywords: r.keywords || [],
            urls: r.urls || [],
          };
          const extra = [...providerHit.phones, ...providerHit.socials, ...providerHit.keywords, ...providerHit.urls];
          if (extra.length) {
            result.detected = true;
            result.matches = Array.from(new Set([...result.matches, ...extra]));
            if (providerHit.phones.length) result.confidence = "high";
          }
        }
      }
    } catch (e) {
      console.warn("[detect-phone-number] provider scan failed:", e instanceof Error ? e.message : e);
    }

    if (result.detected) {
      const isHost = userProfile.is_host === true;
      console.log(`[PhoneDetection] Phone number detected from ${isHost ? 'HOST' : 'USER'} ${userId} (${userProfile.display_name}):`, result.matches);
      console.log(`[PhoneDetection] Confidence: ${result.confidence}`);

      let newBalance = userProfile.beans_balance || 0;
      let newViolationCount = userProfile.phone_violation_count || 0;
      const sourceType = conversationId ? 'conversation' : groupId ? 'group' : messageId ? 'message' : 'chat';
      const sourceId = conversationId || groupId || messageId || null;
      const { data: violationResult, error: violationError } = await supabase.rpc('process_contact_violation', {
        p_host_id: userId,
        p_detected_content: result.matches.join(', '),
        p_detected_pattern: 'phone_number',
        p_source_type: sourceType,
        p_source_id: sourceId,
      });

      if (violationError) {
        console.error('[PhoneDetection] process_contact_violation failed:', violationError);
      } else {
        newViolationCount = Number((violationResult as any)?.violation_number || newViolationCount + 1);
        const { data: refreshedProfile } = await supabase
          .from('profiles')
          .select('beans_balance, phone_violation_count')
          .eq('id', userId)
          .maybeSingle();
        newBalance = refreshedProfile?.beans_balance ?? newBalance;
        newViolationCount = refreshedProfile?.phone_violation_count ?? newViolationCount;
      }

      // *** AUTO DEDUCT BEANS ONLY FROM VERIFIED HOSTS (handled by RPC) ***
      const beansDeducted = Number((violationResult as any)?.beans_deducted || 0);
      if (isHost && beansDeducted > 0) {
        console.log(`[PhoneDetection] Auto-deducted ${beansDeducted} beans from host ${userProfile.display_name}. New balance: ${newBalance}`);

        // Log admin action for the deduction
        await supabase.from('admin_logs').insert({
          action_type: 'beans_deducted',
          target_type: 'user',
          target_id: userId,
          details: {
            amount: beansDeducted,
            reason: `Phone number sharing (auto deduction): ${result.matches.join(', ')}`,
            previous_balance: userProfile.beans_balance || 0,
            new_balance: newBalance,
            user_name: userProfile.display_name,
            user_uid: userProfile.app_uid,
            confidence: result.confidence,
            original_message: message.substring(0, 200),
            auto_action: true
          }
        });
      }

      // Send alert to admin via broadcast (for ALL users)
      const channel = supabase.channel('admin-alerts');
      await channel.send({
        type: 'broadcast',
        event: 'phone_detection',
        payload: {
          userId,
          detectedContent: result.matches.join(', '),
          contextType: 'chat',
          callerName: userProfile.display_name,
          userUid: userProfile.app_uid,
          timestamp: new Date().toISOString(),
          isHost: isHost,
          autoDeducted: isHost,
          deductedAmount: isHost ? AUTO_DEDUCTION_BEANS : 0,
          previousBalance: userProfile.beans_balance || 0,
          newBalance: newBalance,
          confidence: result.confidence,
          originalMessage: message.substring(0, 100),
          violationResult: {
            violation_count: newViolationCount,
            action_taken: beansDeducted > 0 ? 'auto_deduction' : 'warning',
            beans_deducted: beansDeducted,
            is_host: isHost
          }
        }
      });

      return new Response(
        JSON.stringify({
          detected: true,
          matches: result.matches,
          confidence: result.confidence,
          violationCount: newViolationCount,
          isBanned: false,
          isHost: isHost,
          autoDeducted: beansDeducted > 0,
          deductedAmount: beansDeducted,
          newBalance: newBalance
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ detected: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('Error in detect-phone-number:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
