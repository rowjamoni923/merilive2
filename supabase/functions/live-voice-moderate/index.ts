// F7 — Voice moderation for live streams & private calls.
// Receives a short audio chunk (webm/opus, ~20s), transcribes via ElevenLabs
// Scribe v2, then runs the F6 Unicode-hardened phone/contact detector on the
// transcript. Confirmed hits call process_contact_violation (same RPC the
// text path uses) so penalties stay synchronized across text + voice.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── F6-mirror Unicode hardening ────────────────────────────────────────────
const ZERO_WIDTH_RE = /[\u200B-\u200D\u2060\uFEFF\u180E]/g;
const VARIATION_SELECTORS_RE = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/gu;
const COMBINING_MARKS_RE = /[\u0300-\u036F\u20D0-\u20FF]/g;
const TAG_CHARS_RE = /[\u{E0020}-\u{E007F}]/gu;
const CONTROL_RE = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

function normalizeForDetection(text: string): string {
  if (!text) return "";
  let s = text;
  try { s = s.normalize("NFKC"); } catch { /* ignore */ }
  return s
    .replace(ZERO_WIDTH_RE, "")
    .replace(VARIATION_SELECTORS_RE, "")
    .replace(TAG_CHARS_RE, "")
    .replace(COMBINING_MARKS_RE, "")
    .replace(CONTROL_RE, "");
}

const numeralMap: Record<string, string> = {
  "০":"0","১":"1","২":"2","৩":"3","৪":"4","৫":"5","৬":"6","৭":"7","৮":"8","৯":"9",
  "०":"0","१":"1","२":"2","३":"3","४":"4","५":"5","६":"6","७":"7","८":"8","९":"9",
  "٠":"0","١":"1","٢":"2","٣":"3","٤":"4","٥":"5","٦":"6","٧":"7","٨":"8","٩":"9",
  "۰":"0","۱":"1","۲":"2","۳":"3","۴":"4","۵":"5","۶":"6","۷":"7","۸":"8","۹":"9",
};
function normalizeNumerals(text: string): string {
  let r = text;
  for (const [k, v] of Object.entries(numeralMap)) {
    r = r.replaceAll(k, v);
  }
  return r;
}

const numberWords: Record<string, string> = {
  zero:"0", one:"1", two:"2", three:"3", four:"4", five:"5", six:"6", seven:"7", eight:"8", nine:"9",
  "শূন্য":"0","এক":"1","দুই":"2","তিন":"3","চার":"4","পাঁচ":"5","ছয়":"6","সাত":"7","আট":"8","নয়":"9",
  "शून्य":"0","एक":"1","दो":"2","तीन":"3","चार":"4","पाँच":"5","छह":"6","सात":"7","आठ":"8","नौ":"9",
};
function convertNumberWords(text: string): string {
  let r = text.toLowerCase();
  for (const [w, d] of Object.entries(numberWords)) {
    r = r.replace(new RegExp(w, "gi"), d);
  }
  return r;
}

const phonePatterns = [
  /\+?\d{1,4}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g,
  /(?:\+?880|0)?1[3-9]\d{8}/g,
  /(?:\+?91|0)?[6-9]\d{9}/g,
  /\b\d{10,13}\b/g,
];
const socialPatterns = [
  /whatsapp\s*:?\s*[\d\s+]+/gi,
  /imo\s*:?\s*[\d\s+]+/gi,
  /telegram\s*:?\s*[\d\s@a-z_]+/gi,
  /viber\s*:?\s*[\d\s+]+/gi,
  /signal\s*:?\s*[\d\s+]+/gi,
  /messenger\s*:?\s*[\d\s+]+/gi,
];
const spokenSeqPatterns = [
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine)(?:\s+(?:zero|one|two|three|four|five|six|seven|eight|nine)){6,}\b/gi,
  /\b(?:শূন্য|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়)(?:\s+(?:শূন্য|এক|দুই|তিন|চার|পাঁচ|ছয়|সাত|আট|নয়)){6,}\b/gi,
];

function detectContactInTranscript(transcript: string): {
  detected: boolean;
  matches: string[];
  confidence: "low" | "medium" | "high";
} {
  if (!transcript || transcript.trim().length < 3) {
    return { detected: false, matches: [], confidence: "low" };
  }
  const normalized = normalizeForDetection(transcript);
  let processed = normalizeNumerals(normalized);
  processed = convertNumberWords(processed);

  const matches: string[] = [];
  for (const p of phonePatterns) {
    const found = processed.match(p);
    if (found) {
      for (const m of found) {
        const digits = m.replace(/\D/g, "");
        if (digits.length >= 7 && digits.length <= 15) matches.push(m.trim());
      }
    }
  }
  for (const p of socialPatterns) {
    const found = normalized.match(p);
    if (found) matches.push(...found.map((m) => m.trim()));
  }
  for (const p of spokenSeqPatterns) {
    const found = normalized.match(p);
    if (found) matches.push(...found.map((m) => m.trim()));
  }
  const unique = Array.from(new Set(matches));
  let confidence: "low" | "medium" | "high" = "low";
  if (unique.length > 0) {
    const standard = unique.some((m) => {
      const d = m.replace(/\D/g, "");
      return d.length >= 10 && d.length <= 13;
    });
    confidence = standard ? "high" : "medium";
  }
  return { detected: unique.length > 0, matches: unique, confidence };
}

