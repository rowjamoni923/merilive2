/**
 * Post-submit Rekognition pass for Section-07 three-angle flow:
 * DetectFaces(front) + CompareFaces(front↔left, front↔right).
 * Writes ai_analysis + rekognition_confidence; optionally calls
 * service_auto_finalize_face_verification when app_settings allows.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  // Prefer service-role storage download when this is a Supabase storage URL
  // (the face-verification bucket is private — public fetch would 400).
  const parsed = parseStorageUrl(url);
  if (parsed) {
    const { data, error } = await supabaseAdmin.storage.from(parsed.bucket).download(parsed.path);
    if (error || !data) throw new Error(`storage_download_failed:${error?.message || "no_data"}`);
    return new Uint8Array(await data.arrayBuffer());
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch image ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID");
    const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY");
    const AWS_REGION = Deno.env.get("AWS_REGION") || "ap-south-1";
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      throw new Error("AWS credentials not configured");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const { submissionId } = await req.json() as { submissionId?: string };
    if (!submissionId) {
      return new Response(JSON.stringify({ error: "submissionId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: row, error: rowErr } = await supabaseAdmin
      .from("face_verification_submissions")
      .select("id,user_id,status,front_url,left_url,right_url,selfie_url,face_image_url")
      .eq("id", submissionId)
      .maybeSingle();

    if (rowErr || !row) {
      return new Response(JSON.stringify({ error: "Submission not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (row.user_id !== userId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const st = String(row.status || "").trim().toLowerCase();
    // DB normalizes newly inserted "submitted" rows to "pending" before the
    // edge function can read them. Both mean "ready for AI analysis" here.
    if (st !== "submitted" && st !== "pending") {
      return new Response(JSON.stringify({ error: "Submission not analyzable", status: row.status }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const frontUrl = row.front_url || row.face_image_url || row.selfie_url;
    const leftUrl = row.left_url;
    const rightUrl = row.right_url;
    if (!frontUrl || !leftUrl || !rightUrl) {
      return new Response(JSON.stringify({ error: "Missing angle URLs" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let frontBytes: Uint8Array;
    let leftBytes: Uint8Array;
    let rightBytes: Uint8Array;
    try {
      frontBytes = await fetchImageBytes(frontUrl, supabaseAdmin);
      leftBytes = await fetchImageBytes(leftUrl, supabaseAdmin);
      rightBytes = await fetchImageBytes(rightUrl, supabaseAdmin);
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
          ai_analysis: { ...existingAnalysis, rekognition },
          admin_notes: `Rekognition: image fetch failed — ${msg}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
      return new Response(JSON.stringify({ ok: false, error: msg }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [det, leftDet, rightDet] = await Promise.all([
      detectFaces(frontBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION),
      detectFaces(leftBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION),
      detectFaces(rightBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION),
    ]);
    const details = (det.FaceDetails as Record<string, unknown>[] | undefined) ?? [];
    const leftDetails = (leftDet.FaceDetails as Record<string, unknown>[] | undefined) ?? [];
    const rightDetails = (rightDet.FaceDetails as Record<string, unknown>[] | undefined) ?? [];

    let compareFL = 0;
    let compareFR = 0;
    if (details.length === 1 && leftDetails.length === 1 && rightDetails.length === 1) {
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
    let finalGender: string = genderConf >= 86 && rawG !== "unknown" && !genderConflict ? rawG : "unknown";
    const occConf = faceOccluded?.Value === true ? Number(faceOccluded?.Confidence ?? 0) : 0;

    let frontError: string | null = null;
    if (details.length === 0) frontError = "no_face_front";
    else if (details.length > 1) frontError = "multiple_faces_front";
    let leftError: string | null = null;
    if (leftDetails.length === 0) leftError = "no_face_left";
    else if (leftDetails.length > 1) leftError = "multiple_faces_left";
    let rightError: string | null = null;
    if (rightDetails.length === 0) rightError = "no_face_right";
    else if (rightDetails.length > 1) rightError = "multiple_faces_right";

    if (frontError || leftError || rightError) finalGender = "unknown";

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

    const summary =
      `Rekognition: faces F/L/R=${details.length}/${leftDetails.length}/${rightDetails.length}` +
      `${frontError || leftError || rightError ? ` (${[frontError, leftError, rightError].filter(Boolean).join(", ")})` : ""}, ` +
      `gender=${rawG} (${genderConf.toFixed(1)}%)${genderConflict ? " conflict" : ""}, ` +
      `match FL=${compareFL.toFixed(1)}% FR=${compareFR.toFixed(1)}%, faceConf=${faceConf.toFixed(1)}%`;

    // Re-read ai_analysis right before the merge so we never blow away client-set
    // flags like { manual_review_required: true } that the insert wrote.
    const { data: existingRow } = await supabaseAdmin
      .from("face_verification_submissions")
      .select("ai_analysis")
      .eq("id", submissionId)
      .maybeSingle();
    const existingAnalysis = (existingRow?.ai_analysis ?? {}) as Record<string, unknown>;
    const mergedAnalysis = { ...existingAnalysis, rekognition };

    await supabaseAdmin
      .from("face_verification_submissions")
      .update({
        ai_analysis: mergedAnalysis,
        rekognition_confidence: faceConf,
        admin_notes: summary,
        updated_at: new Date().toISOString(),
      })
      .eq("id", submissionId);

    const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(
      "service_auto_finalize_face_verification",
      { p_submission_id: submissionId },
    );
    const autoResult = !rpcErr ? rpcData as Record<string, unknown> : null;
    if (rpcErr) console.warn("[face-verification-analyze] auto-finalize:", rpcErr.message);

    // ★ NEVER auto-reject. If auto-approve cannot safely fire, leave the row in
    //   `submitted` so admin sees it in Pending and reviews manually. The previous
    //   auto-reject branch on invalid_face_count / front_error / underage /
    //   face_occluded produced many false rejections (Rekognition age is
    //   unreliable for women, "occluded" misfires on glasses/hair/lighting,
    //   borderline face counts happen at frame boundary). Falling through to
    //   admin review is always safer than rejecting a real user.
    const autoReason = String(autoResult?.reason || "");
    if (!autoResult?.success) {
      const reviewReason = autoReason === "invalid_face_count"
        ? `Needs admin review: ${details.length === 0 ? "no clear face on front frame" : "multiple faces on front frame"}.`
        : autoReason === "underage"
          ? "Needs admin review: AI age estimate borderline (often unreliable for women)."
          : autoReason === "face_occluded"
            ? "Needs admin review: AI flagged possible occlusion (glasses/hair/lighting can trigger this)."
            : autoReason === "gender_unknown" || autoReason === "low_gender_confidence"
              ? "Needs admin review: gender confidence below auto-approve threshold."
              : autoReason === "low_compare_score" || autoReason === "low_similarity"
                ? "Needs admin review: front-vs-side angle similarity below auto-approve threshold."
                : `Needs admin review: ${autoReason || "AI could not safely auto-approve"}.`;
      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          // status stays pending/submitted — admin Pending tab will show it.
          admin_notes: `${summary}\n[manual-review] ${reviewReason}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId)
        .in("status", ["submitted", "pending"]);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        rekognition,
        autoFinalize: autoResult,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[face-verification-analyze]", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
