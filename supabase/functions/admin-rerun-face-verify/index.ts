// admin-rerun-face-verify
// Admin-only: re-runs AWS Rekognition (DetectFaces + CompareFaces) for an
// existing face_verification_submissions row and updates admin_notes +
// confidence_score. Status stays as-is — admin still decides Approve/Reject
// from the panel. Used when the original auto-face-verify failed mid-flight
// or when admin wants a fresh AWS opinion.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdminSession } from "../_shared/adminAuth.ts";

type ImagescriptModule = typeof import("https://deno.land/x/imagescript@1.2.17/mod.ts");
let imagescriptPromise: Promise<ImagescriptModule> | null = null;
function loadImagescript(): Promise<ImagescriptModule> {
  if (!imagescriptPromise) imagescriptPromise = import("https://deno.land/x/imagescript@1.2.17/mod.ts");
  return imagescriptPromise;
}

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

const MAX_REK_BYTES = 4_500_000;
const MAX_REK_DIMENSION = 1600;
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

function evidenceUrl(analysis: unknown, key: string): string | null {
  const root = analysis && typeof analysis === "object" ? analysis as Record<string, unknown> : {};
  const evidence = root.evidence_urls && typeof root.evidence_urls === "object"
    ? root.evidence_urls as Record<string, unknown>
    : {};
  const value = evidence[key];
  return typeof value === "string" && value.trim() ? value : null;
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
  const raw = (url || "").trim().replace(/^\/+/, "");
  const rawMatch = raw.match(/^(face-verification|host-verification)\/(.+)$/);
  if (rawMatch) return { bucket: rawMatch[1], path: rawMatch[2] };
  try {
    const u = new URL(url);
    const proxyMatch = u.pathname.match(/\/functions\/v1\/public-profile-avatar\/(.+)$/);
    if (proxyMatch?.[1]) {
      const proxyPath = decodeURIComponent(proxyMatch[1]);
      if (!proxyPath.includes("..")) return { bucket: "face-verification", path: proxyPath };
    }
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/);
    if (!m) return null;
    return { bucket: decodeURIComponent(m[1]), path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

async function normalizeImageBytes(bytes: Uint8Array): Promise<Uint8Array> {
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if ((isJpeg || isPng) && bytes.length <= MAX_REK_BYTES) return bytes;

  try {
    const { decode: decodeImage, Image } = await loadImagescript();
    const img = await decodeImage(bytes);
    if (!(img instanceof Image)) throw new Error("decoded_non_image");
    const longest = Math.max(img.width, img.height);
    if (longest > MAX_REK_DIMENSION) {
      const scale = MAX_REK_DIMENSION / longest;
      img.resize(Math.max(1, Math.round(img.width * scale)), Math.max(1, Math.round(img.height * scale)));
    }
    for (const q of [85, 75, 65, 55, 45]) {
      const out = await img.encodeJPEG(q);
      if (out.length <= MAX_REK_BYTES) return new Uint8Array(out);
    }
    img.resize(Math.max(1, Math.round(img.width / 2)), Math.max(1, Math.round(img.height / 2)));
    const out = await img.encodeJPEG(40);
    if (out.length > MAX_REK_BYTES) throw new Error("image_too_large_after_compression");
    return new Uint8Array(out);
  } catch (decodeErr) {
    if (bytes.length > MAX_REK_BYTES) throw new Error(`image_too_large:${bytes.length}`);
    throw new Error(`image_unreadable:${decodeErr instanceof Error ? decodeErr.message : "decode_failed"}`);
  }
}

async function fetchImageBytes(url: string, supabaseAdmin: ReturnType<typeof createClient>): Promise<Uint8Array> {
  const parsed = parseStorageUrl(url);
  let bytes: Uint8Array;
  if (parsed) {
    try {
      const { data } = await supabaseAdmin.storage
        .from(parsed.bucket)
        .download(parsed.path, { transform: { width: 1280, quality: 80, resize: "contain" } });
      if (data) {
        const transformed = new Uint8Array(await data.arrayBuffer());
        if (transformed.length > 0 && transformed.length <= MAX_REK_BYTES) return transformed;
      }
    } catch { /* fall back to raw download */ }
    const { data, error } = await supabaseAdmin.storage.from(parsed.bucket).download(parsed.path);
    if (error || !data) throw new Error(`storage download failed: ${error?.message || "no data"}`);
    bytes = new Uint8Array(await data.arrayBuffer());
  } else {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Failed to fetch image: ${r.status}`);
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  return normalizeImageBytes(bytes);
}

// Owner policy (2026-06-26): same-submission photo/video/live comparisons pass
// at 55%+ to avoid false rejection of genuine real users under weak lighting,
// beauty filters, compression, or camera-angle differences.
const MIN_FACE_MATCH_PERCENTAGE = 55;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let activeAdmin: ReturnType<typeof createClient> | null = null;
  let activeSubmissionId: string | null = null;
  let workerAcquired = false;
  let jobDoneSuccess = true;
  let jobDoneError: string | null = null;

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
    activeAdmin = supabaseAdmin;

    const adminAuth = await requireAdminSession(req, supabaseAdmin, {
      sectionKey: "face-verification",
      requireEdit: true,
    });
    if (!adminAuth.ok) {
      return new Response(JSON.stringify({ error: adminAuth.error }), {
        status: adminAuth.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { submissionId } = await req.json().catch(() => ({}));
    if (!submissionId) {
      return new Response(JSON.stringify({ error: "submissionId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    activeSubmissionId = submissionId;

    const { data: submission, error: subErr } = await supabaseAdmin
      .from("face_verification_submissions")
      .select("id, user_id, status, profile_photo_url, face_image_url, selfie_url, front_url, left_url, right_url, video_url, host_photos, verification_type, admin_notes, ai_analysis")
      .eq("id", submissionId)
      .maybeSingle();

    if (subErr || !submission) {
      return new Response(JSON.stringify({ error: "Submission not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pick the best still image first. face_image_url is usually a video, while
    // front/selfie are the captured still frames used by the auto analyzer.
    const hostPhotoUrls = Array.isArray(submission.host_photos) ? submission.host_photos.filter((v: unknown): v is string => typeof v === "string" && !!v.trim()) : [];
    const liveFaceUrl: string | null = firstUsableStillUrl(
      submission.front_url,
      submission.selfie_url,
      evidenceUrl(submission.ai_analysis, "live_face_scan_url"),
      evidenceUrl(submission.ai_analysis, "face_video_frame_url"),
      hostPhotoUrls[0],
    );
    const leftFaceUrl: string | null = firstUsableStillUrl(submission.left_url, evidenceUrl(submission.ai_analysis, "left_url"), evidenceUrl(submission.ai_analysis, "left_face_scan_url"));
    const rightFaceUrl: string | null = firstUsableStillUrl(submission.right_url, evidenceUrl(submission.ai_analysis, "right_url"), evidenceUrl(submission.ai_analysis, "right_face_scan_url"));

    const referenceUrl: string | null = firstUsableStillUrl(submission.profile_photo_url, evidenceUrl(submission.ai_analysis, "profile_photo_url"));
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

    const lockEligible = ["pending", "submitted", "under_review", "needs_retry", "user_retry"].includes(String(submission.status || "").toLowerCase());
    if (lockEligible) {
      const { data: lockOk, error: lockErr } = await supabaseAdmin.rpc("try_lock_face_submission_for_analysis", { p_submission_id: submissionId });
      if (lockErr) throw lockErr;
      if (lockOk === false) {
        return new Response(JSON.stringify({ ok: false, error: "Analysis is already running or submission is not eligible." }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      workerAcquired = true;
    }

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
    const [leftBytes, rightBytes] = await Promise.all([
      leftFaceUrl ? fetchImageBytes(leftFaceUrl, supabaseAdmin).catch(() => null) : Promise.resolve(null),
      rightFaceUrl ? fetchImageBytes(rightFaceUrl, supabaseAdmin).catch(() => null) : Promise.resolve(null),
    ]);

    // DetectFaces
    const detect = await rekognitionCall(
      "DetectFaces",
      { Image: { Bytes: uint8ToBase64(liveBytes) }, Attributes: ["ALL"] },
      AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION,
    );
    const faceDetails = detect.FaceDetails || [];
    const face = faceDetails[0] || null;
    const [leftDetect, rightDetect] = await Promise.all([
      leftBytes ? rekognitionCall("DetectFaces", { Image: { Bytes: uint8ToBase64(leftBytes) }, Attributes: ["ALL"] }, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION).catch(() => null) : Promise.resolve(null),
      rightBytes ? rekognitionCall("DetectFaces", { Image: { Bytes: uint8ToBase64(rightBytes) }, Attributes: ["ALL"] }, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION).catch(() => null) : Promise.resolve(null),
    ]);
    const leftDetails = (leftDetect as any)?.FaceDetails || [];
    const rightDetails = (rightDetect as any)?.FaceDetails || [];
    const leftFace = leftDetails[0] || null;
    const rightFace = rightDetails[0] || null;

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

    let compareFL = 0;
    let compareFR = 0;
    if (faceDetails.length === 1 && leftDetails.length === 1 && rightDetails.length === 1 && leftBytes && rightBytes) {
      const [fl, fr] = await Promise.all([
        rekognitionCall("CompareFaces", { SourceImage: { Bytes: uint8ToBase64(liveBytes) }, TargetImage: { Bytes: uint8ToBase64(leftBytes) }, SimilarityThreshold: 0 }, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION).catch(() => null),
        rekognitionCall("CompareFaces", { SourceImage: { Bytes: uint8ToBase64(liveBytes) }, TargetImage: { Bytes: uint8ToBase64(rightBytes) }, SimilarityThreshold: 0 }, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION).catch(() => null),
      ]);
      compareFL = Math.max(...(((fl as any)?.FaceMatches || []).map((m: any) => Number(m?.Similarity || 0))), 0);
      compareFR = Math.max(...(((fr as any)?.FaceMatches || []).map((m: any) => Number(m?.Similarity || 0))), 0);
    }

    const rawGender = face?.Gender?.Value === "Female" ? "female" : face?.Gender?.Value === "Male" ? "male" : "unknown";
    const genderConfidence = Number(face?.Gender?.Confidence || 0);
    const leftGender = leftFace?.Gender?.Value === "Female" ? "female" : leftFace?.Gender?.Value === "Male" ? "male" : "unknown";
    const rightGender = rightFace?.Gender?.Value === "Female" ? "female" : rightFace?.Gender?.Value === "Male" ? "male" : "unknown";
    const genderConflict = rawGender !== "unknown" && (
      (leftGender !== "unknown" && leftGender !== rawGender && Number(leftFace?.Gender?.Confidence || 0) >= 90) ||
      (rightGender !== "unknown" && rightGender !== rawGender && Number(rightFace?.Gender?.Confidence || 0) >= 90)
    );
    const frontError = faceDetails.length === 0 ? "no_face_front" : faceDetails.length > 1 ? "multiple_faces_front" : null;
    const leftError = !leftFaceUrl ? "missing_left_url" : leftDetails.length === 0 ? "no_face_left" : leftDetails.length > 1 ? "multiple_faces_left" : null;
    const rightError = !rightFaceUrl ? "missing_right_url" : rightDetails.length === 0 ? "no_face_right" : rightDetails.length > 1 ? "multiple_faces_right" : null;
    const finalGender = !frontError && !genderConflict && genderConfidence >= 86 ? rawGender : "unknown";
    const rekognitionBlock: Record<string, unknown> = {
      version: 1,
      source: "admin-rerun-face-verify",
      face_count: faceDetails.length,
      left_face_count: leftDetails.length,
      right_face_count: rightDetails.length,
      face_confidence: Number(face?.Confidence || 0),
      gender_value: rawGender,
      gender_confidence: genderConfidence,
      left_gender_value: leftGender,
      left_gender_confidence: Number(leftFace?.Gender?.Confidence || 0),
      right_gender_value: rightGender,
      right_gender_confidence: Number(rightFace?.Gender?.Confidence || 0),
      gender_conflict: genderConflict,
      final_gender: finalGender,
      compare_front_left: compareFL,
      compare_front_right: compareFR,
      front_pose_yaw: face?.Pose?.Yaw ?? null,
      left_pose_yaw: leftFace?.Pose?.Yaw ?? null,
      right_pose_yaw: rightFace?.Pose?.Yaw ?? null,
      age_range_low: face?.AgeRange?.Low ?? null,
      age_range_high: face?.AgeRange?.High ?? null,
      face_occluded_confidence: face?.FaceOccluded?.Value === true ? Number(face?.FaceOccluded?.Confidence || 0) : 0,
      profile_match_score: finalReferenceUrl ? matchPct : null,
      profile_mismatch: finalReferenceUrl ? matchPct < MIN_FACE_MATCH_PERCENTAGE : false,
      replay_suspected: false,
      liveness_failed: false,
    };
    if (frontError) rekognitionBlock.front_error = frontError;
    if (leftError) rekognitionBlock.left_error = leftError;
    if (rightError) rekognitionBlock.right_error = rightError;

    const existingAnalysis = (submission.ai_analysis && typeof submission.ai_analysis === "object") ? submission.ai_analysis as Record<string, unknown> : {};
    const newNote = `[Re-run @ ${new Date().toISOString()}] ${compareSummary}. ${detectSummary}. Side match F/L=${compareFL.toFixed(1)}% F/R=${compareFR.toFixed(1)}%.`;
    await supabaseAdmin
      .from("face_verification_submissions")
      .update({
        admin_notes: `${newNote}${submission.admin_notes ? "\n---\n" + submission.admin_notes : ""}`,
        ai_analysis: { ...existingAnalysis, rekognition: rekognitionBlock },
        confidence_score: matchPct,
        rekognition_confidence: Number(face?.Confidence || 0),
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    let autoFinalize: Record<string, unknown> | null = null;
    if (["pending", "submitted", "under_review", "needs_retry", "user_retry"].includes(String(submission.status || "").toLowerCase())) {
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("service_auto_finalize_face_verification", { p_submission_id: submissionId });
      autoFinalize = rpcErr ? { success: false, error: rpcErr.message } : rpcData as Record<string, unknown>;
    }

    return new Response(JSON.stringify({
      ok: true,
      faceMatchPercentage: matchPct,
      requiredPercentage: MIN_FACE_MATCH_PERCENTAGE,
      facesDetected: faceDetails.length,
      gender: face?.Gender?.Value || null,
      genderConfidence: face?.Gender?.Confidence || 0,
      sideMatchFrontLeft: compareFL,
      sideMatchFrontRight: compareFR,
      autoFinalize,
      note: newNote,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[admin-rerun-face-verify] error:", err);
    jobDoneSuccess = false;
    jobDoneError = (err as Error)?.message || "Unknown error";
    return new Response(JSON.stringify({ error: (err as Error)?.message || "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (workerAcquired && activeAdmin && activeSubmissionId) {
      await activeAdmin.rpc("mark_face_analysis_job_done", {
        p_submission_id: activeSubmissionId,
        p_success: jobDoneSuccess,
        p_error: jobDoneError,
      }).catch((doneErr: unknown) => {
        console.warn("[admin-rerun-face-verify] job completion marker failed:", doneErr instanceof Error ? doneErr.message : doneErr);
      });
    }
  }
});
