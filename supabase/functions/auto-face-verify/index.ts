import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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

// Safe base64 encoder that doesn't overflow the stack for large buffers
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

async function callRekognition(imageBytes: Uint8Array, accessKey: string, secretKey: string, region: string) {
  const service = "rekognition";
  const host = `rekognition.${region}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const { amzDate, dateStamp } = getAmzDate();

  const base64Image = uint8ToBase64(imageBytes);

  const requestBody = JSON.stringify({
    Image: { Bytes: base64Image },
    Attributes: ["ALL"],
  });

  const payloadHash = await sha256Hash(requestBody);
  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:RekognitionService.DetectFaces\n`;
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
      "X-Amz-Target": "RekognitionService.DetectFaces",
      "Authorization": authHeader,
      "Host": host,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Rekognition error:", response.status, errText);
    throw new Error(`Rekognition API error: ${response.status}`);
  }

  return await response.json();
}

const MIN_FACE_MATCH_PERCENTAGE = 76;
const MIN_FACE_VIDEO_SECONDS = 10;
const MIN_INTRO_VIDEO_SECONDS = 10;

function hasCompleteHostRequirements(submission: {
  full_name?: string | null;
  age?: number | null;
  language?: string | null;
  profile_photo_url?: string | null;
  video_url?: string | null;
  host_photos?: string[] | null;
} | null): boolean {
  if (!submission) return false;

  return Boolean(
    submission.full_name?.trim() &&
    (submission.age || 0) >= 18 &&
    submission.language?.trim() &&
    submission.profile_photo_url &&
    submission.video_url &&
    Array.isArray(submission.host_photos) &&
    submission.host_photos.length === 3
  );
}

