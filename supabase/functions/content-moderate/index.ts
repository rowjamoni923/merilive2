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

async function sha256Hash(message: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(message));
  return toHex(new Uint8Array(hash));
}

async function callComprehend(
  target: string,
  body: Record<string, unknown>,
  accessKey: string,
  secretKey: string,
  region: string
) {
  const service = "comprehend";
  const host = `comprehend.${region}.amazonaws.com`;
  const endpoint = `https://${host}`;
  const { amzDate, dateStamp } = getAmzDate();

  const requestBody = JSON.stringify(body);
  const payloadHash = await sha256Hash(requestBody);

  const canonicalHeaders = `content-type:application/x-amz-json-1.1\nhost:${host}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`;
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
      "X-Amz-Target": target,
      "Authorization": authHeader,
      "Host": host,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(`Comprehend [${target}] error:`, response.status, errText);
    throw new Error(`Comprehend API error: ${response.status}`);
  }

  return await response.json();
}

// Supported languages for Comprehend sentiment/toxicity
const COMPREHEND_LANGUAGES = new Set([
  "en", "es", "fr", "de", "it", "pt", "ar", "hi", "ja", "ko", "zh", "zh-TW",
]);

// Auto deduction for toxic content (hosts only)
const TOXIC_DEDUCTION_BEANS = 1000;

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

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Pkg310 deep-audit: caller MUST be authenticated, and userId is taken
    // from the JWT — never trusted from the client. Previously, any anon caller
    // could pass an arbitrary userId to:
    //   • write fabricated chat_moderation_logs rows attributed to that user
    //   • trigger 1000-bean auto-deduction from any host by sending toxic text
    //     under their userId.
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return new Response(
        JSON.stringify({ error: "authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes?.user?.id) {
      return new Response(
        JSON.stringify({ error: "invalid session" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const authUserId = userRes.user.id;

    const { message, messageId, conversationId, groupId, contextType } = await req.json();
    const userId = authUserId; // override any client-supplied value

    if (!message) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip very short messages
    if (message.trim().length < 3) {
      return new Response(
        JSON.stringify({ toxic: false, sentiment: "NEUTRAL" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Run both Sentiment Analysis and Toxic Content Detection in parallel
    const [sentimentResult, toxicResult] = await Promise.all([
      // DetectSentiment
      callComprehend(
        "Comprehend_20171127.DetectSentiment",
        { Text: message.substring(0, 5000), LanguageCode: "en" },
        AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
      ).catch(err => {
        console.error("[content-moderate] Sentiment error:", err);
        return null;
      }),

      // DetectToxicContent
      callComprehend(
        "Comprehend_20171127.DetectToxicContent",
        {
          TextSegments: [{ Text: message.substring(0, 5000) }],
          LanguageCode: "en",
        },
        AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION
      ).catch(err => {
        console.error("[content-moderate] Toxicity error:", err);
        return null;
      }),
    ]);

    // Parse sentiment
    const sentiment = sentimentResult?.Sentiment || "NEUTRAL";
    const sentimentScores = sentimentResult?.SentimentScore || {};

    // Parse toxicity
    const resultList = toxicResult?.ResultList || [];
    const toxicLabels: Array<{ Name: string; Score: number }> = [];
    let overallToxicity = 0;

    if (resultList.length > 0) {
      const segment = resultList[0];
      overallToxicity = segment.Toxicity || 0;

      for (const label of segment.Labels || []) {
        if (label.Score > 0.5) {
          toxicLabels.push({ Name: label.Name, Score: label.Score });
        }
      }
    }

    const isToxic = overallToxicity > 0.6 || toxicLabels.length > 0;
    const isHighlyToxic = overallToxicity > 0.8;

    console.log(`[content-moderate] User: ${userId}, Toxic: ${isToxic} (${overallToxicity.toFixed(2)}), Sentiment: ${sentiment}, Labels: ${toxicLabels.map(l => l.Name).join(",")}`);

    // If toxic, log and take action
    if (isToxic) {
      // Get user profile
      const { data: userProfile } = await supabase
        .from("profiles")
        .select("id, is_host, display_name, app_uid, beans_balance")
        .eq("id", userId)
        .single();

      const isHost = userProfile?.is_host === true;
      const violationCategories = toxicLabels.map(l => l.Name).join(", ");

      // Log to chat_moderation_logs
      await supabase.from("chat_moderation_logs").insert({
        user_id: userId,
        message_id: messageId || null,
        conversation_id: conversationId || null,
        group_id: groupId || null,
        violation_type: "toxic_content",
        detected_content: violationCategories || "toxic",
        action_taken: isHighlyToxic ? (isHost ? "auto_deduction" : "warning") : "flagged",
        is_auto_action: true,
        notes: `AWS Comprehend: Toxicity ${(overallToxicity * 100).toFixed(0)}%, Labels: [${violationCategories}], Sentiment: ${sentiment}. Original: "${message.substring(0, 100)}..."`,
      });

      // Auto deduct beans from hosts for highly toxic content
      let newBalance = userProfile?.beans_balance || 0;
      if (isHighlyToxic && isHost && userProfile) {
        newBalance = (userProfile.beans_balance || 0) - TOXIC_DEDUCTION_BEANS;
        await supabase
          .from("profiles")
          .update({ beans_balance: newBalance })
          .eq("id", userId);

        await supabase.from("admin_logs").insert({
          action_type: "beans_deducted",
          target_type: "user",
          target_id: userId,
          details: {
            amount: TOXIC_DEDUCTION_BEANS,
            reason: `Toxic content (${violationCategories}) - Auto deduction`,
            previous_balance: userProfile.beans_balance || 0,
            new_balance: newBalance,
            user_name: userProfile.display_name,
            user_uid: userProfile.app_uid,
            toxicity_score: overallToxicity,
            auto_action: true,
          },
        });

        console.log(`[content-moderate] Auto-deducted ${TOXIC_DEDUCTION_BEANS} beans from host ${userProfile.display_name}`);
      }

      // Send admin alert for highly toxic content
      if (isHighlyToxic) {
        const channel = supabase.channel("admin-alerts");
        await channel.send({
          type: "broadcast",
          event: "toxic_content",
          payload: {
            userId,
            contextType: contextType || "chat",
            callerName: userProfile?.display_name,
            userUid: userProfile?.app_uid,
            toxicityScore: overallToxicity,
            labels: violationCategories,
            sentiment,
            isHost,
            autoDeducted: isHighlyToxic && isHost,
            deductedAmount: isHighlyToxic && isHost ? TOXIC_DEDUCTION_BEANS : 0,
            originalMessage: message.substring(0, 100),
            timestamp: new Date().toISOString(),
          },
        });
      }

      return new Response(
        JSON.stringify({
          toxic: true,
          sentiment,
          sentimentScores,
          severity: isHighlyToxic ? "high" : "medium",
          action: isHighlyToxic ? (isHost ? "auto_deduction" : "warning") : "flagged",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clean message
    return new Response(
      JSON.stringify({
        sentiment,
        sentimentScores,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[content-moderate] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
