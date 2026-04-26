// Amazon Rekognition Face Verification v3
// CompareFaces (1:1) + SearchFacesByImage (duplicate detection)
// Auto-approves at >90% similarity, auto-bans duplicates

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

    const supabaseUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabaseUser.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

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

    // ── Step 1: CompareFaces (1:1) ──
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
          error: errTxt,
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
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const confidence: number = matches[0].Similarity ?? 0;
    const isMatch = confidence >= SIMILARITY_THRESHOLD;

    // ── Step 2: SearchFacesByImage (duplicate detection) ──
    let duplicateUserId: string | null = null;
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
        }
      }
    } else {
      const t = await searchRes.text();
      // InvalidParameterException = no face detected; safe to ignore
      if (!t.includes("InvalidParameterException")) {
        console.warn("[Rekognition SearchFacesByImage]:", t);
      }
    }

    // ── Step 3: If approved & no duplicate, index face into collection ──
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
      } else {
        const t = await indexRes.text();
        console.warn("[Rekognition IndexFaces]:", t);
      }
    }

    // ── Step 4: Persist via DB function ──
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
          error: dbErr.message,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
        error: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