async function fetchImageBytes(imageUrl: string): Promise<Uint8Array> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch reference image: ${response.status}`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function callRekognitionCompareFaces(
  sourceImageBytes: Uint8Array,
  targetImageBytes: Uint8Array,
  accessKey: string,
  secretKey: string,
  region: string,
) {
  const service = "rekognition";
  const host = `rekognition.${region}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const { amzDate, dateStamp } = getAmzDate();

  const sourceBase64 = uint8ToBase64(sourceImageBytes);
  const targetBase64 = uint8ToBase64(targetImageBytes);

  const requestBody = JSON.stringify({
    SourceImage: { Bytes: sourceBase64 },
    TargetImage: { Bytes: targetBase64 },
    SimilarityThreshold: 0,
  });

  const payloadHash = await sha256Hash(requestBody);
  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:RekognitionService.CompareFaces\n`;
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
      "X-Amz-Target": "RekognitionService.CompareFaces",
      "Authorization": authHeader,
      "Host": host,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Rekognition CompareFaces error:", response.status, errText);
    throw new Error(`Rekognition CompareFaces API error: ${response.status}`);
  }

  return await response.json();
}

function fallbackRejectMessage(params: {
  reasonCode: string;
  faceMatchPercentage: number | null;
  requiredPercentage: number;
}) {
  const { reasonCode, faceMatchPercentage, requiredPercentage } = params;

  const byCode: Record<string, string> = {
    no_face_detected: "No face detected. Please adjust lighting and try again.",
    multiple_faces: "Multiple faces detected. Please ensure only your face is visible.",
    reference_image_missing: "Reference image not found. Please upload a clear profile photo first.",
    face_video_too_short: "Face verification video must be at least 10 seconds long.",
    intro_video_too_short: "Intro video must be at least 10 seconds long.",
    incomplete_host_requirements: "All information, photos, and videos must be completed for host verification.",
    face_match_below_threshold: `Face match ${faceMatchPercentage?.toFixed(1) ?? "0.0"}% — minimum ${requiredPercentage}% required.`,
    underage: "Verification declined — you must be at least 18 years old.",
    face_occluded: "Verification declined — your face appears to be covered.",
  };

  return byCode[reasonCode] || `Face match ${faceMatchPercentage?.toFixed(1) ?? "0.0"}% — minimum ${requiredPercentage}% required.`;
}

async function generateAIRejectMessage(params: {
  reasonCode: string;
  faceMatchPercentage: number | null;
  requiredPercentage: number;
  extraContext?: string;
}) {
  const fallback = fallbackRejectMessage(params);
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return fallback;

  try {
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: "You write very short English rejection reasons for identity verification. Keep under 22 words, include numeric percentages when provided, no markdown.",
          },
          {
            role: "user",
            content: `Reason code: ${params.reasonCode}\nFace match: ${params.faceMatchPercentage ?? "N/A"}\nRequired: ${params.requiredPercentage}\nExtra: ${params.extraContext ?? ""}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) return fallback;

    const payload = await aiResponse.json();
    const text = payload?.choices?.[0]?.message?.content?.trim();
    return text || fallback;
  } catch (err) {
    console.error("[auto-face-verify] AI reason fallback:", err);
    return fallback;
  }
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

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub as string;
    const {
      imageBase64,
      submissionId,
      introVideoDurationSeconds,
      faceVideoDurationSeconds,
    } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let hostSubmissionRequested = false;
    let referenceImageUrl: string | null = null;
    let profileRow: { avatar_url: string | null; is_host: boolean | null; gender?: string | null; host_photos?: string[] | null } | null = null;
    let submissionRow: {
      verification_type?: string | null;
      full_name?: string | null;
      age?: number | null;
      language?: string | null;
      profile_photo_url?: string | null;
      video_url?: string | null;
      host_photos?: string[] | null;
      face_image_url?: string | null;
    } | null = null;

    const rejectWithReason = async (params: {
      reasonCode: string;
      faceMatchPercentage?: number | null;
      extraContext?: string;
    }) => {
      const match = params.faceMatchPercentage ?? null;
      const aiReason = await generateAIRejectMessage({
        reasonCode: params.reasonCode,
        faceMatchPercentage: match,
        requiredPercentage: MIN_FACE_MATCH_PERCENTAGE,
        extraContext: params.extraContext,
      });

      if (submissionId) {
        await supabaseAdmin
          .from("face_verification_submissions")
          .update({
            status: "rejected",
            rejection_reason: aiReason,
            admin_notes: `Auto-rejected by AI. Reason: ${params.reasonCode}. Face Match: ${(match ?? 0).toFixed(1)}% (min ${MIN_FACE_MATCH_PERCENTAGE}%). ${params.extraContext || ""}`.trim(),
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", submissionId);

        // Auto-send rejection notification to user
        await supabaseAdmin
          .from("notifications")
          .insert({
            user_id: userId,
            type: "verification_rejected",
            title: "⚠️ Verification Failed",
            message: `${aiReason} Please try again with a clear photo and proper lighting.`,
            data: { reason_code: params.reasonCode, face_match: match, required: MIN_FACE_MATCH_PERCENTAGE },
          });
      }

      return new Response(JSON.stringify({
        approved: false,
        rejected: true,
        reason: params.reasonCode,
        matchPercentage: match,
        requiredPercentage: MIN_FACE_MATCH_PERCENTAGE,
        message: aiReason,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    };

    if (submissionId) {
      const { data: submission, error: submissionError } = await supabaseAdmin
        .from("face_verification_submissions")
        .select("verification_type, full_name, age, language, profile_photo_url, video_url, host_photos, face_image_url")
        .eq("id", submissionId)
        .eq("user_id", userId)
        .maybeSingle();

      if (submissionError) {
        console.error("[auto-face-verify] submission validation error:", submissionError);
        throw new Error("Failed to validate submission data");
      }

      submissionRow = submission || null;

      // Get user's avatar_url as fallback reference image
      const { data: pRow } = await supabaseAdmin
        .from("profiles")
        .select("avatar_url, is_host, gender")
        .eq("id", userId)
        .maybeSingle();
      profileRow = pRow;

      // IMPORTANT: Set hostSubmissionRequested BEFORE using it
      hostSubmissionRequested = submissionRow?.verification_type === "host";

      referenceImageUrl = submissionRow?.profile_photo_url || profileRow?.avatar_url || null;

      // For user-type submissions, if no reference image exists at all,
      // we still proceed with face detection only (gender check) to auto-route females to host
      const hasReferenceImage = !!referenceImageUrl;

      if (!hasReferenceImage && hostSubmissionRequested) {
        // Host submissions MUST have profile photo - strict requirement
        return await rejectWithReason({
          reasonCode: "reference_image_missing",
          extraContext: "Profile photo is required for host verification.",
        });
      }

      if (!submission?.face_image_url && !submission?.video_url) {
        return await rejectWithReason({
          reasonCode: "face_video_too_short",
          extraContext: "Face verification video is required. Please record and submit your face video.",
        });
      }

      if (hostSubmissionRequested && !hasCompleteHostRequirements(submission)) {
        return await rejectWithReason({
          reasonCode: "incomplete_host_requirements",
          extraContext: "Host data/media incomplete.",
        });
      }

      if (
        hostSubmissionRequested &&
        typeof introVideoDurationSeconds === "number" &&
        introVideoDurationSeconds < MIN_INTRO_VIDEO_SECONDS
      ) {
        return await rejectWithReason({
          reasonCode: "intro_video_too_short",
          extraContext: `Intro video ${introVideoDurationSeconds}s (< ${MIN_INTRO_VIDEO_SECONDS}s)`,
        });
      }

    } else {
      // No submissionId - reject, we need a proper submission
      return await rejectWithReason({
        reasonCode: "reference_image_missing",
        extraContext: "No submission found. Please complete the verification form first.",
      });
    }

    if (
      typeof faceVideoDurationSeconds === "number" &&
      faceVideoDurationSeconds < MIN_FACE_VIDEO_SECONDS
    ) {
      return await rejectWithReason({
        reasonCode: "face_video_too_short",
        extraContext: `Face video ${faceVideoDurationSeconds}s (< ${MIN_FACE_VIDEO_SECONDS}s)`,
      });
    }

    // Decode base64 image
    const binaryString = atob(imageBase64);
    const imageBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      imageBytes[i] = binaryString.charCodeAt(i);
    }

    // Call AWS Rekognition DetectFaces with ALL attributes
    const result = await callRekognition(imageBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);
    const faceDetails = result.FaceDetails || [];

    console.log(`[auto-face-verify] User: ${userId}, Faces detected: ${faceDetails.length}`);

    if (faceDetails.length === 0) {
      return await rejectWithReason({ reasonCode: "no_face_detected" });
    }

    if (faceDetails.length > 1) {
      return await rejectWithReason({ reasonCode: "multiple_faces" });
    }

    const face = faceDetails[0];
    const confidence = face.Confidence || 0;
    const quality = face.Quality || {};
    const brightness = quality.Brightness || 0;
    const sharpness = quality.Sharpness || 0;
    const eyesOpen = face.EyesOpen;
    const gender = face.Gender;
    const ageRange = face.AgeRange;
    const sunglasses = face.Sunglasses;
    const faceOccluded = face.FaceOccluded;

    // HARD BLOCK
    if (ageRange && ageRange.High && ageRange.High < 18) {
      return await rejectWithReason({ reasonCode: "underage" });
    }

    if (faceOccluded?.Value === true && (faceOccluded?.Confidence || 0) > 90) {
      return await rejectWithReason({ reasonCode: "face_occluded" });
    }

    // Determine gender with STRICT confidence threshold
    // ≥85% = high confidence (trusted for auto-routing)
    // 70-84% = medium confidence (trusted for mismatch detection only)
    // <70% = unknown (too low to rely on)
    const genderConfidence = gender?.Confidence || 0;
    const rawGenderValue = gender?.Value === "Female" ? "female" : "male";
    
    let detectedGender: string;
    let genderTrustLevel: "high" | "medium" | "low";
    
    if (genderConfidence >= 85) {
      detectedGender = rawGenderValue;
      genderTrustLevel = "high";
    } else if (genderConfidence >= 70) {
      detectedGender = rawGenderValue;
      genderTrustLevel = "medium";
    } else {
      detectedGender = "unknown";
      genderTrustLevel = "low";
    }
    
    const isFemaleDetected = detectedGender === "female";
    
    console.log(`[auto-face-verify] Gender: ${detectedGender} (${genderConfidence.toFixed(1)}%, trust=${genderTrustLevel}), Raw: ${gender?.Value}`);

    // ★ GENDER MISMATCH DETECTION — only with HIGH trust (≥85%) ★
    const profileGender = profileRow?.gender?.toLowerCase?.() || null;
    if (profileGender && detectedGender !== "unknown" && genderTrustLevel === "high") {
      const profileIsMale = profileGender === "male";
      const profileIsFemale = profileGender === "female";
      
      if (profileIsMale && isFemaleDetected) {
        // Male account but female face detected → flag & reject
        console.log(`[auto-face-verify] ⚠️ GENDER MISMATCH: Profile=Male, Detected=Female (${genderConfidence.toFixed(1)}%)`);
        
        if (submissionId) {
          await supabaseAdmin
            .from("face_verification_submissions")
            .update({
              status: "rejected",
              rejection_reason: `Gender mismatch detected. Your profile is set to Male but face verification detected Female (${genderConfidence.toFixed(1)}% confidence). If this is incorrect, please contact Support Chat to convert your account.`,
              admin_notes: `AUTO-REJECTED: Gender mismatch. Profile=Male, Rekognition=Female (${genderConfidence.toFixed(1)}%). User may need gender conversion via admin.`,
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", submissionId);
          
          await supabaseAdmin
            .from("notifications")
            .insert({
              user_id: userId,
              type: "verification_rejected",
              title: "⚠️ Gender Mismatch Detected",
              message: "Your face doesn't match your profile gender. Please contact Support to fix your account gender setting.",
              data: { reason_code: "gender_mismatch", detected_gender: "female", profile_gender: "male" },
            });
        }
        
        return new Response(JSON.stringify({
          approved: false,
          rejected: true,
          reason: "gender_mismatch",
          message: `Gender mismatch: Your profile is Male but verification detected Female face (${genderConfidence.toFixed(1)}% confidence). Please contact Support Chat to convert your account.`,
          detectedGender: "female",
          profileGender: "male",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      if (profileIsFemale && !isFemaleDetected && detectedGender === "male") {
        // Female account but male face detected → flag & reject
        console.log(`[auto-face-verify] ⚠️ GENDER MISMATCH: Profile=Female, Detected=Male (${genderConfidence.toFixed(1)}%)`);
        
        if (submissionId) {
          await supabaseAdmin
            .from("face_verification_submissions")
            .update({
              status: "rejected",
              rejection_reason: `Gender mismatch detected. Your profile is set to Female/Host but face verification detected Male (${genderConfidence.toFixed(1)}% confidence). Host accounts are for female users only.`,
              admin_notes: `AUTO-REJECTED: Gender mismatch. Profile=Female, Rekognition=Male (${genderConfidence.toFixed(1)}%). Possible fraud attempt.`,
              reviewed_at: new Date().toISOString(),
            })
            .eq("id", submissionId);
          
          await supabaseAdmin
            .from("notifications")
            .insert({
              user_id: userId,
              type: "verification_rejected",
              title: "⚠️ Verification Rejected",
              message: "Face verification detected a male face on a female/host account. Host accounts are for female users only.",
              data: { reason_code: "gender_mismatch", detected_gender: "male", profile_gender: "female" },
            });
        }
        
        return new Response(JSON.stringify({
          approved: false,
          rejected: true,
          reason: "gender_mismatch",
          message: `Gender mismatch: Your profile is Female but verification detected Male face (${genderConfidence.toFixed(1)}% confidence). Host accounts are for female users only.`,
          detectedGender: "male",
          profileGender: "female",
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // If gender is "unknown" (low confidence), log warning but continue with profile gender
    if (detectedGender === "unknown") {
      console.log(`[auto-face-verify] ⚠️ Gender detection low confidence (${genderConfidence.toFixed(1)}%), using profile gender: ${profileGender || 'male'}`);
    }

    let faceMatchPercentage = 0;

    if (referenceImageUrl) {
      // We have a reference image - do face comparison
      try {
        const referenceImageBytes = await fetchImageBytes(referenceImageUrl);
        const compareResult = await callRekognitionCompareFaces(
          imageBytes,
          referenceImageBytes,
          AWS_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY,
          AWS_REGION,
        );

        faceMatchPercentage = Math.max(
          ...(compareResult?.FaceMatches || []).map((m: any) => Number(m?.Similarity || 0)),
          0,
        );

        if (faceMatchPercentage < MIN_FACE_MATCH_PERCENTAGE) {
          return await rejectWithReason({
            reasonCode: "face_match_below_threshold",
            faceMatchPercentage,
            extraContext: `Detected face match ${faceMatchPercentage.toFixed(1)}%.`,
          });
        }
      } catch (compareErr) {
        // CompareFaces failed (e.g. InvalidImageFormatException)
        console.error(`[auto-face-verify] CompareFaces failed:`, compareErr);
        return await rejectWithReason({
          reasonCode: "face_match_below_threshold",
          faceMatchPercentage: 0,
          extraContext: "Face comparison failed and could not verify identity.",
        });
      }
    } else {
      // No reference image - strict reject (identity cannot be matched)
      return await rejectWithReason({
        reasonCode: "reference_image_missing",
        extraContext: "No reference profile image found for comparison. Please upload a profile photo first.",
      });
    }

    // SOFT warnings
    const warnings: string[] = [];
    if (confidence < 80) warnings.push("low_confidence");
    if (brightness < 20) warnings.push("dim_lighting");
    if (sharpness < 15) warnings.push("slightly_blurry");
    if (eyesOpen?.Value === false && (eyesOpen?.Confidence || 0) > 90) warnings.push("eyes_closed");
    if (sunglasses?.Value === true && (sunglasses?.Confidence || 0) > 90) warnings.push("wearing_sunglasses");

    // ★ NO AUTO-APPROVE — All submissions stay as "pending" for manual admin review
    // We only save AI analysis notes to help admin make the decision
    const detectedGenderLabel = detectedGender === "female" ? "Female" : detectedGender === "male" ? "Male" : "Unknown";
    const adminNotes = `AI Analysis (pending admin review): Face Match: ${faceMatchPercentage.toFixed(1)}% (min ${MIN_FACE_MATCH_PERCENTAGE}%). Gender detected: ${detectedGenderLabel} (${(gender?.Confidence || 0).toFixed(1)}%), Confidence: ${confidence.toFixed(1)}%, Age: ${ageRange?.Low}-${ageRange?.High}${warnings.length > 0 ? `, Warnings: ${warnings.join(", ")}` : ""}`;

    if (submissionId) {
      // Update submission with AI analysis but keep status as "pending"
      await supabaseAdmin
        .from("face_verification_submissions")
        .update({
          admin_notes: adminNotes,
          updated_at: new Date().toISOString(),
        })
        .eq("id", submissionId);
    }

    console.log(`[auto-face-verify] Submission ${submissionId} — saved AI analysis, awaiting manual admin review. Match: ${faceMatchPercentage.toFixed(1)}%`);

    return new Response(JSON.stringify({
      approved: false,
      pendingReview: true,
      gender: detectedGender,
      confidence,
      ageRange,
      warnings,
      matchPercentage: faceMatchPercentage,
      requiredPercentage: MIN_FACE_MATCH_PERCENTAGE,
      message: "✅ Submitted successfully! Your verification is pending admin review.",
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[auto-face-verify] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function getViolationMessage(violations: string[]): string {
  const messages: string[] = [];
  if (violations.includes("underage")) messages.push("You must be 18 or older to verify");
  if (violations.includes("face_occluded")) messages.push("Your face appears to be fully covered - please remove any covering");
  return messages.join(". ") + ". Please try again.";
}
