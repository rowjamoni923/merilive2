import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AWS Signature V4 helpers
function getAmzDate(): { amzDate: string; dateStamp: string } {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  return { amzDate, dateStamp };
}

async function hmacSHA256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  const kDate = await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  const kSigning = await hmacSHA256(kService, "aws4_request");
  return kSigning;
}

function toHex(buffer: Uint8Array): string {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hash(message: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return toHex(new Uint8Array(hash));
}

// Language code mapping: our app codes → AWS Translate codes
const LANGUAGE_MAP: Record<string, string> = {
  bn: "bn", en: "en", hi: "hi", ar: "ar", ur: "ur",
  id: "id", ms: "ms", th: "th", vi: "vi", tl: "tl",
  zh: "zh", "zh-CN": "zh", "zh-TW": "zh-TW",
  ja: "ja", ko: "ko", fr: "fr", de: "de", es: "es",
  pt: "pt", ru: "ru", tr: "tr", it: "it", nl: "nl",
  pl: "pl", sv: "sv", da: "da", no: "no", fi: "fi",
  el: "el", he: "he", fa: "fa", ta: "ta", te: "te",
  ml: "ml", kn: "kn", gu: "gu", mr: "mr", pa: "pa",
  ne: "ne", si: "si", my: "my", km: "km", lo: "lo",
  ka: "ka", az: "az", uk: "uk", ro: "ro", hu: "hu",
  cs: "cs", sk: "sk", bg: "bg", hr: "hr", sr: "sr",
  sl: "sl", et: "et", lv: "lv", lt: "lt", sq: "sq",
  mk: "mk", bs: "bs", mt: "mt", ga: "ga", cy: "cy",
  is: "is", af: "af", sw: "sw", am: "am", ha: "ha",
  so: "so", yo: "yo", ig: "ig", zu: "zu", rw: "rw",
  ps: "ps", uz: "uz", kk: "kk", ky: "ky", tg: "tg",
  mn: "mn", ht: "ht", ca: "ca", eu: "eu", gl: "gl",
};

// UI language labels (e.g. "Bengali", "English") → language codes
const LANGUAGE_NAME_MAP: Record<string, string> = {
  bengali: "bn",
  bangla: "bn",
  english: "en",
  hindi: "hi",
  arabic: "ar",
  urdu: "ur",
  indonesian: "id",
  malay: "ms",
  thai: "th",
  vietnamese: "vi",
  filipino: "tl",
  chinese: "zh",
  japanese: "ja",
  korean: "ko",
  french: "fr",
  german: "de",
  spanish: "es",
  portuguese: "pt",
  russian: "ru",
  turkish: "tr",
  italian: "it",
  dutch: "nl",
};

function normalizeLanguageCode(input: string | undefined, fallback = "auto"): string {
  if (!input || typeof input !== "string") return fallback;

  const raw = input.trim();
  if (!raw) return fallback;

  if (LANGUAGE_MAP[raw]) return LANGUAGE_MAP[raw];

  const lower = raw.toLowerCase();
  if (LANGUAGE_MAP[lower]) return LANGUAGE_MAP[lower];
  if (LANGUAGE_NAME_MAP[lower]) return LANGUAGE_NAME_MAP[lower];

  const firstWord = lower.replace(/[^a-z-]+/g, " ").trim().split(/\s+/)[0];
  if (firstWord && LANGUAGE_NAME_MAP[firstWord]) return LANGUAGE_NAME_MAP[firstWord];

  return raw;
}

async function callAWSTranslate(
  text: string,
  sourceLang: string,
  targetLang: string,
  accessKey: string,
  secretKey: string,
  region: string
) {
  const service = "translate";
  const host = `translate.${region}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const { amzDate, dateStamp } = getAmzDate();

  const requestBody = JSON.stringify({
    SourceLanguageCode: sourceLang,
    TargetLanguageCode: targetLang,
    Text: text,
  });

  const payloadHash = await sha256Hash(requestBody);
  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:AWSShineFrontendService_20170701.TranslateText\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";

  const canonicalRequest = [
    "POST", "/", "", canonicalHeaders, signedHeaders, payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hash(canonicalRequest),
  ].join("\n");

  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signature = toHex(await hmacSHA256(signingKey, stringToSign));

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Date": amzDate,
      "X-Amz-Target": "AWSShineFrontendService_20170701.TranslateText",
      "Authorization": authHeader,
      "Host": host,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("AWS Translate error:", response.status, errText);
    throw new Error(`AWS Translate error: ${response.status} ${errText}`);
  }

  return await response.json();
}

function stripMarkdownJson(input: string): string {
  return input
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
}

async function callGeminiTranslate(
  text: string,
  sourceLang: string,
  targetLang: string,
  lovableApiKey: string
): Promise<{ translatedText: string; sourceLanguage: string }> {
  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      temperature: 0.1,
      max_tokens: 800,
      messages: [
        {
          role: "system",
          content:
            "You are a translation engine. Return ONLY JSON: {\"translatedText\": string, \"detectedSourceLanguage\": string}. detectedSourceLanguage must be an ISO 639-1 code when possible.",
        },
        {
          content: `Source language: ${sourceLang}. Target language: ${targetLang}. Text: ${text}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini translate error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const rawContent = data?.choices?.[0]?.message?.content;
  if (!rawContent || typeof rawContent !== "string") {
    throw new Error("Gemini translate returned empty response");
  }

  const cleaned = stripMarkdownJson(rawContent);

  try {
    const parsed = JSON.parse(cleaned);
    const translatedText = typeof parsed?.translatedText === "string" ? parsed.translatedText.trim() : "";
    const detected = typeof parsed?.detectedSourceLanguage === "string"
      ? parsed.detectedSourceLanguage
      : sourceLang;

    if (!translatedText) throw new Error("Missing translatedText");

    return {
      translatedText,
      sourceLanguage: normalizeLanguageCode(detected, sourceLang),
    };
  } catch {
    return {
      translatedText: cleaned,
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check — accept either a Supabase user JWT (Authorization) or an admin session token (x-admin-token)
    const authHeader = req.headers.get("Authorization");
    const adminToken = req.headers.get("x-admin-token");

    let authorized = false;

    if (adminToken) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );
      const { data: sessionRow } = await adminClient
        .from("admin_sessions")
        .select("admin_user_id")
        .eq("session_token", adminToken)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (sessionRow) authorized = true;
    }

    if (!authorized) {
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );
      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
        });
      }
    }

    const { text, targetLanguage, sourceLanguage } = await req.json();

    if (!text || !targetLanguage) {
      return new Response(
        JSON.stringify({ error: "Text and target language are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") || "ap-south-1";
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Normalize language inputs (supports both codes and UI labels like "Bengali")
    const targetLang = normalizeLanguageCode(targetLanguage, "en");
    const sourceLang = normalizeLanguageCode(sourceLanguage, "auto");

    console.log(`[translate] ${sourceLang} → ${targetLang}: "${text.substring(0, 50)}..."`);

    let translatedText = "";
    let detectedSourceLang = sourceLang;
    let provider: "aws" | "gemini" = "aws";

    const awsReady = !!AWS_ACCESS_KEY_ID && !!AWS_SECRET_ACCESS_KEY;

    if (awsReady) {
      try {
        const result = await callAWSTranslate(
          text,
          sourceLang,
          targetLang,
          AWS_ACCESS_KEY_ID as string,
          AWS_SECRET_ACCESS_KEY as string,
          AWS_REGION
        );

        translatedText = result.TranslatedText || "";
        detectedSourceLang = normalizeLanguageCode(result.SourceLanguageCode || sourceLang, sourceLang);
      } catch (awsError) {
        console.error("[translate] AWS fallback triggered:", awsError);

        if (!LOVABLE_API_KEY) {
          throw awsError;
        }

        provider = "gemini";
        const fallbackResult = await callGeminiTranslate(text, sourceLang, targetLang, LOVABLE_API_KEY);
        translatedText = fallbackResult.translatedText;
        detectedSourceLang = fallbackResult.sourceLanguage || sourceLang;
      }
    } else {
      if (!LOVABLE_API_KEY) {
        throw new Error("No translation provider configured");
      }
      provider = "gemini";
      const fallbackResult = await callGeminiTranslate(text, sourceLang, targetLang, LOVABLE_API_KEY);
      translatedText = fallbackResult.translatedText;
      detectedSourceLang = fallbackResult.sourceLanguage || sourceLang;
    }

    console.log(`[translate] Provider=${provider} Result (${detectedSourceLang}→${targetLang}): "${translatedText.substring(0, 50)}..."`);

    return new Response(
      JSON.stringify({ translatedText, sourceLanguage: detectedSourceLang, provider }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[translate] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Translation failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