async function transcribeWithElevenLabs(
  apiKey: string,
  audioBlob: Blob,
  languageHint?: string,
): Promise<string> {
  const form = new FormData();
  form.append("file", audioBlob, "chunk.webm");
  form.append("model_id", "scribe_v2");
  form.append("tag_audio_events", "false");
  form.append("diarize", "false");
  if (languageHint) form.append("language_code", languageHint);
  const r = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: form,
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => "");
    throw new Error(`scribe_${r.status}:${errText.slice(0, 200)}`);
  }
  const json = await r.json().catch(() => ({} as any));
  return String((json as any)?.text ?? "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: authData, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !authData?.user?.id) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    const callerId = authData.user.id;

    const elevenKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!elevenKey) {
      // Soft-fail so the client can retry once the secret is added.
      return jsonResponse({
        detected: false,
        skipped: true,
        reason: "elevenlabs_not_configured",
      });
    }

    const form = await req.formData();
    const audio = form.get("audio");
    const context = String(form.get("context") || "live"); // 'live' | 'call'
    const sourceId = (form.get("source_id") as string) || null;
    const languageHint = (form.get("language") as string) || undefined;
    const targetUserIdRaw = form.get("user_id") as string | null;
    const targetUserId = targetUserIdRaw || callerId;

    if (!(audio instanceof Blob)) {
      return jsonResponse({ error: "audio_required" }, 400);
    }
    if (targetUserId !== callerId) {
      // Voice moderation is always self-attributed; client can't blame another user.
      return jsonResponse({ error: "forbidden_user" }, 403);
    }
    if (audio.size < 2_000) {
      return jsonResponse({ detected: false, reason: "too_small" });
    }
    if (audio.size > 12_000_000) {
      return jsonResponse({ error: "audio_too_large" }, 413);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Owner-locked role gate: agencies/top-up helpers/users may share payment
    // contact numbers. Only real verified hosts are moderated in voice paths.
    const { data: userProfile } = await supabase
      .from("profiles")
      .select("id, is_host, is_agency_owner, display_name, beans_balance, phone_violation_count")
      .eq("id", callerId)
      .maybeSingle();

    if (!userProfile) {
      return jsonResponse({ detected: false, reason: "profile_missing" });
    }

    const { data: helperProfile } = await supabase
      .from("topup_helpers")
      .select("id")
      .eq("user_id", callerId)
      .eq("is_active", true)
      .eq("is_verified", true)
      .maybeSingle();

    const isRestrictedHost = userProfile.is_host === true && userProfile.is_agency_owner !== true && !helperProfile;
    if (!isRestrictedHost) {
      return jsonResponse({
      });
    }

    // Honor the same admin kill-switch as text detection.
    const { data: settings } = await supabase
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "phone_detection_enabled")
      .maybeSingle();
    const enabled = String(settings?.setting_value ?? "")
      .trim()
      .replace(/^"|"$/g, "")
      .toLowerCase();
    if (enabled !== "true" && enabled !== "1") {
      return jsonResponse({ detected: false, reason: "disabled" });
    }

    let transcript = "";
    try {
      transcript = await transcribeWithElevenLabs(elevenKey, audio, languageHint);
    } catch (err) {
      console.error("[live-voice-moderate] transcription failed:", err);
      return jsonResponse({
      });
    }

    const result = detectContactInTranscript(transcript);
    if (!result.detected) {
      return jsonResponse({
        transcript_length: transcript.length,
      });
    }

    const { data: violationResult, error: violationError } = await supabase.rpc(
      "process_contact_violation",
      {
        p_host_id: callerId,
        p_detected_content: result.matches.join(", "),
        p_detected_pattern: `voice_${context}`,
        p_source_type: context === "call" ? "private_call" : "live_stream",
        p_source_id: sourceId,
      },
    );

    if (violationError) {
      console.error("[live-voice-moderate] process_contact_violation failed:", violationError);
    } else {
      try {
        await supabase.from("admin_logs").insert({
          action_type: "voice_contact_violation",
          target_type: "user",
          target_id: callerId,
          details: {
            context,
            matches: result.matches,
            confidence: result.confidence,
            transcript_sample: transcript.slice(0, 200),
            beans_deducted: Number((violationResult as any)?.beans_deducted || 0),
          },
        });
      } catch (e) {
        console.warn("[live-voice-moderate] admin_logs insert failed:", e);
      }
    }

    return jsonResponse({
      context,
      is_host: userProfile.is_host === true,
      violation_number: Number((violationResult as any)?.violation_number || 0),
    });
  } catch (err) {
    console.error("[live-voice-moderate] fatal:", err);
    return jsonResponse({ error: "internal_error", message: String(err) }, 500);
  }
});
