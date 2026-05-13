/**
 * Reliable private-call FCM delivery: high-priority data messages, retries, logging.
 * Invoked by Flutter after start_private_call (caller JWT) — validates caller_id matches session.
 */
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ServiceAccountCredentials {
  private_key: string;
  client_email: string;
  project_id: string;
}

async function getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: exp,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const signatureInput = `${headerB64}.${payloadB64}`;
  const pemContents = credentials.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signatureInput),
  );
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const jwt = `${signatureInput}.${signatureB64}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
  }
  return tokenData.access_token as string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function loadSetting(admin: ReturnType<typeof createClient>, key: string, fallback: string): Promise<string> {
  const { data } = await admin.from("app_settings").select("setting_value").eq("setting_key", key).maybeSingle();
  const v = data?.setting_value?.toString?.()?.trim();
  return v && v.length > 0 ? v : fallback;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json() as {
      callId?: string;
      calleeId?: string;
      callerId?: string;
      callType?: string;
      callerName?: string;
      callerAvatar?: string;
    };

    const callId = body.callId?.trim();
    const calleeId = body.calleeId?.trim();
    const callerId = body.callerId?.trim();
    if (!callId || !calleeId || !callerId) {
      return new Response(JSON.stringify({ error: "callId, calleeId, callerId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (userData.user.id !== callerId) {
      return new Response(JSON.stringify({ error: "caller mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const maxRetries = parseInt(await loadSetting(admin, "call_delivery_max_retries", "3"), 10) || 3;
    const gapMs = parseInt(await loadSetting(admin, "call_delivery_retry_gap_ms", "2000"), 10) || 2000;
    const ringTimeoutSec = parseInt(await loadSetting(admin, "call_ring_timeout_seconds", "30"), 10) || 30;

    let callerName = body.callerName?.trim() || "Caller";
    let callerAvatar = body.callerAvatar?.trim() || "";
    if (!callerName || callerName === "Caller") {
      const { data: prof } = await admin.from("profiles").select("display_name,avatar_url").eq("id", callerId).maybeSingle();
      if (prof?.display_name) callerName = String(prof.display_name);
      if (prof?.avatar_url) callerAvatar = String(prof.avatar_url ?? "");
    }

    const callType = (body.callType || "video").toLowerCase();

    const { data: callRow, error: callErr } = await admin
      .from("private_calls")
      .select("id,status,caller_id,host_id")
      .eq("id", callId)
      .maybeSingle();

    if (callErr || !callRow) {
      return new Response(JSON.stringify({ error: "call_not_found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const st = String(callRow.status || "").toLowerCase();
    if (!["ringing", "pending"].includes(st)) {
      return new Response(JSON.stringify({ ok: false, reason: "call_not_ringing", status: callRow.status }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (callRow.caller_id !== callerId || callRow.host_id !== calleeId) {
      return new Response(JSON.stringify({ error: "call_participants_mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!serviceAccountJson) {
      await admin.from("call_delivery_log").insert({
        call_id: callId,
        callee_id: calleeId,
        attempt_number: 1,
        channel: "fcm",
        status: "skipped_no_fcm",
        error_message: "FIREBASE_SERVICE_ACCOUNT_JSON missing",
        device_info: { reason: "FIREBASE_SERVICE_ACCOUNT_JSON missing" },
      });
      return new Response(JSON.stringify({ ok: false, reason: "fcm_not_configured" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const credentials = JSON.parse(serviceAccountJson) as ServiceAccountCredentials;
    const accessToken = await getAccessToken(credentials);
    const projectId = credentials.project_id;

    let lastResults: unknown[] = [];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const { data: deviceTokens, error: tokErr } = await admin
        .from("device_tokens")
        .select("token, platform, user_id")
        .eq("user_id", calleeId)
        .eq("is_active", true);

      if (tokErr) {
        console.error("[call-deliver] tokens:", tokErr);
      }

      const tokens = deviceTokens ?? [];
      const { data: fresh } = await admin.from("private_calls").select("status").eq("id", callId).maybeSingle();
      const fst = String(fresh?.status || "").toLowerCase();
      if (!["ringing", "pending"].includes(fst)) {
        await admin.from("call_delivery_log").insert({
          call_id: callId,
          callee_id: calleeId,
          attempt_number: attempt,
          channel: "fcm",
          status: "aborted_call_ended",
          error_message: "Call ended before delivery",
          device_info: { remote_status: fresh?.status },
        });
        break;
      }

      if (tokens.length === 0) {
        await admin.from("call_delivery_log").insert({
          call_id: callId,
          callee_id: calleeId,
          attempt_number: attempt,
          channel: "fcm",
          status: "no_tokens",
          error_message: "No active device tokens",
          device_info: {},
        });
        if (attempt < maxRetries) await sleep(gapMs * Math.pow(2, attempt - 1));
        continue;
      }

      const dataPayload: Record<string, string> = {
        type: "incoming_call",
        call_id: callId,
        caller_id: callerId,
        callee_id: calleeId,
        caller_name: callerName,
        caller_avatar: callerAvatar,
        call_type: callType,
        ring_timeout_seconds: String(ringTimeoutSec),
      };

      const results = await Promise.all(
        tokens.map(async (device: { token: string; platform: string }) => {
          try {
            const fcmMessage = {
              message: {
                token: device.token,
                data: dataPayload,
                android: {
                  priority: "high",
                  ttl: `${ringTimeoutSec}s`,
                },
                apns: {
                  headers: { "apns-priority": "10" },
                  payload: {
                    aps: {
                      "content-available": 1,
                    },
                  },
                },
              },
            };

            const response = await fetch(
              `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify(fcmMessage),
              },
            );
            const result = await response.json();
            if (!response.ok) {
              if (
                result.error?.details?.some((d: { errorCode?: string }) =>
                  d.errorCode === "UNREGISTERED" || d.errorCode === "INVALID_ARGUMENT",
                )
              ) {
                await admin.from("device_tokens").update({ is_active: false }).eq("token", device.token);
              }
              return { success: false, error: result.error };
            }
            return { success: true, messageId: result.name };
          } catch (e) {
            return { success: false, error: String(e) };
          }
        }),
      );

      lastResults = results;
      const okCount = results.filter((r: { success?: boolean }) => r.success).length;

      await admin.from("call_delivery_log").insert({
        call_id: callId,
        callee_id: calleeId,
        attempt_number: attempt,
        channel: "fcm",
        status: okCount > 0 ? "sent" : "failed",
        sent_at: okCount > 0 ? new Date().toISOString() : null,
        error_message: okCount > 0 ? null : "FCM delivery failed",
        device_info: { tokens: tokens.length, success: okCount, results },
      });

      if (okCount > 0) {
        break;
      }

      if (attempt < maxRetries) {
        await sleep(gapMs * Math.pow(2, attempt - 1));
      }
    }

    return new Response(
      JSON.stringify({ ok: true, attempts: maxRetries, lastResults }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[call-deliver]", e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
