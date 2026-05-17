// admin-rerun-face-verify
// Admin-only: re-runs AWS Rekognition (DetectFaces + CompareFaces) for an
// existing face_verification_submissions row and updates admin_notes +
// confidence_score. Status stays as-is — admin still decides Approve/Reject
// from the panel. Used when the original auto-face-verify failed mid-flight
// or when admin wants a fresh AWS opinion.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-token, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===== AWS SigV4 helpers (mirrors auto-face-verify) =====
function getAmzDate(): { amzDate: string; dateStamp: string } {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return { amzDate, dateStamp: amzDate.slice(0, 8) };
}
async function hmacSHA256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(message)));
}
async function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  const kDate = await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  return await hmacSHA256(kService, "aws4_request");
}
function toHex(b: Uint8Array): string { return Array.from(b).map(x => x.toString(16).padStart(2, "0")).join(""); }
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192; let bin = "";
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  return btoa(bin);
}
async function sha256Hash(msg: string): Promise<string> {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg))));
}

async function rekognitionCall(
  target: "DetectFaces" | "CompareFaces",
  body: Record<string, unknown>,
  accessKey: string,
  secretKey: string,
  region: string,
) {
  const service = "rekognition";
  const host = `rekognition.${region}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const { amzDate, dateStamp } = getAmzDate();
  const requestBody = JSON.stringify(body);
  const payloadHash = await sha256Hash(requestBody);
  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:RekognitionService.${target}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, await sha256Hash(canonicalRequest)].join("\n");
  const signingKey = await getSignatureKey(secretKey, dateStamp, region, service);
  const signature = toHex(await hmacSHA256(signingKey, stringToSign));
  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Date": amzDate,
      "X-Amz-Target": `RekognitionService.${target}`,
      Authorization: authHeader,
      Host: host,
    },
    body: requestBody,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Rekognition ${target} ${res.status}: ${t}`);
  }
  return await res.json();
}

function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

async function fetchImageBytes(url: string, supabaseAdmin: ReturnType<typeof createClient>): Promise<Uint8Array> {
  const parsed = parseStorageUrl(url);
  if (parsed) {
    const { data, error } = await supabaseAdmin.storage.from(parsed.bucket).download(parsed.path);
    if (error || !data) throw new Error(`storage download failed: ${error?.message || "no data"}`);
    return new Uint8Array(await data.arrayBuffer());
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

const MIN_FACE_MATCH_PERCENTAGE = 76;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") || "ap-south-1";
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) throw new Error("AWS credentials not configured");

    // ===== Admin auth (x-admin-token validated via RPC) =====
    const adminToken = req.headers.get("x-admin-token");
    if (!adminToken) {
      return new Response(JSON.stringify({ error: "Missing x-admin-token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: validData, error: validErr } = await supabaseAdmin.rpc("validate_admin_token", { _token: adminToken });
    if (validErr || !validData || (validData as any)?.valid !== true) {
      return new Response(JSON.stringify({ error: "Invalid admin token" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { submissionId } = await req.json().catch(() => ({}));
    if (!submissionId) {
      return new Response(JSON.stringify({ error: "submissionId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: submission, error: subErr } = await supabaseAdmin
      .from("face_verification_submissions")
      .select("id, user_id, profile_photo_url, face_image_url, selfie_url, front_url, left_url, right_url, video_url, host_photos, verification_type, admin_notes")
      .eq("id", submissionId)
      .maybeSingle();

    if (subErr || !submission) {
      return new Response(JSON.stringify({ error: "Submission not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick the best still image first. face_image_url is usually a video, while
    // front/selfie are the captured still frames used by the auto analyzer.
    const liveFaceUrl: string | null =
      submission.front_url || submission.selfie_url
        ? (submission.front_url || submission.selfie_url)
        : Array.isArray(submission.host_photos) && submission.host_photos.length > 0
          ? submission.host_photos[0]
          : null;

    const referenceUrl: string | null = submission.profile_photo_url || null;
    if (!referenceUrl) {
      // Fall back to profile avatar
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("avatar_url")
        .eq("id", submission.user_id)
        .maybeSingle();
      if (prof?.avatar_url) {
        // mutate locally
        (submission as any).profile_photo_url = prof.avatar_url;
      }
    }
    const finalReferenceUrl: string | null = referenceUrl || (submission as any).profile_photo_url || null;

    if (!liveFaceUrl) {
      const note = `[Re-run @ ${new Date().toISOString()}] ❌ Cannot re-run AWS — no face_image_url or host_photos in submission.`;
      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          admin_notes: `${note}${submission.admin_notes ? "\n---\n" + submission.admin_notes : ""}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
      return new Response(JSON.stringify({ ok: false, error: "No live face image to analyze" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const liveBytes = await fetchImageBytes(liveFaceUrl, supabaseAdmin);

    // DetectFaces
    const detect = await rekognitionCall(
      "DetectFaces",
      { Image: { Bytes: uint8ToBase64(liveBytes) }, Attributes: ["ALL"] },
      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
    );
    const faceDetails = detect.FaceDetails || [];
    const face = faceDetails[0] || null;

    let detectSummary = `Faces=${faceDetails.length}`;
    if (face) {
      detectSummary += `, Conf=${(face.Confidence || 0).toFixed(1)}%, Gender=${face.Gender?.Value} (${(face.Gender?.Confidence || 0).toFixed(1)}%), Age=${face.AgeRange?.Low}-${face.AgeRange?.High}`;
    }

    // CompareFaces (only if reference exists)
    let matchPct = 0;
    let compareSummary = "no reference image";
    if (finalReferenceUrl) {
      try {
        const refBytes = await fetchImageBytes(finalReferenceUrl, supabaseAdmin);
        const cmp = await rekognitionCall(
          "CompareFaces",
          {
            SourceImage: { Bytes: uint8ToBase64(liveBytes) },
            TargetImage: { Bytes: uint8ToBase64(refBytes) },
            SimilarityThreshold: 0,
          },
          AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
        );
        matchPct = Math.max(...(cmp?.FaceMatches || []).map((m: any) => Number(m?.Similarity || 0)), 0);
        compareSummary = `Face Match: ${matchPct.toFixed(1)}% (min ${MIN_FACE_MATCH_PERCENTAGE}%)`;
      } catch (e) {
        compareSummary = `CompareFaces failed: ${(e as Error).message}`;
      }
    }

    const newNote = `[Re-run @ ${new Date().toISOString()}] ${compareSummary}. ${detectSummary}.`;
    await supabaseAdmin
      .from("face_verification_submissions")
      .update({
        admin_notes: `${newNote}${submission.admin_notes ? "\n---\n" + submission.admin_notes : ""}`,
        confidence_score: matchPct,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    return new Response(JSON.stringify({
      ok: true,
      faceMatchPercentage: matchPct,
      requiredPercentage: MIN_FACE_MATCH_PERCENTAGE,
      facesDetected: faceDetails.length,
      gender: face?.Gender?.Value || null,
      genderConfidence: face?.Gender?.Confidence || 0,
      note: newNote,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[admin-rerun-face-verify] error:", err);
    return new Response(JSON.stringify({ error: (err as Error)?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
