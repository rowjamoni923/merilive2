/**
 * Post-submit Rekognition pass for Section-07 three-angle flow:
 * DetectFaces(front) + CompareFaces(front↔left, front↔right).
 * Writes ai_analysis + rekognition_confidence; optionally calls
 * service_auto_finalize_face_verification when app_settings allows.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getProviderConfig,
  providerSearchFace,
  providerIndexFace,
  providerVerifyFace,
} from "../_shared/externalVerify.ts";
// imagescript is HEAVY (large WASM init) and was eating the per-request CPU
// budget at module-load time, leaving every submission stuck on
// "under_review" with "CPU Time exceeded". Load it lazily, only when the
// Supabase storage image-transform proxy (primary path) fails and we
// genuinely have to decode locally.
type ImagescriptModule = typeof import("https://deno.land/x/imagescript@1.2.17/mod.ts");
let _imagescriptPromise: Promise<ImagescriptModule> | null = null;
function loadImagescript(): Promise<ImagescriptModule> {
  if (!_imagescriptPromise) {
    _imagescriptPromise = import("https://deno.land/x/imagescript@1.2.17/mod.ts");
  }
  return _imagescriptPromise;
}

// Rekognition hard limit is 5 MiB on Image.Bytes (base64 over the wire is
// ~33% larger, but the limit is on raw bytes). Stay safely under so multiple
// images held in memory don't trip the 256MB function memory cap either.
const MAX_REK_BYTES = 4_500_000;
const MAX_REK_DIMENSION = 1600;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Owner policy (2026-06-29): all face-verification thresholds are admin-tunable
// via app_settings (single source of truth). These module-level defaults are
// only used as a SAFE-FAIL when app_settings cannot be reached; the real values
// are loaded once per request inside serve() and overwrite these `let`s.
let SAME_PERSON_MIN_SIMILARITY = 55;
let DUPLICATE_FACE_MIN_SIMILARITY = 85;
let PROVIDER_DUPLICATE_SEARCH_THRESHOLD = 80;

async function loadFaceThresholdsFromAdmin(supabaseAdmin: any): Promise<void> {
  try {
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("setting_key,setting_value")
      .in("setting_key", [
        "face_verification_same_person_min_similarity",
        "face_verification_super_strong_min",
        "face_verification_strong_identity_min",
      ]);
    const map = new Map<string, string>();
    (data as any[] | null)?.forEach((r) => map.set(r.setting_key, String(r.setting_value ?? "").trim()));
    const same = Number(map.get("face_verification_same_person_min_similarity"));
    const dup  = Number(map.get("face_verification_super_strong_min"));
    const prov = Number(map.get("face_verification_strong_identity_min"));
    if (Number.isFinite(same) && same >= 0 && same <= 100) SAME_PERSON_MIN_SIMILARITY = same;
    if (Number.isFinite(dup)  && dup  >= 0 && dup  <= 100) DUPLICATE_FACE_MIN_SIMILARITY = dup;
    if (Number.isFinite(prov) && prov >= 0 && prov <= 100) PROVIDER_DUPLICATE_SEARCH_THRESHOLD = prov;
  } catch (e) {
    console.warn("[face-verification-analyze] threshold load failed, using safe defaults:", e instanceof Error ? e.message : e);
  }
}
const LEGACY_DUPLICATE_SCAN_LIMIT = 1000;
const APPROVED_FACE_STATUSES = ["approved", "auto_approved", "auto-approved", "verified", "passed"];
const APPROVED_PROFILE_FACE_STATUSES = new Set(["approved", "verified", "auto_approved", "auto-approved", "passed"]);
const FACE_RETRY_NOTIFICATION_TYPES = ["face_verification_retry", "face_verification_needs_retry"];

async function hasApprovedFaceState(supabaseAdmin: any, userId: string): Promise<boolean> {
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("is_face_verified,face_verification_status,face_verification_image,face_verified_at")
      .eq("id", userId)
      .maybeSingle();

    const profileStatus = String(profile?.face_verification_status || "").trim().toLowerCase();
    if (
      profile?.is_face_verified === true ||
      APPROVED_PROFILE_FACE_STATUSES.has(profileStatus) ||
      Boolean(profile?.face_verification_image) ||
      Boolean(profile?.face_verified_at)
    ) {
      return true;
    }

    const { count } = await supabaseAdmin
      .from("face_verification_submissions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", APPROVED_FACE_STATUSES);
    return (count || 0) > 0;
  } catch (e) {
    console.warn("[face-verification-analyze] approved-state lookup skipped:", e instanceof Error ? e.message : e);
    return false;
  }
}

async function markProfileNeedsRetryUnlessAlreadyApproved(supabaseAdmin: any, userId: string): Promise<boolean> {
  const alreadyApproved = await hasApprovedFaceState(supabaseAdmin, userId);
  if (alreadyApproved) {
    await clearStaleFaceRetryNotifications(supabaseAdmin, userId);
    return true;
  }

  await supabaseAdmin
    .from("profiles")
    .update({ is_face_verified: false, face_verification_status: "needs_retry", updated_at: new Date().toISOString() })
    .eq("id", userId);
  return false;
}

async function clearStaleFaceRetryNotifications(supabaseAdmin: any, userId: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false)
      .in("type", FACE_RETRY_NOTIFICATION_TYPES);
  } catch (e) {
    console.warn("[face-verification-analyze] retry-notification cleanup skipped:", e instanceof Error ? e.message : e);
  }
}

function getAmzDate(): { amzDate: string; dateStamp: string } {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);
  return { amzDate, dateStamp };
}

async function hmacSHA256(key: Uint8Array, message: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(sig);
}

async function getSignatureKey(key: string, dateStamp: string, region: string, service: string) {
  const kDate = await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, service);
  return hmacSHA256(kService, "aws4_request");
}

function toHex(buffer: Uint8Array): string {
  return Array.from(buffer).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

const VIDEO_URL_RE = /(?:^|\/)(?:face-videos|videos)\/|\.(?:webm|mp4|m4v|mov|qt|mkv|3gp|3gpp|avi|ogg|ogv)(?:[?#]|$)/i;

function isLikelyVideoUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return VIDEO_URL_RE.test(decodeURIComponent(parsed.pathname));
  } catch {
    return VIDEO_URL_RE.test(url.split("?")[0] || url);
  }
}

function firstUsableStillUrl(...urls: Array<string | null | undefined>): string | null {
  for (const url of urls) {
    if (typeof url === "string" && url.trim() && !isLikelyVideoUrl(url)) return url;
  }
  return null;
}

async function sha256Hash(message: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return toHex(new Uint8Array(hash));
}

async function rekognitionJson(
  target: string,
  body: Record<string, unknown>,
  accessKey: string,
  secretKey: string,
  region: string,
): Promise<Record<string, unknown>> {
  const service = "rekognition";
  const host = `rekognition.${region}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const { amzDate, dateStamp } = getAmzDate();
  const requestBody = JSON.stringify(body);
  const payloadHash = await sha256Hash(requestBody);
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
    body: requestBody,
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error("[face-verification-analyze] Rekognition error:", res.status, errText);
    throw new Error(`Rekognition ${target} failed: ${res.status}`);
  }
  return await res.json() as Record<string, unknown>;
}

async function detectFaces(bytes: Uint8Array, accessKey: string, secretKey: string, region: string) {
  const b64 = uint8ToBase64(bytes);
  return rekognitionJson(
    "RekognitionService.DetectFaces",
    { Image: { Bytes: b64 }, Attributes: ["ALL"] },
    accessKey,
    secretKey,
    region,
  );
}

async function compareFaces(
  source: Uint8Array,
  target: Uint8Array,
  accessKey: string,
  secretKey: string,
  region: string,
): Promise<number> {
  const body = {
    SourceImage: { Bytes: uint8ToBase64(source) },
    TargetImage: { Bytes: uint8ToBase64(target) },
    SimilarityThreshold: 0,
  };
  const out = await rekognitionJson(
    "RekognitionService.CompareFaces",
    body,
    accessKey,
    secretKey,
    region,
  );
  const matches = (out.FaceMatches as { Similarity?: number }[] | undefined) ?? [];
  return Math.max(0, ...matches.map((m) => Number(m.Similarity || 0)));
}

// Extract { bucket, path } from a Supabase storage URL (public, sign, or authenticated form).
function parseStorageUrl(url: string): { bucket: string; path: string } | null {
  const raw = (url || "").trim().replace(/^\/+/, "");
  const rawMatch = raw.match(/^(face-verification|host-verification)\/(.+)$/);
  if (rawMatch) return { bucket: rawMatch[1], path: rawMatch[2] };
  try {
    const u = new URL(url);
    // /storage/v1/object/{public|sign|authenticated}/{bucket}/{path...}
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^\/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  } catch { return null; }
}

async function fetchImageBytes(
  url: string,
  supabaseAdmin: ReturnType<typeof createClient>,
): Promise<Uint8Array> {
  const parsed = parseStorageUrl(url);
  let bytes: Uint8Array;
  if (parsed) {
    // PRIMARY PATH (zero edge-function CPU): use Supabase Storage's image
    // transformation pipeline to downscale + re-encode JPEG server-side.
    // This is what was causing the "CPU Time exceeded" errors that left
    // submissions stuck on "under_review" — imagescript decode/encode in
    // Deno blew the per-request CPU budget. Storage transforms run on
    // Supabase's image proxy at no cost to us.
    try {
      const { data, error } = await supabaseAdmin.storage
        .from(parsed.bucket)
        .download(parsed.path, {
          transform: { width: 1280, quality: 80, resize: "contain" },
        });
      if (!error && data) {
        const transformed = new Uint8Array(await data.arrayBuffer());
        if (transformed.length > 0 && transformed.length <= MAX_REK_BYTES) {
          return transformed;
        }
      }
    } catch (_transformErr) {
      // fall through to raw download + local normalize
    }
    const { data, error } = await supabaseAdmin.storage.from(parsed.bucket).download(parsed.path);
    if (error || !data) throw new Error(`storage_download_failed:${error?.message || "no_data"}`);
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch image ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  }
  // Fallback: small JPEG/PNG ship as-is; otherwise local normalize.
  if (bytes.length <= MAX_REK_BYTES) {
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
    const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
    if (isJpeg || isPng) return bytes;
  }
  return await normalizeImageBytes(bytes);
}

/**
 * Decode any common image format, downscale if larger than MAX_REK_DIMENSION,
 * and re-encode as JPEG so the resulting bytes always fit Rekognition's
 * 5 MiB cap and are always a supported format. Falls back to the original
 * bytes if they are already small + decodable as JPEG/PNG (cheapest path).
 */
