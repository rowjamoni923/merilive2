// Amazon Rekognition Face Verification v3
// CompareFaces (1:1) + SearchFacesByImage (duplicate detection) + DetectFaces (Gender check)
// Auto-approves at >90% similarity, auto-bans duplicates

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID")!;
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY")!;
const AWS_REGION = Deno.env.get("AWS_REGION") ?? "us-east-1";
const REKOGNITION_COLLECTION = "merilive-verified-faces";
const SIMILARITY_THRESHOLD = 90;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ───────────────── AWS SIGV4 ─────────────────
async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const keyBuf = key instanceof Uint8Array
    ? (key.buffer.slice(key.byteOffset, key.byteOffset + key.byteLength) as ArrayBuffer)
    : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
}

async function signRekognitionRequest(action: string, payload: object): Promise<Response> {
  const service = "rekognition";
  const host = `${service}.${AWS_REGION}.amazonaws.com`;
  const endpoint = `https://${host}/`;
  const body = JSON.stringify(payload);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const target = `RekognitionService.${action}`;
  const canonicalHeaders =
    `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
  const signedHeaders = "content-type;host;x-amz-date;x-amz-target";
  const payloadHash = await sha256Hex(body);

  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`;
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");

  // Derive signing key
  const kDate = await hmac(new TextEncoder().encode("AWS4" + AWS_SECRET_ACCESS_KEY), dateStamp);
  const kRegion = await hmac(kDate, AWS_REGION);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = [...new Uint8Array(await hmac(kSigning, stringToSign))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const authorization =
    `${algorithm} Credential=${AWS_ACCESS_KEY_ID}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Date": amzDate,
      "X-Amz-Target": target,
      "Authorization": authorization,
      "Host": host,
    },
    body,
  });
}

// ───────────────── Helpers ─────────────────
async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < buf.length; i += chunkSize) {
    binary += String.fromCharCode(...buf.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function stripDataUrl(b64: string): string {
  return b64.startsWith("data:") ? b64.split(",")[1] ?? b64 : b64;
}

async function ensureCollection(): Promise<void> {
  // Try to create; ignore if already exists
  const res = await signRekognitionRequest("CreateCollection", {
    CollectionId: REKOGNITION_COLLECTION,
  });
  if (!res.ok) {
    const txt = await res.text();
    if (!txt.includes("ResourceAlreadyExistsException")) {
      console.warn("[Rekognition] CreateCollection warning:", txt);
    }
  } else {
    await res.text();
  }
}

// ───────────────── Main handler ─────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    
    // Get user from token
    const { data: userData, error: claimsErr } = await supabaseAdmin.auth.getUser(token);
    if (claimsErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    // Fetch user profile to check target gender
    const { data: profile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('gender, display_name')
      .eq('id', userId)
      .single();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Body
    const body = await req.json().catch(() => ({}));
    const liveFaceB64Raw: string | undefined = body.p_live_face_base64 ?? body.live_face_base64;
    const profilePhotoUrl: string | undefined = body.p_profile_photo_url ?? body.profile_photo_url;

    if (!liveFaceB64Raw || !profilePhotoUrl) {
      return new Response(
        JSON.stringify({
          isMatch: false,
          confidence: 0,
          error_code: "MISSING_PARAMS",
          error: "p_live_face_base64 and p_profile_photo_url required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const liveFaceB64 = stripDataUrl(liveFaceB64Raw);
    const profilePhotoB64 = await fetchImageAsBase64(profilePhotoUrl);

    // Ensure collection exists
    await ensureCollection();

    // ── Step 1: DetectFaces (Gender check) ──
    const detectRes = await signRekognitionRequest("DetectFaces", {
      Image: { Bytes: liveFaceB64 },
      Attributes: ["GENDER"],
    });

    let detectedGender: string | null = null;
    let genderConfidence = 0;

    if (detectRes.ok) {
      const detectData = await detectRes.json();
      const faceDetails = detectData.FaceDetails ?? [];
      if (faceDetails.length > 0) {
        detectedGender = faceDetails[0].Gender?.Value ?? null;
        genderConfidence = faceDetails[0].Gender?.Confidence ?? 0;
      }
    }

    // Professional gender mismatch check
    // If user is registered as female but detected as male (with high confidence)
    if (profile.gender === 'female' && detectedGender === 'Male' && genderConfidence > 85) {
      return new Response(
        JSON.stringify({
          isMatch: false,
          confidence: 0,
          error_code: "GENDER_MISMATCH",
          error: "Gender mismatch detected. You are registered as female, but a male face was detected. If this is an error, please contact support.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Step 2: CompareFaces (1:1) ──
    const compareRes = await signRekognitionRequest("CompareFaces", {
      SourceImage: { Bytes: liveFaceB64 },
      TargetImage: { Bytes: profilePhotoB64 },
      SimilarityThreshold: 70,
      QualityFilter: "AUTO",
    });

    if (!compareRes.ok) {
      const errTxt = await compareRes.text();
      console.error("[Rekognition CompareFaces] error:", errTxt);
      return new Response(
        JSON.stringify({
          isMatch: false,
          confidence: 0,
          error_code: "REKOGNITION_ERROR",
          error: "Face detection service is temporarily unavailable. Please try again later.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const compareData = await compareRes.json();
    const matches = compareData.FaceMatches ?? [];

    if (matches.length === 0) {
      return new Response(
        JSON.stringify({
          isMatch: false,
          confidence: 0,
          error_code: "NO_FACE_MATCH",
          error: "Live face did not match the profile photo. Please ensure you are the same person as in the profile picture and try again with better lighting.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const confidence: number = matches[0].Similarity ?? 0;
    const isMatch = confidence >= SIMILARITY_THRESHOLD;

    // ── Step 3: SearchFacesByImage (duplicate detection) ──
    let duplicateUserId: string | null = null;
    let duplicateUserName: string | null = null;
    let rekognitionFaceId: string | null = null;

    const searchRes = await signRekognitionRequest("SearchFacesByImage", {
      CollectionId: REKOGNITION_COLLECTION,
      Image: { Bytes: liveFaceB64 },
      MaxFaces: 1,
      FaceMatchThreshold: 90,
      QualityFilter: "AUTO",
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      const faceMatches = searchData.FaceMatches ?? [];
      if (faceMatches.length > 0) {
        const matched = faceMatches[0];
        const externalId = matched.Face?.ExternalImageId as string | undefined;
        rekognitionFaceId = matched.Face?.FaceId ?? null;
        if (externalId && externalId !== userId) {
          duplicateUserId = externalId;
          // Fetch duplicate user's name
          const { data: dupUser } = await supabaseAdmin
            .from('profiles')
            .select('display_name')
            .eq('id', duplicateUserId)
            .maybeSingle();
          if (dupUser) {
            duplicateUserName = dupUser.display_name;
          }
        }
      }
    }

    // ── Step 4: If approved & no duplicate, index face into collection ──
    if (isMatch && !duplicateUserId) {
      const indexRes = await signRekognitionRequest("IndexFaces", {
        CollectionId: REKOGNITION_COLLECTION,
        Image: { Bytes: liveFaceB64 },
        ExternalImageId: userId,
        DetectionAttributes: [],
        MaxFaces: 1,
        QualityFilter: "AUTO",
      });
      if (indexRes.ok) {
        const indexData = await indexRes.json();
        const records = indexData.FaceRecords ?? [];
        if (records.length > 0) {
          rekognitionFaceId = records[0].Face?.FaceId ?? rekognitionFaceId;
        }
      }
    }

    // ── Step 5: Persist via DB function ──
    const { data: dbResult, error: dbErr } = await supabaseAdmin.rpc(
      "process_face_verification_v3",
      {
        p_user_id: userId,
        p_is_match: isMatch,
        p_confidence: confidence,
        p_face_rekognition_id: rekognitionFaceId,
        p_profile_photo_url: profilePhotoUrl,
        p_live_face_url: null,
        p_duplicate_user_id: duplicateUserId,
      },
    );

    if (dbErr) {
      console.error("[DB process_face_verification_v3]:", dbErr);
      return new Response(
        JSON.stringify({
          isMatch,
          confidence,
          error_code: "DB_ERROR",
          error: "Failed to save verification results. Please try again.",
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // If duplicate found, override response with professional message
    if (duplicateUserId) {
      return new Response(
        JSON.stringify({
          isMatch: false,
          confidence,
          error_code: "DUPLICATE_FACE",
          duplicate_of: duplicateUserId,
          error: `Multiple accounts detected. This face is already verified under the account: "${duplicateUserName || 'Another User'}". Please contact support if you believe this is an error.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(dbResult), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[process-face-verification-v3] fatal:", err);
    return new Response(
      JSON.stringify({
        isMatch: false,
        confidence: 0,
        error_code: "INTERNAL_ERROR",
        error: "An unexpected error occurred during face verification. Please try again later.",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
