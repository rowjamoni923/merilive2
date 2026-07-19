/**
 * AWS Rekognition based 18+ / NSFW reel moderation.
 *
 * Client extracts ~6 evenly-spaced frames from the chosen video as base64
 * JPEGs and sends them here BEFORE the video is uploaded to storage.
 * We call DetectModerationLabels per frame and reject only when a HARD
 * 18+ label crosses the confidence threshold. Suggestive / swimwear /
 * partial-nudity labels are intentionally NOT blocked — those are common
 * in normal reels and would cause false positives.
 *
 * Reuses the SigV4 signing pattern from face-verification-analyze.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ---------- AWS SigV4 helpers (same pattern as face-verification-analyze) ----------
function getAmzDate() {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  return { amzDate, dateStamp };
}
async function hmacSHA256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}
async function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  const kDate = await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  return hmacSHA256(kService, "aws4_request");
}
function toHex(buf: Uint8Array) {
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function sha256Hash(message: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return toHex(new Uint8Array(hash));
}

async function detectModerationLabels(
  imageBytesBase64: string,
  accessKey: string,
  secretKey: string,
  region: string,
): Promise<Array<{ Name: string; ParentName: string; Confidence: number }>> {
  const target = "RekognitionService.DetectModerationLabels";
  const service = "rekognition";
  const host = `rekognition.${region}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const { amzDate, dateStamp } = getAmzDate();
  const body = JSON.stringify({
    Image: { Bytes: imageBytesBase64 },
    MinConfidence: 60, // we apply our own thresholds per-label after
  });
  const payloadHash = await sha256Hash(body);
  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hash(canonicalRequest)].join("\n");
  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signature = toHex(await hmacSHA256(signingKey, stringToSign));
  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Date": amzDate,
      "X-Amz-Target": target,
      "Authorization": authHeader,
      "Host": host,
    },
    body,
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[moderate-reel-rekognition] Rekognition error:", res.status, errText);
    throw new Error(`Rekognition error ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data?.ModerationLabels) ? data.ModerationLabels : [];
}

// ---------- Decision policy: ONLY block hard 18+ ----------
// AWS Rekognition Moderation taxonomy: https://docs.aws.amazon.com/rekognition/latest/dg/moderation.html
// Hard 18+ labels — block at high confidence. Suggestive / swimwear / partial
// nudity are NOT in this list to keep false positives near-zero.
const HARD_NSFW_LABELS = new Set<string>([
  "Explicit Nudity",
  "Nudity",
  "Graphic Male Nudity",
  "Graphic Female Nudity",
  "Sexual Activity",
  "Illustrated Explicit Nudity",
  "Adult Toys",
  "Explicit Sexual Activity",
  "Sex Toys",
]);
const HARD_THRESHOLD = 80; // confidence %

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ── Pkg310 deep-audit: require authenticated caller (anti-DoS / AWS cost abuse) ──
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(JSON.stringify({ error: "authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user?.id) {
      return new Response(JSON.stringify({ error: "invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { frames } = await req.json() as { frames?: string[] };
    if (!Array.isArray(frames) || frames.length === 0) {
      return new Response(JSON.stringify({ error: "frames[] required (base64 JPEG)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (frames.length > 12) {
      return new Response(JSON.stringify({ error: "too many frames (max 12)" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") || "ap-south-1";
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      console.error("[moderate-reel-rekognition] AWS credentials missing");
      // Fail-open: do not block legitimate uploads if AWS unconfigured.
      return new Response(JSON.stringify({ isSafe: true, reason: "moderation unavailable", skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const allLabels: Array<{ frame: number; Name: string; ParentName: string; Confidence: number }> = [];
    let blocked: { Name: string; Confidence: number; frame: number } | null = null;

    for (let i = 0; i < frames.length; i++) {
      // Strip data: prefix if present
      const b64 = frames[i].replace(/^data:image\/\w+;base64,/, "");
      let labels: Array<{ Name: string; ParentName: string; Confidence: number }> = [];
      try {
        labels = await detectModerationLabels(b64, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
      } catch (e) {
        console.warn("[moderate-reel-rekognition] frame", i, "failed:", (e as Error).message);
        continue;
      }
      for (const l of labels) {
        allLabels.push({ frame: i, ...l });
        if (HARD_NSFW_LABELS.has(l.Name) && l.Confidence >= HARD_THRESHOLD) {
          blocked = { Name: l.Name, Confidence: l.Confidence, frame: i };
          break;
        }
      }
      if (blocked) break;
    }

    if (blocked) {
      console.log("[moderate-reel-rekognition] BLOCKED:", blocked);
      return new Response(JSON.stringify({
        isSafe: false,
        reason: `18+ content detected (${blocked.Name}, ${blocked.Confidence.toFixed(0)}%)`,
        blocked,
        labels: allLabels,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ isSafe: true, labels: allLabels }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[moderate-reel-rekognition] fatal:", e);
    // Fail-open on internal error so legitimate uploads aren't blocked
    return new Response(JSON.stringify({ isSafe: true, error: (e as Error).message, skipped: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