async function normalizeImageBytes(bytes: Uint8Array): Promise<Uint8Array> {
  // Fast path: small JPEG/PNG, ship as-is.
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  if ((isJpeg || isPng) && bytes.length <= MAX_REK_BYTES) {
    return bytes;
  }
  try {
    const { decode: decodeImage, Image } = await loadImagescript();
    const img = await decodeImage(bytes);
    if (!(img instanceof Image)) {
      throw new Error("decoded_non_image");
    }
    const longest = Math.max(img.width, img.height);
    if (longest > MAX_REK_DIMENSION) {
      const scale = MAX_REK_DIMENSION / longest;
      img.resize(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
    }
    // Step down quality until under cap.
    for (const q of [85, 75, 65, 55, 45]) {
      const out = await img.encodeJPEG(q);
      if (out.length <= MAX_REK_BYTES) return new Uint8Array(out);
    }
    // Last resort: shrink further then encode at 40.
    img.resize(Math.max(1, Math.round(img.width / 2)), Math.max(1, Math.round(img.height / 2)));
    const out = await img.encodeJPEG(40);
    if (out.length > MAX_REK_BYTES) {
      throw new Error("image_too_large_after_compression");
    }
    return new Uint8Array(out);
  } catch (decodeErr) {
    // If we cannot decode it AND it is already too large or unsupported,
    // surface a typed error so the caller marks the submission needs_retry
    // with a precise English notification instead of crashing the function.
    if (bytes.length > MAX_REK_BYTES) {
      throw new Error(`image_too_large:${bytes.length}`);
    }
    throw new Error(`image_unreadable:${decodeErr instanceof Error ? decodeErr.message : "decode_failed"}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Tracked across the try so the outer catch can heal the row (so a
  // crashed analyze never leaves a submission frozen in `under_review`).
  let activeSubmissionId: string | null = null;
  let activeUserId: string | null = null;
  let activeAdmin: ReturnType<typeof createClient> | null = null;
  try {
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") || "ap-south-1";
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error("AWS credentials not configured");
    }

    const authHeader = req.headers.get("Authorization");
    const cronSecretHeader = req.headers.get("x-cron-secret") || req.headers.get("x-internal-secret");
    const ENV_CRON_SECRET = Deno.env.get("CRON_SECRET");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    activeAdmin = supabaseAdmin;

    // Validate internal/cron secret against EITHER env var OR app_settings row.
    // app_settings path lets the DB trigger/cron sync with edge fn without manual env juggling.
    let isInternalCall = false;
    if (cronSecretHeader) {
      if (ENV_CRON_SECRET && cronSecretHeader === ENV_CRON_SECRET) {
        isInternalCall = true;
      } else {
        try {
          const { data: settingRow } = await supabaseAdmin
            .from("app_settings")
            .select("setting_value")
            .eq("setting_key", "face_cron_secret")
            .maybeSingle();
          const dbSecret = (settingRow?.setting_value || "").trim();
          if (dbSecret && cronSecretHeader === dbSecret) isInternalCall = true;
        } catch (_e) { /* ignore */ }
      }
    }

    // Admin-tunable thresholds (single source of truth).
    await loadFaceThresholdsFromAdmin(supabaseAdmin);

    if (!isInternalCall && !authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      authHeader ? { global: { headers: { Authorization: authHeader } } } : {},
    );


    let userId: string | null = null;
    if (!isInternalCall) {
      const token = authHeader!.replace("Bearer ", "");
      try {
        const { data: claimsData } = await supabaseUser.auth.getClaims(token);
        if (claimsData?.claims?.sub) userId = claimsData.claims.sub as string;
      } catch (_e) { /* fall through to getUser */ }
      if (!userId) {
        const { data: userData, error: userErr } = await supabaseUser.auth.getUser(token);
        if (userErr || !userData?.user?.id) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        userId = userData.user.id;
      }
    }

    const { submissionId } = await req.json() as { submissionId?: string };
    if (!submissionId) {
      return new Response(JSON.stringify({ error: "submissionId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    activeSubmissionId = submissionId;

    // C-3: idempotency lock — prevent two concurrent invocations from
    // double-spending Rekognition + double-finalizing the same submission.
    try {
      const { data: lockOk, error: lockErr } = await supabaseAdmin
        .rpc("try_lock_face_submission_for_analysis", { p_submission_id: submissionId });
      if (lockErr) {
        console.warn("[face-verification-analyze] lock RPC error (continuing):", lockErr.message);
      } else if (lockOk === false) {
        return new Response(
          JSON.stringify({ success: true, deferred: true, reason: "another_worker_processing" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    } catch (e) {
      console.warn("[face-verification-analyze] lock attempt failed (continuing):", e instanceof Error ? e.message : e);
    }

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("face_verification_submissions")
      .select("id,user_id,status,verification_type,front_url,left_url,right_url,selfie_url,face_image_url,host_photos,profile_photo_url,video_url,ai_analysis")
      .eq("id", submissionId)
      .maybeSingle();

    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "Submission not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    activeUserId = row.user_id as string | null;
    // Internal/cron calls operate on behalf of the row owner.
    if (isInternalCall) {
      userId = row.user_id;
    } else if (row.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const st = String(row.status || "").trim().toLowerCase();
    // DB insert trigger normalizes new rows to 'under_review' instantly
    // (see migration 20260625075339). 'submitted' and 'pending' are kept
    // for legacy/admin-rerun paths. All three are "ready for AI analysis".
    if (st !== "submitted" && st !== "pending" && st !== "under_review" && st !== "needs_retry") {
      // Row already finalized (approved/rejected/expired) — treat re-invocations
      // (realtime fallback, admin reruns, double-submits) as a successful no-op
      // instead of a 400 that surfaces as a runtime error in the client.
      return new Response(JSON.stringify({
        ok: true,
        already_finalized: true,
        status: row.status,
        decision: row.status,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRE-AWS GATE: banned-identity reuse + role mismatch (existing host
    // trying to verify as a normal user to dodge a host-side strike).
    // These checks are CHEAP — no Rekognition spend if any of them trip.
    // ─────────────────────────────────────────────────────────────────────────
    try {
      const { data: subProfile } = await supabaseAdmin
        .from("profiles")
        .select("id,is_host,is_banned,face_hash,device_id,signup_ip,last_login_ip")
        .eq("id", row.user_id)
        .maybeSingle();

      // role_mismatch_existing_host: someone whose account is already a host
      // can never re-submit as a plain user.
      const vt = String(row.verification_type || "").trim().toLowerCase();
      if (vt === "user" && subProfile?.is_host === true) {
        await supabaseAdmin
          .from("face_verification_submissions")
          .update({
            status: "rejected",
            rejection_reason: "Existing host accounts cannot re-verify as a regular user.",
            admin_notes: "[auto-reject] role_mismatch_existing_host",
            updated_at: new Date().toISOString(),
          })
          .eq("id", submissionId);
        return new Response(JSON.stringify({ ok: false, rejected: "role_mismatch_existing_host" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // banned_identity_reuse: face hash / device / IP listed in global ban
      // tables (typically because the same person hit the contact-violation
      // threshold on a previous account).
      let faceMatch = 0, deviceMatch = 0, ipMatch = 0;
      if (subProfile?.face_hash) {
        const { count } = await supabaseAdmin
          .from("banned_face_hashes")
          .select("id", { count: "exact", head: true })
          .eq("face_hash", subProfile.face_hash);
        faceMatch = count || 0;
      }
      if (subProfile?.device_id) {
        const { count } = await supabaseAdmin
          .from("banned_devices")
          .select("id", { count: "exact", head: true })
          .eq("device_id", subProfile.device_id);
        deviceMatch = count || 0;
      }
      const ipToCheck = subProfile?.signup_ip || subProfile?.last_login_ip;
      if (ipToCheck) {
        const { count } = await supabaseAdmin
          .from("banned_ips")
          .select("id", { count: "exact", head: true })
          .eq("ip_address", ipToCheck);
        ipMatch = count || 0;
      }

      if ((faceMatch + deviceMatch + ipMatch) > 0 || subProfile?.is_banned === true) {
        await supabaseAdmin
          .from("face_verification_submissions")
          .update({
            status: "rejected",
            rejection_reason: "This identity (face, device, or IP) is permanently restricted due to prior policy violations.",
            admin_notes: `[auto-reject] banned_identity_reuse face=${faceMatch} device=${deviceMatch} ip=${ipMatch} profile_banned=${subProfile?.is_banned === true}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", submissionId);
        try {
          await supabaseAdmin.from("admin_logs").insert({
            action: "face_verification_auto_reject",
            metadata: {
              submission_id: submissionId,
              user_id: row.user_id,
              reason: "banned_identity_reuse",
              face_match: faceMatch, device_match: deviceMatch, ip_match: ipMatch,
            },
          });
        } catch (_e) { /* admin_logs schema differences — non-fatal */ }
        return new Response(JSON.stringify({ ok: false, rejected: "banned_identity_reuse" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (gateErr) {
      console.warn("[face-verification-analyze] pre-AWS gate skipped:", gateErr instanceof Error ? gateErr.message : gateErr);
      // Fail-open — better to let Rekognition run than block a legit user
      // because of a transient profiles read failure.
    }


    const initialAnalysis = ((row as Record<string, unknown>).ai_analysis ?? {}) as Record<string, unknown>;
    const initialEvidenceUrls = ((initialAnalysis.evidence_urls && typeof initialAnalysis.evidence_urls === "object")
      ? initialAnalysis.evidence_urls
      : {}) as Record<string, unknown>;
    const frontUrl = firstUsableStillUrl(
      row.front_url as string | null,
      row.selfie_url as string | null,
      row.face_image_url as string | null,
      initialEvidenceUrls.live_face_scan_url as string | undefined,
      initialEvidenceUrls.face_video_frame_url as string | undefined,
    );
    const leftUrl = row.left_url;
    const rightUrl = row.right_url;
    if (!frontUrl) {
      const retryRequired = {
        kind: "upload_incomplete" as const,
        verification_type: String(row.verification_type || "user").trim().toLowerCase() === "host" ? "host" : "user",
        failed_evidence: [{
          label: "live_face_scan",
          human_name: "Live Face Scan",
          step: "live_face_scan",
          score: null,
          message: "Live face scan image did not finish uploading. Please retry the live test.",
        }],
        steps: ["live_face_scan"],
        headline: "Live face scan upload incomplete",
        summary: "Your account is NOT rejected. The live scan media was missing, so please retry the live face test.",
      };
      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          status: "needs_retry",
          ai_analysis: { ...initialAnalysis, upload_pending: false, requires_resubmit: true, retry_required: retryRequired },
          rejection_reason: null,
          reviewed_at: null,
          admin_notes: "[needs_retry] Missing live/front face URL; upload incomplete, not rejected.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId)
        .in("status", ["submitted", "pending", "under_review", "needs_retry"]);
      await markProfileNeedsRetryUnlessAlreadyApproved(supabaseAdmin, row.user_id);
      return new Response(JSON.stringify({
        ok: true,
        autoFinalize: { success: false, reason: "upload_incomplete" },
        blocker: null,
        retry_required: retryRequired,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let frontBytes: Uint8Array;
    let leftBytes: Uint8Array | null = null;
    let rightBytes: Uint8Array | null = null;
    try {
      frontBytes = await fetchImageBytes(frontUrl, supabaseAdmin);
    } catch (fetchErr) {
      const msg = fetchErr instanceof Error ? fetchErr.message : "image_fetch_failed";
      const rekognition = { version: 1, edge_fetch_error: msg };
      const { data: existingRow } = await supabaseAdmin
        .from("face_verification_submissions")
        .select("ai_analysis")
        .eq("id", submissionId)
        .maybeSingle();
      const existingAnalysis = (existingRow?.ai_analysis ?? {}) as Record<string, unknown>;
      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          status: "needs_retry",
          ai_analysis: {
            ...existingAnalysis,
            rekognition,
            upload_pending: false,
            requires_resubmit: true,
            retry_required: {
              kind: "upload_incomplete",
              verification_type: String(row.verification_type || "user").trim().toLowerCase() === "host" ? "host" : "user",
              failed_evidence: [{ label: "live_face_scan", human_name: "Live Face Scan", step: "live_face_scan", score: null, message: "Live scan media could not be read. Please retry the live test." }],
              steps: ["live_face_scan"],
              headline: "Live face scan upload incomplete",
              summary: "Your account is NOT rejected. The live scan media could not be read, so please retry the live face test.",
            },
          },
          rejection_reason: null,
          reviewed_at: null,
          admin_notes: `Rekognition: image fetch failed — ${msg}. Marked needs_retry, not rejected.`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId)
        .in("status", ["submitted", "pending", "under_review", "needs_retry"]);
      return new Response(JSON.stringify({ ok: true, autoFinalize: { success: false, reason: "upload_incomplete" }, retry_required: true, error: msg }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (leftUrl) {
      try { leftBytes = await fetchImageBytes(leftUrl, supabaseAdmin); }
      catch (e) { console.warn("[face-verification-analyze] left image fetch skipped:", e instanceof Error ? e.message : e); }
    }
    if (rightUrl) {
      try { rightBytes = await fetchImageBytes(rightUrl, supabaseAdmin); }
      catch (e) { console.warn("[face-verification-analyze] right image fetch skipped:", e instanceof Error ? e.message : e); }
    }

    // Run detections sequentially to keep peak memory below the 256MB cap
    // (large base64 payloads were exploding when ran in parallel). Each one
    // is tolerant: a failure on a side angle should not abort the front pass.
    const safeDetect = async (b: Uint8Array | null) => {
      if (!b) return { FaceDetails: [] } as Record<string, unknown>;
      try {
        return await detectFaces(b, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
      } catch (e) {
        console.warn("[face-verification-analyze] detectFaces side error:", e instanceof Error ? e.message : e);
        return { FaceDetails: [], _detect_error: e instanceof Error ? e.message : String(e) } as Record<string, unknown>;
      }
    };
    let det: Record<string, unknown>;
    try {
      det = await detectFaces(frontBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
    } catch (frontErr) {
      const msg = frontErr instanceof Error ? frontErr.message : "detect_failed";
      console.error("[face-verification-analyze] front detect failed:", msg);
      const { data: existingRow } = await supabaseAdmin
        .from("face_verification_submissions")
        .select("ai_analysis")
        .eq("id", submissionId)
        .maybeSingle();
      const existingAnalysis = (existingRow?.ai_analysis ?? {}) as Record<string, unknown>;
      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          status: "needs_retry",
          ai_analysis: {
            ...existingAnalysis,
            rekognition: { version: 1, front_detect_error: msg },
            requires_resubmit: true,
            retry_required: {
              kind: "evidence_quality",
              verification_type: String(row.verification_type || "user").trim().toLowerCase() === "host" ? "host" : "user",
              failed_evidence: [{ label: "live_face_scan", human_name: "Live Face Scan", step: "live_face_scan", score: null, message: "Our scanner could not read your live face image. Please retake the live face scan in good light, holding still, with only your face in frame." }],
              steps: ["live_face_scan"],
              headline: "Live face scan unreadable",
              summary: "Your account is NOT rejected. Please retake the live face scan in better lighting with a steady camera.",
            },
          },
          rejection_reason: null,
          reviewed_at: null,
          admin_notes: `[needs_retry] front detect failed: ${msg}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId)
        .in("status", ["submitted", "pending", "under_review", "needs_retry"]);
      try {
        await supabaseAdmin.from("notifications").insert({
          user_id: row.user_id,
          type: "face_verification_retry",
          title: "Face Verification — Please Retry",
          message: "We could not read your live face scan. Please retake it in good light, holding the phone steady, with only your face in frame.",
          data: { route: "/face-verification", reason: "live_scan_unreadable" },
        });
      } catch (_e) { /* best-effort */ }
      return new Response(JSON.stringify({ ok: true, autoFinalize: { success: false, reason: "live_scan_unreadable" }, retry_required: true, error: msg }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const leftDet = await safeDetect(leftBytes);
    const rightDet = await safeDetect(rightBytes);
    const details = (det.FaceDetails as Record<string, unknown>[] | undefined) ?? [];
    const leftDetails = (leftDet.FaceDetails as Record<string, unknown>[] | undefined) ?? [];
    const rightDetails = (rightDet.FaceDetails as Record<string, unknown>[] | undefined) ?? [];

    let compareFL = 0;
    let compareFR = 0;
    if (details.length === 1 && leftDetails.length === 1 && rightDetails.length === 1 && leftBytes && rightBytes) {
      try {
        compareFL = await compareFaces(frontBytes, leftBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
        compareFR = await compareFaces(frontBytes, rightBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
      } catch (e) {
        console.error("[face-verification-analyze] CompareFaces:", e);
      }
    }

    const face0 = details[0] as Record<string, unknown> | undefined;
    const left0 = leftDetails[0] as Record<string, unknown> | undefined;
    const right0 = rightDetails[0] as Record<string, unknown> | undefined;
    const gender = face0?.Gender as { Value?: string; Confidence?: number } | undefined;
    const leftGender = left0?.Gender as { Value?: string; Confidence?: number } | undefined;
    const rightGender = right0?.Gender as { Value?: string; Confidence?: number } | undefined;
    const ageRange = face0?.AgeRange as { Low?: number; High?: number } | undefined;
    const faceOccluded = face0?.FaceOccluded as { Value?: boolean; Confidence?: number } | undefined;
    const frontPose = face0?.Pose as { Yaw?: number; Pitch?: number; Roll?: number } | undefined;
    const leftPose = left0?.Pose as { Yaw?: number; Pitch?: number; Roll?: number } | undefined;
    const rightPose = right0?.Pose as { Yaw?: number; Pitch?: number; Roll?: number } | undefined;
    const faceConf = Number(face0?.Confidence ?? 0);
    const genderConf = Number(gender?.Confidence ?? 0);
    const rawG = gender?.Value === "Female" ? "female" : gender?.Value === "Male" ? "male" : "unknown";
    const leftRawG = leftGender?.Value === "Female" ? "female" : leftGender?.Value === "Male" ? "male" : "unknown";
    const rightRawG = rightGender?.Value === "Female" ? "female" : rightGender?.Value === "Male" ? "male" : "unknown";
    const genderConflict = rawG !== "unknown" && (
      (leftRawG !== "unknown" && leftRawG !== rawG && Number(leftGender?.Confidence ?? 0) >= 90) ||
      (rightRawG !== "unknown" && rightRawG !== rawG && Number(rightGender?.Confidence ?? 0) >= 90)
    );
    // Pro-app threshold: AWS Rekognition gender is reliable at ≥75% (false-positive
    // rate <2%). Raising to 86% was rejecting ~30% of legitimate real users.
    let finalGender: string = genderConf >= 75 && rawG !== "unknown" && !genderConflict ? rawG : "unknown";
    const occConf = faceOccluded?.Value === true ? Number(faceOccluded?.Confidence ?? 0) : 0;

    let frontError: string | null = null;
    if (details.length === 0) frontError = "no_face_front";
    else if (details.length > 1) frontError = "multiple_faces_front";
    let leftError: string | null = null;
    if (leftBytes && leftDetails.length === 0) leftError = "no_face_left";
    else if (leftBytes && leftDetails.length > 1) leftError = "multiple_faces_left";
    let rightError: string | null = null;
    if (rightBytes && rightDetails.length === 0) rightError = "no_face_right";
    else if (rightBytes && rightDetails.length > 1) rightError = "multiple_faces_right";

    if (frontError) finalGender = "unknown";

    const rekognition: Record<string, unknown> = {
      version: 1,
      face_count: details.length,
      left_face_count: leftDetails.length,
      right_face_count: rightDetails.length,
      face_confidence: faceConf,
      gender_value: rawG,
      gender_confidence: genderConf,
      left_gender_value: leftRawG,
      left_gender_confidence: Number(leftGender?.Confidence ?? 0),
      right_gender_value: rightRawG,
      right_gender_confidence: Number(rightGender?.Confidence ?? 0),
      gender_conflict: genderConflict,
      final_gender: finalGender,
      compare_front_left: compareFL,
      compare_front_right: compareFR,
      front_pose_yaw: frontPose?.Yaw ?? null,
      left_pose_yaw: leftPose?.Yaw ?? null,
      right_pose_yaw: rightPose?.Yaw ?? null,
      age_range_low: ageRange?.Low ?? null,
      age_range_high: ageRange?.High ?? null,
      face_occluded_confidence: occConf,
    };
    if (frontError) rekognition.front_error = frontError;
    if (leftError) rekognition.left_error = leftError;
    if (rightError) rekognition.right_error = rightError;




    // ───────────────────────────────────────────────────────────────────
    // Profile-photo ↔ verification-selfie cross-check.
    // The user's profile avatar must be the same person as the verification
    // selfie. This catches "uploaded a stranger's photo as avatar, then
    // verified with own face" abuse. Best-effort: missing avatar / fetch
    // failure / no face in avatar = skip (no block). Mismatch (<80%) =>
    // force manual review (never auto-approve).
    // ───────────────────────────────────────────────────────────────────
    let profileMatchScore: number | null = null;
    let profileMatchSkipReason: string | null = null;
    let profileMismatch = false;
    if (!frontError) {
      try {
        const submittedProfilePhotoUrl = (row.profile_photo_url as string | null) || null;
        const { data: profileRow } = await supabaseAdmin
          .from("profiles")
          .select("avatar_url")
          .eq("id", userId)
          .maybeSingle();
        const avatarUrl = submittedProfilePhotoUrl || (profileRow?.avatar_url as string | null) || null;
        if (!avatarUrl) {
          profileMatchSkipReason = "no_profile_photo";
        } else {
          let avatarBytes: Uint8Array | null = null;
          try {
            avatarBytes = await fetchImageBytes(avatarUrl, supabaseAdmin);
          } catch (e) {
            profileMatchSkipReason = `avatar_fetch_failed:${e instanceof Error ? e.message : "unknown"}`;
          }
          if (avatarBytes) {
            const avatarDet = await detectFaces(avatarBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
            const avatarFaceCount = ((avatarDet.FaceDetails as unknown[] | undefined) ?? []).length;
            if (avatarFaceCount === 0) {
              profileMatchSkipReason = "no_face_in_avatar";
            } else if (avatarFaceCount > 1) {
              profileMatchSkipReason = "multiple_faces_in_avatar";
            } else {
              try {
                profileMatchScore = await compareFaces(
                  avatarBytes,
                  frontBytes,
                  AWS_ACCESS_KEY_ID,
                  AWS_SECRET_ACCESS_KEY,
                  AWS_REGION,
                );
                profileMismatch = profileMatchScore < SAME_PERSON_MIN_SIMILARITY;
              } catch (e) {
                profileMatchSkipReason = `compare_failed:${e instanceof Error ? e.message : "unknown"}`;
              }
            }
          }
        }
      } catch (e) {
        profileMatchSkipReason = `profile_check_failed:${e instanceof Error ? e.message : "unknown"}`;
      }
    }
    rekognition.profile_match_score = profileMatchScore;
    rekognition.profile_match_skip_reason = profileMatchSkipReason;
    rekognition.profile_mismatch = profileMismatch;

    // ───────────────────────────────────────────────────────────────────
    // Host gallery photos ↔ verification-selfie cross-check.
    // For host (female) submissions, the 3 host gallery photos must be the
    // same person as the live face. This catches "uploaded someone else's
    // photos, then verified with own face" or vice-versa. Threshold 75%
    // per-photo. Any single mismatch → flag (manual review). Missing /
    // no-face / fetch-fail = skip (no block).
    // ───────────────────────────────────────────────────────────────────
    const hostPhotos = Array.isArray((row as Record<string, unknown>).host_photos)
      ? ((row as Record<string, unknown>).host_photos as string[]).filter((u) => typeof u === "string" && u.length > 0)
      : [];
    const hostPhotoScores: Array<{ url: string; score: number | null; skip?: string }> = [];
    let hostPhotosMinScore: number | null = null;
    let hostPhotosMismatch = false;
    if (!frontError && hostPhotos.length > 0) {
      for (const hp of hostPhotos) {
        try {
          const hpBytes = await fetchImageBytes(hp, supabaseAdmin);
          const hpDet = await detectFaces(hpBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
          const hpFaceCount = ((hpDet.FaceDetails as unknown[] | undefined) ?? []).length;
          if (hpFaceCount === 0) {
            hostPhotoScores.push({ url: hp, score: null, skip: "no_face" });
            continue;
          }
          const score = await compareFaces(
            hpBytes,
            frontBytes,
            AWS_ACCESS_KEY_ID,
            AWS_SECRET_ACCESS_KEY,
            AWS_REGION,
          );
          hostPhotoScores.push({ url: hp, score });
          if (hostPhotosMinScore === null || score < hostPhotosMinScore) hostPhotosMinScore = score;
          if (score < SAME_PERSON_MIN_SIMILARITY) hostPhotosMismatch = true;
        } catch (e) {
          hostPhotoScores.push({
            url: hp,
            score: null,
            skip: `fetch_or_compare_failed:${e instanceof Error ? e.message : "unknown"}`,
          });
        }
      }
    }
    rekognition.host_photos_count = hostPhotos.length;
    rekognition.host_photos_scores = hostPhotoScores;
    rekognition.host_photos_min_score = hostPhotosMinScore;
    rekognition.host_photos_mismatch = hostPhotosMismatch;


    const profileSummary = profileMatchScore !== null
      ? `, profile↔selfie=${profileMatchScore.toFixed(1)}%${profileMismatch ? " MISMATCH" : ""}`
      : profileMatchSkipReason
        ? `, profile-check skipped (${profileMatchSkipReason})`
        : "";
    const hostPhotosSummary = hostPhotos.length > 0
      ? `, host-photos(${hostPhotos.length}) min=${hostPhotosMinScore !== null ? hostPhotosMinScore.toFixed(1) + "%" : "n/a"}${hostPhotosMismatch ? " MISMATCH" : ""}`
      : "";
    const summary =
      `Rekognition: faces F/L/R=${details.length}/${leftDetails.length}/${rightDetails.length}` +
      `${frontError || leftError || rightError ? ` (${[frontError, leftError, rightError].filter(Boolean).join(", ")})` : ""}, ` +
      `gender=${rawG} (${genderConf.toFixed(1)}%)${genderConflict ? " conflict" : ""}, ` +
      `match FL=${compareFL.toFixed(1)}% FR=${compareFR.toFixed(1)}%, faceConf=${faceConf.toFixed(1)}%` +
      profileSummary + hostPhotosSummary;


    // ───────────────────────────────────────────────────────────────────
    // Gender-declaration cross-check.
    // The user picks a gender at signup ("host account" = female by app
    // convention). If Rekognition is highly confident (≥90%) the face does
    // not match that declaration → hard auto-reject. Below that threshold,
    // keep it for manual review to avoid false positive user-visible rejects.
    // ───────────────────────────────────────────────────────────────────
    let declaredGender: string | null = null;
    let expectedGender: "male" | "female" | null = null;
    let genderDeclarationMismatch = false;
    try {
      const { data: profGender } = await supabaseAdmin
        .from("profiles")
        .select("gender,is_host")
        .eq("id", userId)
        .maybeSingle();
      const g = String(profGender?.gender ?? "").trim().toLowerCase();
      if (g === "male" || g === "female") {
        declaredGender = g;
      }

      const vt = String(row.verification_type ?? "").trim().toLowerCase();
      if (vt === "host") expectedGender = "female";
      else if (vt === "user" || vt === "face") expectedGender = "male";
      else if (declaredGender === "male" || declaredGender === "female") expectedGender = declaredGender;
      else if (profGender?.is_host === true) expectedGender = "female";
      else expectedGender = "male";

      if (expectedGender) {
        if (
          rawG !== "unknown" &&
          rawG !== expectedGender &&
          genderConf >= 90 &&
          !frontError &&
          !genderConflict
        ) {
          genderDeclarationMismatch = true;
        }
      }
    } catch (e) {
      console.warn("[face-verification-analyze] declared-gender lookup:", e);
    }
    rekognition.declared_gender = declaredGender;
    rekognition.expected_gender = expectedGender;
    rekognition.gender_declaration_mismatch = genderDeclarationMismatch;

    // ───────────────────────────────────────────────────────────────────
    // Replay / static-image / phone-video spoof detection.
    // A real person turning left/right produces yaw deltas of roughly
    // 15-40°. If all three angles have nearly identical yaw, the user is
    // most likely holding up a phone screen / printed photo / static
    // image. Combined with the provider's liveness check (below) this
    // catches the vast majority of replay attacks.
    // ───────────────────────────────────────────────────────────────────
    const yawF = Number(frontPose?.Yaw ?? 0);
    const yawL = Number(leftPose?.Yaw ?? 0);
    const yawR = Number(rightPose?.Yaw ?? 0);
    const yawDeltaL = Math.abs(yawL - yawF);
    const yawDeltaR = Math.abs(yawR - yawF);
    // Pro-app replay detection: only flag when ALL THREE REAL angle images exist
    // and have near-identical yaw (<3°). Passive scans may intentionally submit
    // only the front live frame; missing side frames must not be treated as fake
    // side captures or as replay evidence.
    const replaySuspected = !frontError && !leftError && !rightError && leftBytes !== null && rightBytes !== null &&
      yawDeltaL < 3 && yawDeltaR < 3;
    rekognition.yaw_delta_left = yawDeltaL;
    rekognition.yaw_delta_right = yawDeltaR;
    rekognition.replay_suspected = replaySuspected;

    // ───────────────────────────────────────────────────────────────────
    // External provider liveness (best-effort). Provider's verify-face
    // returns status='liveness_failed' for photo-of-photo / video-replay
    // when its on-device liveness model rejects the frame.
    // ───────────────────────────────────────────────────────────────────
    let livenessFailed = false;
    let livenessStatus: string | null = null;
    const faceProviderEarly = getProviderConfig("VERIFY_FACE_API_KEY");
    if (faceProviderEarly && !frontError) {
      try {
        const liveness = await providerVerifyFace(faceProviderEarly, {
          external_user_id: userId,
          image_base64: uint8ToBase64(frontBytes),
        });
        if (liveness) {
          livenessStatus = liveness.status;
          if (liveness.status === "liveness_failed") livenessFailed = true;
        }
      } catch (e) {
        console.warn("[face-verification-analyze] liveness check skipped:", e);
      }
    }
    rekognition.liveness_status = livenessStatus;
    rekognition.liveness_failed = livenessFailed;



    // ───────────────────────────────────────────────────────────────────
    // Duplicate-face detection via external verification provider.
    // Best-effort: if the provider key is missing or the call fails, we
    // silently skip and fall through to the existing flow. Never blocks.
    // ───────────────────────────────────────────────────────────────────
    let duplicateFields: Record<string, unknown> = {};
    let duplicateNote = "";
    let duplicateBlock: Record<string, unknown> | null = null;
    let duplicateSearchCompleted = false;
    let faceIndexedForFutureDuplicate = false;
    let duplicateCandidateReview: Record<string, unknown> | null = null;
    let frontB64ForProvider: string | null = null;
    const faceProvider = getProviderConfig("VERIFY_FACE_API_KEY");
    if (faceProvider && !frontError) {
      try {
        const frontB64 = uint8ToBase64(frontBytes);
        frontB64ForProvider = frontB64;
        const search = await providerSearchFace(faceProvider, {
          image_base64: frontB64,
          // Duplicate search is intentionally lower than the hard duplicate
          // cutoff so the server can review likely second accounts even with
          // lighting/compression/camera changes.
          threshold: PROVIDER_DUPLICATE_SEARCH_THRESHOLD,
          max_matches: 5,
        });
        duplicateSearchCompleted = search !== null;
        if (search && search.status === "matches_found" && search.matches.length > 0) {
          // Filter out the current user (re-submissions are not duplicates).
          const others = search.matches.filter(
            (m) => m.external_user_id && m.external_user_id !== userId,
          );
          if (others.length > 0) {
            const top = others[0];
            // Look up the previous account's display name / app_uid / avatar.
            const { data: prevProfile } = await supabaseAdmin
              .from("profiles")
              .select("id,display_name,app_uid,avatar_url,is_face_verified,face_verification_status,host_status")
              .eq("id", top.external_user_id as string)
              .maybeSingle();
            const { count: approvedSubmissionCount } = await supabaseAdmin
              .from("face_verification_submissions")
              .select("id", { count: "exact", head: true })
              .eq("user_id", top.external_user_id as string)
              .in("status", APPROVED_FACE_STATUSES);
            const prevName = (prevProfile?.display_name as string | null) || null;
            const prevUid = (prevProfile?.app_uid as string | null) || null;
            const prevAvatar = (prevProfile?.avatar_url as string | null) || null;
            const previousApproved = Boolean(
              prevProfile?.is_face_verified === true ||
              String(prevProfile?.face_verification_status || "").trim().toLowerCase() === "approved" ||
              String(prevProfile?.host_status || "").trim().toLowerCase() === "approved" ||
              (approvedSubmissionCount || 0) > 0
            );
            const duplicateSimilarity = Number(top.similarity || 0);
            if (previousApproved && duplicateSimilarity >= DUPLICATE_FACE_MIN_SIMILARITY) {
              duplicateFields = {
                is_duplicate_face: true,
                duplicate_face_user_id: top.external_user_id,
                duplicate_face_name: prevName,
                duplicate_face_uid: prevUid,
                duplicate_face_avatar: prevAvatar,
              };
              duplicateBlock = {
                previous_user_id: top.external_user_id,
                previous_display_name: prevName,
                previous_app_uid: prevUid,
                similarity: duplicateSimilarity,
                other_matches: others.length,
                indexed_at: top.indexed_at,
                previous_approved: true,
              };
              duplicateNote = `Duplicate face detected — previously verified as ${prevName ? `"${prevName}"` : "an existing account"}${prevUid ? ` (UID ${prevUid})` : ""}, similarity ${duplicateSimilarity.toFixed(1)}%. Auto-rejected by one-face-one-account policy.`;
            } else {
              duplicateCandidateReview = {
                previous_user_id: top.external_user_id,
                previous_display_name: prevName,
                previous_app_uid: prevUid,
                similarity: duplicateSimilarity,
                other_matches: others.length,
                indexed_at: top.indexed_at,
                previous_approved: false,
              };
            }
          }
        }
        // Do not index here. Indexing happens only after all photo/video/live,
        // liveness, gender, and quality gates pass, immediately before approval.
        // This prevents rejected/pending attempts from poisoning duplicate search.
      } catch (e) {
        console.warn("[face-verification-analyze] duplicate check skipped:", e instanceof Error ? e.message : e);
      }
    }

    // Provider indexes only faces that passed after the provider was enabled.
    // For older already-verified accounts, run a bounded Rekognition fallback
    // against approved profile avatars so the second account is still caught.
    if (!duplicateBlock && !frontError) {
      try {
        const { data: approvedProfiles } = await supabaseAdmin
          .from("profiles")
          .select("id,display_name,app_uid,avatar_url,face_verification_image,is_face_verified,face_verification_status,host_status")
          .neq("id", userId)
          .or("is_face_verified.eq.true,face_verification_status.eq.approved,host_status.eq.approved")
          .order("updated_at", { ascending: false })
          .limit(LEGACY_DUPLICATE_SCAN_LIMIT);

        let bestLegacyCandidate: Record<string, unknown> | null = null;
        for (const candidate of approvedProfiles || []) {
          const candidateUrl = ((candidate as any).face_verification_image as string | null) || (candidate.avatar_url as string | null) || null;
          if (!candidateUrl) continue;
          try {
            const candidateBytes = await fetchImageBytes(candidateUrl, supabaseAdmin);
            const candidateDet = await detectFaces(candidateBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
            const candidateFaceCount = ((candidateDet.FaceDetails as unknown[] | undefined) ?? []).length;
            if (candidateFaceCount !== 1) continue;
            const similarity = await compareFaces(candidateBytes, frontBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
            const previousBest = Number(bestLegacyCandidate?.similarity || 0);
            if (similarity > previousBest) {
              bestLegacyCandidate = {
                previous_user_id: candidate.id,
                previous_display_name: candidate.display_name || null,
                previous_app_uid: candidate.app_uid || null,
                previous_avatar: candidate.avatar_url || null,
                previous_face_image: (candidate as any).face_verification_image || null,
                similarity,
                source: "rekognition_legacy_approved_profile_scan",
                previous_approved: true,
              };
            }
          } catch (_candidateErr) {
            // Skip one bad historical avatar; never block the whole analysis.
          }
        }
        duplicateSearchCompleted = true;

        if (bestLegacyCandidate && Number(bestLegacyCandidate.similarity || 0) >= DUPLICATE_FACE_MIN_SIMILARITY) {
          duplicateFields = {
            is_duplicate_face: true,
            duplicate_face_user_id: bestLegacyCandidate.previous_user_id,
            duplicate_face_name: bestLegacyCandidate.previous_display_name,
            duplicate_face_uid: bestLegacyCandidate.previous_app_uid,
            duplicate_face_avatar: bestLegacyCandidate.previous_avatar,
          };
          duplicateBlock = {
            previous_user_id: bestLegacyCandidate.previous_user_id,
            previous_display_name: bestLegacyCandidate.previous_display_name,
            previous_app_uid: bestLegacyCandidate.previous_app_uid,
            similarity: bestLegacyCandidate.similarity,
            other_matches: 1,
            indexed_at: null,
            source: bestLegacyCandidate.source,
            previous_approved: true,
          };
          const prevName = (bestLegacyCandidate.previous_display_name as string | null) || null;
          const prevUid = (bestLegacyCandidate.previous_app_uid as string | null) || null;
          duplicateNote = `Duplicate face detected by approved-account fallback — previously verified as ${prevName ? `"${prevName}"` : "an existing account"}${prevUid ? ` (UID ${prevUid})` : ""}, similarity ${Number(bestLegacyCandidate.similarity).toFixed(1)}%. Auto-rejected by one-face-one-account policy.`;
          duplicateSearchCompleted = true;
        }
      } catch (e) {
        console.warn("[face-verification-analyze] legacy duplicate scan skipped:", e instanceof Error ? e.message : e);
      }
    }

    // F3 (2026-06-09): Cross-check the duplicate match against banned_face_hashes
    // AND the matched account's `profiles.is_blocked` state. If the face is
    // already on the ban list, this is a hard auto-reject (not just a manual
    // review note) — banned users should NOT be able to re-onboard.
    let bannedFaceMatch: { user_id: string; reason: string | null } | null = null;
    if (duplicateBlock) {
      const matchedUserId = (duplicateBlock as any).previous_user_id as string | null;
      if (matchedUserId) {
        try {
          const { data: bannedRow } = await supabaseAdmin
            .from("banned_face_hashes")
            .select("user_id, reason")
            .eq("user_id", matchedUserId)
            .eq("is_active", true)
            .maybeSingle();
          if (bannedRow) {
            bannedFaceMatch = { user_id: bannedRow.user_id as string, reason: (bannedRow.reason as string | null) ?? null };
          } else {
            const { data: prevProf } = await supabaseAdmin
              .from("profiles")
              .select("is_blocked, blocked_reason")
              .eq("id", matchedUserId)
              .maybeSingle();
            if (prevProf?.is_blocked === true) {
              bannedFaceMatch = { user_id: matchedUserId, reason: (prevProf.blocked_reason as string | null) ?? "Previously banned account" };
            }
          }
        } catch (e) {
          console.warn("[face-verification-analyze] banned-face cross-check skipped:", e);
        }
      }
    }
    rekognition.banned_face_match = bannedFaceMatch;
    rekognition.duplicate_candidate_review = duplicateCandidateReview;

    // Re-read ai_analysis right before the merge so we never blow away client-set
    // flags like { manual_review_required: true } that the insert wrote.
    const { data: existingRow } = await supabaseAdmin
      .from("face_verification_submissions")
      .select("ai_analysis")
      .eq("id", submissionId)
      .maybeSingle();
    const existingAnalysis = (existingRow?.ai_analysis ?? {}) as Record<string, unknown>;
    const evidenceUrls = ((existingAnalysis.evidence_urls && typeof existingAnalysis.evidence_urls === "object")
      ? existingAnalysis.evidence_urls
      : {}) as Record<string, unknown>;
    const vtForEvidence = String(row.verification_type || "").trim().toLowerCase();
    const profileEvidenceUrl = (row.profile_photo_url as string | null) || (evidenceUrls.profile_photo_url as string | undefined) || null;
    const faceVideoFrameUrl = (evidenceUrls.face_video_frame_url as string | undefined) || null;
    const introVideoFrameUrl = vtForEvidence === "host" ? ((evidenceUrls.intro_video_frame_url as string | undefined) || null) : null;
    // If the browser uploaded the actual verification video but failed to extract
    // a still frame on a low-end device, do not leave the whole submission stuck
    // forever in manual review. Use the live front frame as a conservative fallback
    // for the video evidence slot; profile/live/duplicate/liveness/host-gallery
    // gates still have to pass before auto-finalize can run.
    const faceVideoEvidenceUrl = faceVideoFrameUrl || firstUsableStillUrl(row.face_image_url as string | null, frontUrl);
    const introVideoEvidenceUrl = vtForEvidence === "host" ? (introVideoFrameUrl || ((row.video_url && profileEvidenceUrl) ? profileEvidenceUrl : null)) : null;
    // Owner rule (2026-06-27): Approve = "Photo + Live Test match" (+ gender + no duplicate).
    // Video frame extractions (face_video, intro_video) are brittle — the captured
    // frame can land on a blink/turn and report no_face even when the live scan and
    // profile photo are a 99% match. Treat them as OPTIONAL bonus signals: still
    // computed below if a usable URL exists, but never block approval. Host gallery
    // photos (3 host_photos) are validated separately via hostPhotosMismatch and
    // remain mandatory for hosts (those become the public profile gallery).
    const requiredEvidence: Array<{ label: string; url: string | null }> = [
      { label: "profile_photo", url: profileEvidenceUrl },
    ];
    const optionalEvidence: Array<{ label: string; url: string | null }> = [
      { label: "face_video", url: faceVideoEvidenceUrl },
      ...(vtForEvidence === "host" ? [{ label: "intro_video", url: introVideoEvidenceUrl }] : []),
    ];

    const compareEvidenceToLive = async (label: string, url: string | null) => {
      if (!url) return { label, url, score: null as number | null, face_count: 0, error: "missing_url" };
      if (frontError) return { label, url, score: null as number | null, face_count: 0, error: "live_front_invalid" };
      try {
        const bytes = await fetchImageBytes(url, supabaseAdmin);
        const detOut = await detectFaces(bytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
        const count = ((detOut.FaceDetails as unknown[] | undefined) ?? []).length;
        if (count !== 1) {
          return { label, url, score: null as number | null, face_count: count, error: count === 0 ? "no_face" : "multiple_faces" };
        }
        const score = await compareFaces(bytes, frontBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
        return { label, url, score, face_count: count, error: null as string | null };
      } catch (e) {
        return { label, url, score: null as number | null, face_count: 0, error: e instanceof Error ? e.message : "compare_failed" };
      }
    };

    const evidenceChecks = await Promise.all(requiredEvidence.map((item) => compareEvidenceToLive(item.label, item.url)));
    // Optional checks run in parallel for telemetry only — never block approval.
    const optionalChecks = await Promise.all(
      optionalEvidence.map((item) => item.url
        ? compareEvidenceToLive(item.label, item.url)
        : Promise.resolve({ label: item.label, url: item.url, score: null as number | null, face_count: 0, error: "missing_url" })),
    );
    const evidenceScores = Object.fromEntries([...evidenceChecks, ...optionalChecks].map((c) => [c.label, c.score]));
    // evidenceErrors must ONLY contain REQUIRED-evidence errors, so the soft-retry
    // path doesn't fire for optional video-frame extraction issues.
    const evidenceErrors = Object.fromEntries(evidenceChecks.filter((c) => c.error).map((c) => [c.label, c.error]));
    const optionalEvidenceErrors = Object.fromEntries(optionalChecks.filter((c) => c.error).map((c) => [c.label, c.error]));
    const requiredUrlsPresent = requiredEvidence.every((item) => !!item.url);
    const hostGalleryRequired = vtForEvidence === "host";
    const hostGalleryMissing = hostGalleryRequired && hostPhotos.length < 3;
    const hostGalleryUnreadable = hostGalleryRequired && hostPhotos.length >= 3 && (
      hostPhotoScores.length !== 3 || hostPhotoScores.some((s) => typeof s.score !== "number")
    );
    const hostGalleryComplete = !hostGalleryRequired || (
      hostPhotos.length === 3 && hostPhotoScores.length === 3 && hostPhotoScores.every((s) => typeof s.score === "number")
    );
    const evidenceComplete = requiredUrlsPresent && !frontError && evidenceChecks.every((c) => typeof c.score === "number") && hostGalleryComplete;
    // Identity gate: REQUIRED evidence (profile photo) must match the live scan
    // at the owner-approved minimum similarity. Host gallery (3 photos) is also
    // hard-checked separately. Optional video-frame scores are surfaced but never
    // used to fail approval — they were too brittle (frame can land on blink).
    const evidenceIdentityMismatch = evidenceComplete && (evidenceChecks.some((c) => typeof c.score === "number" && (c.score as number) < SAME_PERSON_MIN_SIMILARITY) ||
      (hostGalleryComplete && hostPhotosMismatch));
    const evidenceSamePerson = evidenceComplete &&
      evidenceChecks.every((c) => typeof c.score === "number" && (c.score as number) >= SAME_PERSON_MIN_SIMILARITY) &&
      (!hostGalleryComplete || !hostPhotosMismatch);

    rekognition.evidence_complete = evidenceComplete;
    rekognition.evidence_same_person = evidenceSamePerson;
    rekognition.identity_mismatch = evidenceIdentityMismatch;
    rekognition.photo_live_score = evidenceScores.profile_photo ?? profileMatchScore;
    rekognition.face_video_live_score = evidenceScores.face_video ?? null;
    rekognition.intro_video_live_score = evidenceScores.intro_video ?? null;
    rekognition.evidence_errors = evidenceErrors;
    rekognition.optional_evidence_errors = optionalEvidenceErrors;
    rekognition.evidence_urls_present = {
      profile_photo: !!profileEvidenceUrl,
      face_video_frame: !!faceVideoFrameUrl,
      face_video_frame_fallback: !faceVideoFrameUrl && !!faceVideoEvidenceUrl,
      intro_video_frame: vtForEvidence === "host" ? !!introVideoFrameUrl : undefined,
      intro_video_frame_fallback: vtForEvidence === "host" ? (!introVideoFrameUrl && !!introVideoEvidenceUrl) : undefined,
      live_face_scan: !!frontUrl,
      host_gallery_complete: hostGalleryComplete,
      host_gallery_missing: hostGalleryMissing,
      host_gallery_unreadable: hostGalleryUnreadable,
    };

    const evidenceSummary = `, evidence photo/live=${typeof evidenceScores.profile_photo === "number" ? (evidenceScores.profile_photo as number).toFixed(1) + "%" : "n/a"}` +
      ` faceVideo/live=${typeof evidenceScores.face_video === "number" ? (evidenceScores.face_video as number).toFixed(1) + "%" : "n/a"}` +
      (vtForEvidence === "host" ? ` introVideo/live=${typeof evidenceScores.intro_video === "number" ? (evidenceScores.intro_video as number).toFixed(1) + "%" : "n/a"}` : "") +
      `${evidenceIdentityMismatch ? " IDENTITY-MISMATCH" : evidenceSamePerson ? " SAME-PERSON" : " NEEDS-REVIEW"}`;
    const mergedAnalysis = duplicateBlock
      ? { ...existingAnalysis, rekognition, duplicate_account: duplicateBlock }
      : { ...existingAnalysis, rekognition };
    const isPassivePhotoVideoLiveScan = String((existingAnalysis as Record<string, unknown>)?.scan_mode || "") === "passive_photo_video_live";

    const finalNotes = duplicateNote ? `${summary}${evidenceSummary}\n[duplicate-face] ${duplicateNote}` : `${summary}${evidenceSummary}`;

    await supabaseAdmin
      .from("face_verification_submissions")
      .update({
        ai_analysis: mergedAnalysis,
        rekognition_confidence: faceConf,
        admin_notes: finalNotes,
        ...duplicateFields,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    // ────────────────────────────────────────────────────────────────────
    // POLICY (Updated F3 2026-06-26):
    //   User-visible auto-reject is allowed ONLY for hard fraud:
    //   1) the same face already belongs to another account, or
    //   2) the face/device/network is on the ban list.
    //   Liveness/replay/photo/profile/gallery quality problems block
    //   auto-approve and stay Pending for manual admin review.
    // ────────────────────────────────────────────────────────────────────
    const finalGenderForDecision = String(rekognition.final_gender || "").trim().toLowerCase();
    const detectedGenderForDecision = (finalGenderForDecision === "male" || finalGenderForDecision === "female")
      ? finalGenderForDecision
      : rawG;
    // Policy (2026-06-06): Unified scan. All photos (avatar, host photos) must match the live face.
    const isDuplicate = Boolean(duplicateBlock);
    const isBannedFace = Boolean(bannedFaceMatch);
    let hardAutoReject: "duplicate_face" | "banned_face" | "gender_mismatch" | null = null;

    // Check for "no face" in required photos for hosts
    const hostNoFaceInGallery = hostPhotos.length > 0 && hostPhotoScores.some(s => s.skip === "no_face");
    const noFaceInAvatar = profileMatchSkipReason === "no_face_in_avatar";

    if (isBannedFace) hardAutoReject = "banned_face";
    else if (isDuplicate) hardAutoReject = "duplicate_face";
    // Owner policy (2026-06-27): account-gender mismatch is a HARD auto-reject.
    // Male signing up as host (female account) or female signing up as user
    // (male account) is rejected instantly with notification, only when
    // Rekognition is highly confident (≥90%) and there is a clean single face.
    else if (genderDeclarationMismatch) hardAutoReject = "gender_mismatch";

    if (hardAutoReject) {
      let rReason = "Verification rejected.";
      if (hardAutoReject === "duplicate_face") {
        const dName = (duplicateBlock as any).previous_display_name || "Existing Account";
        const dUid = (duplicateBlock as any).previous_app_uid || "Unknown";
        const dUserId = (duplicateBlock as any).previous_user_id || "";
        const duplicatePayload = JSON.stringify({
          user_id: dUserId,
          name: dName,
          uid: dUid,
          avatar: (duplicateFields.duplicate_face_avatar as string) || "",
        });
        rReason = `This face is already registered with another account: ${dName} (ID: ${dUid}). One face can only be used for one account. Please contact Support Chat if you believe this is an error. [duplicate_info:${duplicatePayload}]`;
      } else if (hardAutoReject === "banned_face") {
        rReason = `This face is associated with a previously banned account${bannedFaceMatch?.reason ? ` (reason: ${bannedFaceMatch.reason})` : ""}. You cannot create a new account. Please contact Support Chat if you believe this is an error.`;
      } else if (hardAutoReject === "gender_mismatch") {
        const expectedLabel = expectedGender === "female" ? "Host (female)" : "User (male)";
        const detectedLabel = rawG === "female" ? "female" : rawG === "male" ? "male" : "unknown";
        rReason = `Your account type is ${expectedLabel} but our AI detected a ${detectedLabel} face (confidence ${genderConf.toFixed(1)}%). Please create the correct account type or contact Support Chat if you believe this is an error.`;
      }

      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          status: "rejected",
          rejection_reason: rReason,
          reviewed_at: new Date().toISOString(),
          admin_notes: `${summary}${evidenceSummary}\n[auto-reject] ${hardAutoReject}: ${hardAutoReject === "duplicate_face" ? duplicateNote : hardAutoReject === "gender_mismatch" ? `expected=${expectedGender} detected=${rawG} conf=${genderConf.toFixed(1)}%` : "banned face/account reuse"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId)
        .in("status", ["submitted", "pending", "under_review", "rejected"]);

      await supabaseAdmin
        .from("profiles")
        .update({
          is_face_verified: false,
          face_verification_status: "rejected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      // In-app + push notification (English) with reason + stage + deep link.
      // push-on-notification fans out to FCM; tap routes to /face-verification.
      try {
        // Map reason_code → human stage label so the user (and admin reviewing
        // the notification) sees exactly WHICH gate triggered the rejection.
        const stageMap: Record<string, { stage: string; stage_label: string }> = {
          duplicate_face: { stage: "duplicate_check", stage_label: "Duplicate Identity Check" },
          banned_face: { stage: "ban_list_check", stage_label: "Ban List Check" },
          gender_mismatch: { stage: "gender_check", stage_label: "Account Gender Check" },
        };
        const stageInfo = stageMap[hardAutoReject] ?? { stage: "policy_check", stage_label: "Policy Check" };

        let publicMessage = "Your face verification was rejected.";
        if (hardAutoReject === "duplicate_face") {
          const dName = (duplicateBlock as any)?.previous_display_name || "another account";
          const dUid = (duplicateBlock as any)?.previous_app_uid || "";
          publicMessage = `This face is already registered with ${dName}${dUid ? ` (ID ${dUid})` : ""}. One face can only be used for one account. Tap to review or contact Support.`;
        } else if (hardAutoReject === "banned_face") {
          publicMessage = "This face is associated with a previously banned account. You cannot create a new account. Tap to contact Support if you believe this is an error.";
        } else if (hardAutoReject === "gender_mismatch") {
          const expectedLabel = expectedGender === "female" ? "Host (female)" : "User (male)";
          publicMessage = `Your account type is ${expectedLabel}, but our AI detected a different gender. Please create the correct account type or contact Support.`;
        }

        // Prepend a clear "[Stage] Reason:" prefix so the rejection cause is
        // legible even in collapsed/preview notification rows.
        const titledMessage = `[${stageInfo.stage_label} • ${hardAutoReject}] ${publicMessage}`;

        await supabaseAdmin.from("notifications").insert({
          user_id: userId,
          type: "face_verification_rejected",
          title: `Face Verification Rejected — ${stageInfo.stage_label}`,
          message: titledMessage,
          data: {
            action_url: "/face-verification",
            reason_code: hardAutoReject,
            stage: stageInfo.stage,
            stage_label: stageInfo.stage_label,
            submission_id: submissionId,
          },
          is_read: false,
        });
      } catch (notifyErr) {
        console.warn("[face-verification-analyze] reject notification failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }


      return new Response(
        JSON.stringify({
          ok: true,
          rekognition,
          autoFinalize: { success: false, reason: hardAutoReject },
          blocker: hardAutoReject,
          declaredGender,
          expectedGender,
          detectedGender: detectedGenderForDecision,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ────────────────────────────────────────────────────────────────────
    // SOFT RETRY (identity mismatch across photo+video+live):
    //   When the three evidence sources are NOT the same person, we do NOT
    //   burn the user's account/ID. We mark the submission as `needs_retry`,
    //   pinpoint which evidence(s) failed, and let the frontend re-route the
    //   user to re-upload only those failing items and re-submit.
    // ────────────────────────────────────────────────────────────────────
    if (evidenceIdentityMismatch) {
      const labelToHumanName: Record<string, string> = {
        profile_photo: "Profile Photo",
        face_video: "Face Verification Video",
        intro_video: "Intro Video",
      };
      const labelToStep: Record<string, string> = {
        profile_photo: "photo",
        face_video: "live_face_scan",
        intro_video: "intro_video",
      };
      const failedEvidence = evidenceChecks
        .filter((c) => typeof c.score === "number" && (c.score as number) < SAME_PERSON_MIN_SIMILARITY)
        .map((c) => ({
          label: c.label,
          human_name: labelToHumanName[c.label] || c.label,
          step: labelToStep[c.label] || c.label,
          score: typeof c.score === "number" ? Math.round((c.score as number) * 10) / 10 : null,
          message: `${labelToHumanName[c.label] || c.label} does not match your live face (similarity ${typeof c.score === "number" ? (c.score as number).toFixed(1) + "%" : "unknown"}). Please re-upload a clear ${labelToHumanName[c.label] || c.label} that shows the SAME person as the live scan.`,
        }));
      if (vtForEvidence === "host" && hostPhotosMismatch) {
        failedEvidence.push({
          label: "host_gallery",
          human_name: "Host Profile Photos",
          step: "host_gallery",
          score: typeof hostPhotosMinScore === "number" ? Math.round(hostPhotosMinScore * 10) / 10 : null,
          message: `One or more of your host profile photos do not match your live face. Please replace them with photos of the SAME person as the live scan.`,
        });
      }
      const retryRequired = {
        kind: "identity_mismatch" as const,
        verification_type: vtForEvidence,
        failed_evidence: failedEvidence,
        steps: Array.from(new Set(failedEvidence.map((f) => f.step))),
        headline: "Your photo, video, and live face scan don't look like the same person.",
        summary: "We compared your Profile Photo, Verification Video, and Live Face Scan side-by-side and they don't confidently match. Your account is NOT rejected — just tap Retry and re-upload only the item(s) listed below so all three are clearly the SAME person.",
      };

      const mergedAnalysisRetry = duplicateBlock
        ? { ...existingAnalysis, rekognition, duplicate_account: duplicateBlock, retry_required: retryRequired }
        : { ...existingAnalysis, rekognition, retry_required: retryRequired };

      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          status: "needs_retry",
          ai_analysis: mergedAnalysisRetry,
          rejection_reason: null,
          reviewed_at: null,
          admin_notes: `${summary}${evidenceSummary}\n[needs_retry] identity_mismatch: photo_live=${String(rekognition.photo_live_score)} face_video_live=${String(rekognition.face_video_live_score)} intro_video_live=${String(rekognition.intro_video_live_score)} host_min=${hostPhotosMinScore} failed=${failedEvidence.map((f) => f.label).join(",")}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId)
        .in("status", ["submitted", "pending", "under_review", "needs_retry"]);

      const alreadyApprovedForRetry = await markProfileNeedsRetryUnlessAlreadyApproved(supabaseAdmin, userId);

      // In-app + push notification (English) — tap routes to /face-verification.
      try {
        if (!alreadyApprovedForRetry) {
          const itemsList = failedEvidence.map((f) => f.human_name).join(", ");
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            type: "face_verification_retry",
            title: "Verification Needs Retry",
            message: `${retryRequired.headline} Please re-upload: ${itemsList}. Tap to retry.`,
            data: {
              action_url: "/face-verification",
              steps: retryRequired.steps,
              submission_id: submissionId,
            },
            is_read: false,
          });
        }
      } catch (notifyErr) {
        console.warn("[face-verification-analyze] retry notification failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          rekognition,
          autoFinalize: { success: false, reason: "identity_mismatch_needs_retry" },
          blocker: null,
          retry_required: retryRequired,
          declaredGender,
          expectedGender,
          detectedGender: detectedGenderForDecision,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // SOFT RETRY (host gallery incomplete/unreadable): host approval publishes
    // the 3 Step-2 photos to the public profile, so host accounts must provide
    // exactly 3 readable same-person photos. Do NOT blame the live scan when the
    // live/photo/video match is already 99%+; route the user to the gallery step.
    if (isPassivePhotoVideoLiveScan && vtForEvidence === "host" && (hostGalleryMissing || hostGalleryUnreadable)) {
      const retryRequired = {
        kind: "host_gallery_incomplete" as const,
        verification_type: vtForEvidence,
        failed_evidence: [{
          label: "host_gallery",
          human_name: "Host Profile Photos",
          step: "host_gallery",
          score: typeof hostPhotosMinScore === "number" ? Math.round(hostPhotosMinScore * 10) / 10 : null,
          message: hostGalleryMissing
            ? `Please upload exactly 3 host profile photos. We received ${hostPhotos.length}/3 photos.`
            : "Please replace your host profile photos with 3 clear photos where your face is visible.",
        }],
        steps: ["host_gallery"],
        headline: hostGalleryMissing
          ? `Please upload all 3 host profile photos (${hostPhotos.length}/3 received).`
          : "Please replace unreadable host profile photos.",
        summary: "Your account is NOT rejected. Your profile photo, video and live face scan can still match, but host verification needs 3 clear host profile photos before approval.",
      };

      const mergedAnalysisRetry = duplicateBlock
        ? { ...existingAnalysis, rekognition, duplicate_account: duplicateBlock, retry_required: retryRequired }
        : { ...existingAnalysis, rekognition, retry_required: retryRequired };

      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          status: "needs_retry",
          ai_analysis: mergedAnalysisRetry,
          rejection_reason: null,
          reviewed_at: null,
          admin_notes: `${summary}${evidenceSummary}\n[needs_retry] host_gallery: count=${hostPhotos.length}/3 unreadable=${hostGalleryUnreadable} min=${hostPhotosMinScore}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId)
        .in("status", ["submitted", "pending", "under_review", "needs_retry"]);

      const alreadyApprovedForGalleryRetry = await markProfileNeedsRetryUnlessAlreadyApproved(supabaseAdmin, userId);

      try {
        if (!alreadyApprovedForGalleryRetry) {
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            type: "face_verification_retry",
            title: "Verification Needs Retry",
            message: `${retryRequired.headline} Tap to upload the missing photos.`,
            data: {
              action_url: "/face-verification",
              steps: retryRequired.steps,
              submission_id: submissionId,
            },
            is_read: false,
          });
        }
      } catch (notifyErr) {
        console.warn("[face-verification-analyze] host-gallery retry notification failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          rekognition,
          autoFinalize: { success: false, reason: "host_gallery_needs_retry" },
          blocker: null,
          retry_required: retryRequired,
          declaredGender,
          expectedGender,
          detectedGender: detectedGenderForDecision,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ────────────────────────────────────────────────────────────────────
    // SOFT RETRY (evidence quality):
    //   Passive scan succeeded reaching the analyzer, but Rekognition could
    //   not produce a usable comparison because the live frame had multiple
    //   faces / no face / occlusion, or one of the required evidence images
    //   (profile photo / video frame) had no detectable face. We do NOT
    //   reject the account — we mark `needs_retry` with a precise message
    //   so the user re-shoots just the failing step, plus a notification.
    // ────────────────────────────────────────────────────────────────────
    if (isPassivePhotoVideoLiveScan && !evidenceComplete) {
      const failingSteps: { label: string; human_name: string; step: string; message: string }[] = [];
      const errKeys = Object.keys(evidenceErrors || {});
      const liveFrontBad = !!frontError || details.length !== 1;
      const onlyMissingHostGallery = vtForEvidence === "host" && !evidenceComplete && !frontError && details.length === 1 && errKeys.length === 0 && (hostGalleryMissing || hostGalleryUnreadable);
      if (liveFrontBad) {
        const reason = frontError === "multiple_faces_front" || details.length > 1
          ? "more than one face was visible in the live scan"
          : details.length === 0
            ? "no clear face was visible in the live scan"
            : "the live face scan was not readable";
        failingSteps.push({
          label: "live_face_scan",
          human_name: "Live Face Scan",
          step: "live_face_scan",
          message: `Please retake the Live Face Scan — ${reason}. Make sure only YOUR face is in the frame, well-lit, and centered.`,
        });
      }
      for (const k of errKeys) {
        if (k === "profile_photo") {
          failingSteps.push({
            label: "profile_photo",
            human_name: "Profile Photo",
            step: "photo",
            message: "Please re-upload your Profile Photo. The face must be clearly visible (no sunglasses, no mask, well-lit, centered).",
          });
        } else if (k === "face_video") {
          failingSteps.push({
            label: "face_video",
            human_name: "Face Verification Video",
            step: "live_face_scan",
            message: "Please re-record the Face Verification Video so your face is clearly visible throughout.",
          });
        } else if (k === "intro_video") {
          failingSteps.push({
            label: "intro_video",
            human_name: "Intro Video",
            step: "intro_video",
            message: "Please re-record the Intro Video so your face is clearly visible.",
          });
        }
      }
      if (failingSteps.length === 0 && onlyMissingHostGallery) {
        failingSteps.push({
          label: "host_gallery",
          human_name: "Host Profile Photos",
          step: "host_gallery",
          message: hostGalleryMissing
            ? `Please upload exactly 3 host profile photos. We received ${hostPhotos.length}/3 photos.`
            : "Please replace your host profile photos with 3 clear photos where your face is visible.",
        });
      } else if (failingSteps.length === 0) {
        failingSteps.push({
          label: "live_face_scan",
          human_name: "Live Face Scan",
          step: "live_face_scan",
          message: "Please retake the Live Face Scan in better lighting with only your face in the frame.",
        });
      }
      const retryRequired = {
        kind: "evidence_quality" as const,
        verification_type: vtForEvidence,
        failed_evidence: failingSteps.map((f) => ({ ...f, score: null })),
        steps: Array.from(new Set(failingSteps.map((f) => f.step))),
        headline: "We couldn't read your photo/video/live scan clearly.",
        summary: "Your account is NOT rejected. Tap Retry and redo only the item(s) below so we can verify you.",
      };

      const mergedAnalysisRetry = duplicateBlock
        ? { ...existingAnalysis, rekognition, duplicate_account: duplicateBlock, retry_required: retryRequired }
        : { ...existingAnalysis, rekognition, retry_required: retryRequired };

      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          status: "needs_retry",
          ai_analysis: mergedAnalysisRetry,
          rejection_reason: null,
          reviewed_at: null,
          admin_notes: `${summary}${evidenceSummary}\n[needs_retry] evidence_quality: front=${frontError || `count=${details.length}`} errors=${JSON.stringify(evidenceErrors)} steps=${retryRequired.steps.join(",")}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId)
        .in("status", ["submitted", "pending", "under_review", "needs_retry"]);

      const alreadyApprovedForQualityRetry = await markProfileNeedsRetryUnlessAlreadyApproved(supabaseAdmin, userId);

      try {
        if (!alreadyApprovedForQualityRetry) {
          const itemsList = failingSteps.map((f) => f.human_name).join(", ");
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            type: "face_verification_retry",
            title: "Verification Needs Retry",
            message: `${retryRequired.headline} Please redo: ${itemsList}. Tap to retry.`,
            data: {
              action_url: "/face-verification",
              steps: retryRequired.steps,
              submission_id: submissionId,
            },
            is_read: false,
          });
        }
      } catch (notifyErr) {
        console.warn("[face-verification-analyze] quality retry notification failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          rekognition,
          autoFinalize: { success: false, reason: "evidence_quality_needs_retry" },
          blocker: null,
          retry_required: retryRequired,
          declaredGender,
          expectedGender,
          detectedGender: detectedGenderForDecision,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }



    // Other non-fraud soft signals (liveness/replay/profile/gallery/quality and
    // lower-confidence gender signals) are NOT user-visible instant rejects, but
    // they also must NOT be auto-approved. Keep the row Pending/Under Review so
    // admin can decide. Hard fraud duplicate/banned-face cases already returned above.
    let autoResult: Record<string, unknown> | null = null;
    // ★ SECURITY GATE (P0 hardening 2026-06-18): Auto-approve is ONLY safe when
    //    BOTH AWS Rekognition (compare/detect) AND the external liveness +
    //    duplicate-search provider (VERIFY_FACE_API_KEY) ran successfully.
    //    If the provider key is missing or its call threw, livenessStatus stays
    //    null — Rekognition alone CANNOT distinguish a photo-of-a-photo or a
    //    replay from a live person. In that case we MUST NOT auto-approve;
    //    leave the row in `submitted` for manual admin review.
    const livenessProviderAvailable = !!faceProviderEarly;
    const livenessActuallyRan = livenessStatus !== null;
    // Current app flow is passive photo/video/live: profile photo + extracted
    // video frame + live frame. When these three pieces are complete and match,
    // Rekognition itself is enough to finalize instantly even if the optional
    // external liveness provider is not configured in this environment.
    const passiveStrongPhotoVideoLiveEvidence = isPassivePhotoVideoLiveScan
      && evidenceComplete
      && evidenceSamePerson
      && !frontError
      && !profileMismatch
      && !hostPhotosMismatch
      && !noFaceInAvatar
      && !hostNoFaceInGallery
      && !replaySuspected
      && !livenessFailed;
    // ★ SUPER-STRONG IDENTITY OVERRIDE (2026-06-29, owner mandate):
    // When the passive photo↔live and faceVideo↔live similarity scores are
    // BOTH ≥ 85% (Rekognition's high-confidence band), the user has proven
    // same-person identity beyond reasonable doubt. In that case we override
    // softer signals — liveness provider hiccups, replay heuristics, outdated
    // host-gallery photos, stale profile avatars — and still allow auto-finalize.
    // Hard fraud gates (duplicate face, banned hash, account_gender_mismatch,
    // no_face_in_front, underage) are NOT overridden — those returned earlier.
    const photoLiveScoreNum = Number(rekognition.photo_live_score ?? 0);
    const faceVideoLiveScoreNum = Number(rekognition.face_video_live_score ?? 0);
    const passiveSuperStrongEvidence = isPassivePhotoVideoLiveScan
      && photoLiveScoreNum >= 85
      && faceVideoLiveScoreNum >= 85;
    const passiveManualReviewReason = (isPassivePhotoVideoLiveScan && !passiveSuperStrongEvidence)
      ? !evidenceComplete
        ? "photo_video_live_evidence_missing"
        : !evidenceSamePerson
          ? "photo_video_live_identity_review"
          : livenessFailed
            ? "liveness_failed_manual_review"
            : replaySuspected
              ? "replay_suspected_manual_review"
              : profileMismatch
                ? "profile_mismatch_manual_review"
                : hostPhotosMismatch
                  ? "host_photos_mismatch"
                  : noFaceInAvatar
                    ? "no_face_in_avatar_manual_review"
                    : hostNoFaceInGallery
                      ? "no_face_in_gallery_manual_review"
                      : ""
      : "";


    if (duplicateCandidateReview) {
      autoResult = { success: false, reason: "duplicate_candidate_manual_review" };
      console.log("[face-verification-analyze] duplicate candidate is not an approved identity → manual review");
    } else if (passiveManualReviewReason) {
      autoResult = { success: false, reason: passiveManualReviewReason };
      console.log(`[face-verification-analyze] ${passiveManualReviewReason} → manual review`);
    } else if (hostPhotosMismatch) {
      autoResult = { success: false, reason: "host_photos_mismatch" };
      console.log("[face-verification-analyze] host_photos_mismatch → manual review");
    } else if (!livenessProviderAvailable && !passiveStrongPhotoVideoLiveEvidence && !passiveSuperStrongEvidence) {
      autoResult = { success: false, reason: "liveness_provider_missing" };
      console.error("[face-verification-analyze] ⚠️ VERIFY_FACE_API_KEY not configured — auto-approve blocked, manual review required");
    } else if (!livenessActuallyRan && !passiveStrongPhotoVideoLiveEvidence && !passiveSuperStrongEvidence) {
      autoResult = { success: false, reason: "liveness_provider_unreachable" };
      console.error("[face-verification-analyze] ⚠️ liveness provider did not return a status — auto-approve blocked, manual review required");
    } else if (!duplicateSearchCompleted && !frontError && !passiveStrongPhotoVideoLiveEvidence && !passiveSuperStrongEvidence) {
      autoResult = { success: false, reason: "duplicate_search_unverified" };
      console.error("[face-verification-analyze] ⚠️ duplicate search did not complete — auto-approve blocked, manual review required");

    } else {
      if (!isDuplicate && faceProvider && frontB64ForProvider && !frontError) {
        faceIndexedForFutureDuplicate = await providerIndexFace(faceProvider, {
          external_user_id: userId,
          image_base64: frontB64ForProvider,
          metadata: { submission_id: submissionId, source: "merilive_main_app", indexed_after_gates_passed: true },
        });
        if (!faceIndexedForFutureDuplicate) {
          // Never keep a clean, new verification stuck in Under Review only
          // because the future duplicate-index write failed. The current
          // submission has already passed the duplicate/gender/evidence gates;
          // indexing is a background protection for future accounts, not a
          // blocker for this valid user.
          console.error("[face-verification-analyze] ⚠️ face index failed — continuing auto-finalize; future sweeps can re-index this approved face");
        }
      }
    }

    if (!autoResult) {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(
        "service_auto_finalize_face_verification",
        { p_submission_id: submissionId },
      );
      autoResult = !rpcErr ? rpcData as Record<string, unknown> : null;
      if (rpcErr) console.warn("[face-verification-analyze] auto-finalize:", rpcErr.message);
    }

    // Instant in-app + push notification on auto-approval (English).
    if (autoResult?.success) {
      try {
        await clearStaleFaceRetryNotifications(supabaseAdmin, userId);
        await supabaseAdmin.from("notifications").insert({
          user_id: userId,
          type: "face_verification_approved",
          title: "Face Verification Approved ✓",
          message: "Congratulations! Your identity has been verified. You now have full access to the app.",
          data: {
            action_url: "/profile",
            submission_id: submissionId,
          },
          is_read: false,
        });
      } catch (notifyErr) {
        console.warn("[face-verification-analyze] approve notification failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }
    }


    // If auto-approve cannot safely fire for a non-fraud reason, never leave
    // the user frozen in Pending/Under Review. Owner policy: valid new faces
    // auto-approve instantly; duplicate/gender mismatch hard-reject instantly;
    // blurry/multiple-face/missing/uncertain evidence gets a clear English
    // retry notification instantly.
    const autoReason = String(autoResult?.reason || "");
    if (!autoResult?.success) {
      const softFlags: string[] = [];
      if (livenessFailed) softFlags.push("liveness_failed");
      if (replaySuspected) softFlags.push(`replay_suspected(L=${yawDeltaL.toFixed(1)}° R=${yawDeltaR.toFixed(1)}°)`);
      if (profileMismatch) softFlags.push(`profile_mismatch(${profileMatchScore?.toFixed(1)}%)`);
      if (duplicateBlock) softFlags.push("duplicate_face");
      if (duplicateCandidateReview) softFlags.push("duplicate_candidate_manual_review");
      if (hostPhotosMismatch) softFlags.push(`host_photos_mismatch(min=${hostPhotosMinScore?.toFixed(1)}%)`);
      if (noFaceInAvatar) softFlags.push("no_face_in_avatar");
      if (hostNoFaceInGallery) softFlags.push("no_face_in_gallery");
      if (!evidenceComplete) softFlags.push(`evidence_missing(${JSON.stringify(evidenceErrors)})`);
      if (!evidenceSamePerson && evidenceComplete) softFlags.push(`evidence_review(photo=${String(rekognition.photo_live_score)} faceVideo=${String(rekognition.face_video_live_score)} intro=${String(rekognition.intro_video_live_score)})`);

      const reviewReason = autoReason === "invalid_face_count"
        ? `Needs admin review: ${details.length === 0 ? "no clear face on front frame" : "multiple faces on front frame"}.`
        : autoReason === "underage"
          ? "Needs admin review: AI age estimate borderline."
          : autoReason === "face_occluded"
            ? "Needs admin review: AI flagged possible occlusion."
            : autoReason === "gender_unknown" || autoReason === "invalid_final_gender"
              ? "Needs admin review: gender confidence below auto-approve threshold."
              : autoReason === "low_similarity"
                ? `Needs admin review: front-vs-side similarity low (L=${compareFL.toFixed(1)}% R=${compareFR.toFixed(1)}%).`
                : autoReason === "below_thresholds"
                  ? "Needs admin review: AI confidence below auto-approve threshold."
                    : autoReason === "host_photos_mismatch"
                      ? `Needs admin review: one or more host gallery photos do not match the live face (min similarity ${hostPhotosMinScore?.toFixed(1)}%).`
                      : autoReason === "liveness_provider_missing"
                        ? "Needs admin review: liveness provider unavailable (VERIFY_FACE_API_KEY not configured). Auto-approve was blocked for safety — verify manually."
                        : autoReason === "liveness_provider_unreachable"
                          ? "Needs admin review: liveness provider did not respond. Auto-approve was blocked for safety — verify manually."
                          : autoReason === "duplicate_search_unverified"
                            ? "Needs admin review: duplicate-face search did not complete. Auto-approve was blocked so one face cannot pass on multiple accounts."
                            : autoReason === "duplicate_candidate_manual_review"
                              ? "Needs admin review: this face matched another non-approved/pending identity candidate. Approve only if it is not a second account."
                              : autoReason === "face_index_failed"
                              ? "Needs admin review: face indexing failed after duplicate search. Auto-approve was blocked so future duplicate detection remains safe."
                              : autoReason === "photo_video_live_evidence_missing"
                                ? "Needs admin review: required photo/video/live evidence was missing or unreadable, so auto-approve was blocked."
                                : autoReason === "photo_video_live_identity_review"
                                  ? "Needs admin review: photo, video, and live scan are not confidently confirmed as the same person."
                                  : `Needs admin review: ${autoReason || "AI could not safely auto-approve"}.`;


      const flagsLine = softFlags.length ? `\n[soft-flags] ${softFlags.join(", ")}` : "";
      const retrySteps = Array.from(new Set([
        (!evidenceComplete || frontError || details.length !== 1 || autoReason === "invalid_face_count") ? "live_face_scan" : null,
        (profileMismatch || noFaceInAvatar || autoReason === "profile_face_mismatch" || autoReason === "photo_video_live_identity_review") ? "photo" : null,
        (hostPhotosMismatch || hostNoFaceInGallery || autoReason === "host_photos_mismatch") ? "host_gallery" : null,
      ].filter(Boolean))) as string[];
      const normalizedRetrySteps = retrySteps.length ? retrySteps : ["photo", "live_face_scan"];
      const retryRequired = {
        kind: "auto_review_retry" as const,
        verification_type: vtForEvidence,
        reason: autoReason || "ai_uncertain",
        steps: normalizedRetrySteps,
        headline: "Please retry face verification.",
        summary: "Your account is NOT rejected. We could not safely approve this scan automatically, so please retake the required photo/live scan in good light with only your face visible.",
        failed_evidence: normalizedRetrySteps.map((step) => ({
          label: step,
          human_name: step === "host_gallery" ? "Host Profile Photos" : step === "photo" ? "Profile Photo" : "Live Face Scan",
          step,
          score: null,
          message: step === "host_gallery"
            ? "Please upload 3 clear host profile photos where your face is visible."
            : step === "photo"
              ? "Please upload a clear profile photo that shows only your face."
              : "Please retake the live face scan in good light with only your face in the frame.",
        })),
      };
      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          status: "needs_retry",
          rejection_reason: null,
          reviewed_at: null,
          ai_analysis: duplicateBlock
            ? { ...existingAnalysis, rekognition, duplicate_account: duplicateBlock, retry_required: retryRequired }
            : { ...existingAnalysis, rekognition, retry_required: retryRequired },
          admin_notes: `${summary}${evidenceSummary}\n[needs_retry] ${reviewReason}${flagsLine}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId)
        .in("status", ["submitted", "pending", "under_review", "needs_retry"]);

      const alreadyApprovedForFallbackRetry = await markProfileNeedsRetryUnlessAlreadyApproved(supabaseAdmin, userId);
      try {
        if (!alreadyApprovedForFallbackRetry) {
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            type: "face_verification_retry",
            title: "Verification Needs Retry",
            message: "We could not safely approve this scan automatically. Please retry with a clear photo and live face scan in good light.",
            data: {
              action_url: "/face-verification",
              reason: autoReason || "ai_uncertain",
              steps: normalizedRetrySteps,
              submission_id: submissionId,
            },
            is_read: false,
          });
        }
      } catch (notifyErr) {
        console.warn("[face-verification-analyze] fallback retry notification failed:", notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        rekognition,
        autoFinalize: autoResult,
        blocker: null, // soft flags never block client-side anymore
        declaredGender,
        expectedGender,
        detectedGender: rawG,
      }),

      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[face-verification-analyze]", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    // Self-heal: never leave the submission frozen in `under_review` /
    // `pending` because the function crashed. Mark it `needs_retry` with a
    // clear English notification so the user can re-shoot immediately.
    if (activeAdmin && activeSubmissionId) {
      try {
        await activeAdmin
          .from("face_verification_submissions")
          .update({
            status: "needs_retry",
            rejection_reason: null,
            reviewed_at: null,
            admin_notes: `[needs_retry] analyzer crashed: ${msg}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", activeSubmissionId)
          .in("status", ["submitted", "pending", "under_review", "needs_retry"]);
        if (activeUserId && !(await hasApprovedFaceState(activeAdmin, activeUserId))) {
          await activeAdmin.from("notifications").insert({
            user_id: activeUserId,
            type: "face_verification_retry",
            title: "Face Verification — Please Retry",
            message: "We could not process your face verification this time. Please retake your photo, live face scan and intro video in good light and submit again.",
            data: { route: "/face-verification", reason: "analyzer_error" },
          });
        }
      } catch (healErr) {
        console.error("[face-verification-analyze] self-heal failed:", healErr instanceof Error ? healErr.message : healErr);
      }
    }
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
