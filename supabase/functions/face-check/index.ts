import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform, x-client-version, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
  let kDate = await hmacSHA256(new TextEncoder().encode("AWS4" + key), dateStamp);
  let kRegion = await hmacSHA256(kDate, region);
  let kService = await hmacSHA256(kRegion, service);
  let kSigning = await hmacSHA256(kService, "aws4_request");
  return kSigning;
}

function toHex(buffer: Uint8Array): string {
  return Array.from(buffer).map(b => b.toString(16).padStart(2, "0")).join("");
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

async function callRekognition(imageBytes: Uint8Array, accessKey: string, secretKey: string, region: string) {
  const service = "rekognition";
  const host = `rekognition.${region}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const { amzDate, dateStamp } = getAmzDate();

  // Convert image to base64 for Rekognition
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    // Try fast JWT-local getClaims, fall back to server-side getUser (Pkg358).
    let authedUserId: string | null = null;
    try {
      const { data: claimsData } = await supabase.auth.getClaims(token);
      if (claimsData?.claims?.sub) authedUserId = claimsData.claims.sub as string;
    } catch (_e) { /* fall through */ }
    if (!authedUserId) {
      const { data: userData, error: userErr } = await supabase.auth.getUser(token);
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
        });
      }
    }

    const { imageBase64, streamId } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
      });
    }

    const cleanBase64 = String(imageBase64).includes(',')
      ? String(imageBase64).split(',').pop()!
      : String(imageBase64);
    if (cleanBase64.length > 6_500_000) {
      return new Response(JSON.stringify({ error: "Image too large" }), {
      });
    }

    // Decode base64 image
    const binaryString = atob(cleanBase64);
    const imageBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      imageBytes[i] = binaryString.charCodeAt(i);
    }

    // Call AWS Rekognition
    const result = await callRekognition(imageBytes, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION);

    const faceDetails = result.FaceDetails || [];
    const faceDetected = faceDetails.length > 0;

    let analysis = {
      faceDetected,
      faceCount: faceDetails.length,
      eyesOpen: false,
      eyesOpenConfidence: 0,
      goodLighting: false,
      goodFraming: true,
      lyingDown: false,
      confidence: 0,
      violations: [] as string[],
      // Enhanced: Face pose for anti-spoof tracking
      pose: { yaw: 0, pitch: 0, roll: 0 },
      // Enhanced: Quality metrics
      quality: { brightness: 0, sharpness: 0 },
      // Enhanced: Sleep indicators
      sleepScore: 0, // 0-100, higher = more likely sleeping
      // Enhanced: Liveness indicators
      mouthOpen: false,
      mouthOpenConfidence: 0,
      emotions: null as Record<string, number> | null,
    };

    if (faceDetected) {
      const face = faceDetails[0];
      analysis.confidence = face.Confidence || 0;

      // Eyes open check (sleep detection) - enhanced with confidence
      const eyesOpen = face.EyesOpen;
      analysis.eyesOpen = eyesOpen?.Value === true && (eyesOpen?.Confidence || 0) > 70;
      analysis.eyesOpenConfidence = eyesOpen?.Confidence || 0;

      // Mouth open (liveness indicator - real faces move mouth)
      const mouthOpen = face.MouthOpen;
      analysis.mouthOpen = mouthOpen?.Value === true;
      analysis.mouthOpenConfidence = mouthOpen?.Confidence || 0;

      // Face pose (anti-spoof: real faces have varying pose, photos are static)
      const pose = face.Pose;
      analysis.pose = {
        yaw: pose?.Yaw || 0,
        pitch: pose?.Pitch || 0,
        roll: pose?.Roll || 0,
      };

      // Lighting and framing quality checks
      const quality = face.Quality;
      const brightness = quality?.Brightness || 0;
      const sharpness = quality?.Sharpness || 0;
      analysis.quality = { brightness, sharpness };
      analysis.goodLighting = brightness > 35 && sharpness > 25;

      const absYaw = Math.abs(analysis.pose.yaw);
      const absPitch = Math.abs(analysis.pose.pitch);
      const absRoll = Math.abs(analysis.pose.roll);

      // Face must remain centered and upright on live
      analysis.goodFraming = absYaw < 30 && absPitch < 25;
      analysis.lyingDown = absRoll > 35 || absPitch > 40;

      // Emotions (liveness indicator - photos often show neutral/no emotion variation)
      const emotions = face.Emotions;
      if (emotions && Array.isArray(emotions)) {
        analysis.emotions = {};
        for (const em of emotions) {
          if (em.Type && em.Confidence) {
            analysis.emotions[em.Type] = em.Confidence;
          }
        }
      }

      // Enhanced sleep score calculation
      // Factors: eyes closed, lying posture, and out-of-frame behavior
      let sleepScore = 0;
      if (eyesOpen?.Value === false) {
        sleepScore += 40; // Eyes closed = big sleep indicator
        if ((eyesOpen?.Confidence || 0) > 90) sleepScore += 20; // Very confident eyes closed
      }
      if (analysis.lyingDown) {
        sleepScore += 45; // Lying posture is immediate severe signal
      }
      if (!analysis.goodFraming) {
        sleepScore += 20; // Face not centered/looking away from camera
      }
      // Low sharpness can indicate no movement (sleeping)
      if (sharpness < 30) sleepScore += 10;
      // Calm emotion (no engagement)
      if (emotions) {
        const calm = emotions.find((e: any) => e.Type === 'CALM');
        if (calm && calm.Confidence > 80) sleepScore += 15;
      }
      analysis.sleepScore = Math.min(sleepScore, 100);

      // Determine violations
      if (!analysis.eyesOpen) {
        analysis.violations.push("eyes_closed");
      }
      if (!analysis.goodLighting) {
        analysis.violations.push("poor_lighting");
      }
      if (analysis.lyingDown) {
        analysis.violations.push("lying_down");
      }
      if (!analysis.goodFraming) {
        analysis.violations.push("face_out_of_frame");
      }
      // Anti-spoof: face too perfectly still (extreme low pose variance over time is tracked client-side)
      // Server just provides the raw pose data for client to track variance
    } else {
      analysis.violations.push("no_face");
    }

    console.log(`[face-check] Stream: ${streamId}, Face: ${faceDetected}, Eyes: ${analysis.eyesOpen}(${analysis.eyesOpenConfidence.toFixed(0)}%), Light: ${analysis.goodLighting}, FrameOK: ${analysis.goodFraming}, Lying: ${analysis.lyingDown}, Pose: Y${analysis.pose.yaw.toFixed(1)} P${analysis.pose.pitch.toFixed(1)} R${analysis.pose.roll.toFixed(1)}, Sleep: ${analysis.sleepScore}, Violations: ${analysis.violations.join(",") || "none"}`);

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[face-check] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
    });
  }
});
