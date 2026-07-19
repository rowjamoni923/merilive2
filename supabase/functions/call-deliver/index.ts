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

    // ── Internal trigger path: server-authoritative ring fan-out.
    // pg_net trigger on `private_calls` insert calls us with x-internal-secret
    // so the host still rings even if the initiating client crashes between
    // creating the call row and invoking this function.
    const internalSecret = req.headers.get("x-internal-secret");
    const cronSecret = Deno.env.get("CRON_SECRET");
    const isInternal = !!(internalSecret && cronSecret && internalSecret === cronSecret);

    let authedCallerId: string | null = null;
    if (!isInternal) {
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
        });
      }
      authedCallerId = userData.user.id;
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
      });
    }

    if (!isInternal && authedCallerId !== callerId) {
      return new Response(JSON.stringify({ error: "caller mismatch" }), {
      });
    }


    const admin = createClient(supabaseUrl, serviceKey);

    // ⚡ INSTANT-CALL OPTIMIZATION: every read below is independent of the
    // others, so issue them ALL in parallel + kick off the FCM OAuth token
    // exchange at the same time. Previously these were 6 sequential awaits
    // (~600-1500ms cumulative); now wall-clock = slowest single round trip.
    const [
      maxRetriesRaw,
      gapMsRaw,
      ringTimeoutRaw,
      profileRes,
      callRowRes,
      accessTokenEarly,
    ] = await Promise.all([
      loadSetting(admin, "call_delivery_max_retries", "3"),
      loadSetting(admin, "call_delivery_retry_gap_ms", "2000"),
      loadSetting(admin, "call_ring_timeout_seconds", "30"),
      admin.from("profiles").select("display_name,avatar_url,user_level").eq("id", callerId).maybeSingle(),
      admin.from("private_calls").select("id,status,caller_id,host_id").eq("id", callId).maybeSingle(),
      serviceAccountJson
        ? getAccessToken(JSON.parse(serviceAccountJson) as ServiceAccountCredentials).catch((e) => {
            console.warn("[call-deliver] OAuth token pre-fetch failed:", e);
            return null as string | null;
          })
        : Promise.resolve(null as string | null),
    ]);

    const maxRetries = parseInt(maxRetriesRaw, 10) || 3;
    const gapMs = parseInt(gapMsRaw, 10) || 2000;
    const ringTimeoutSec = parseInt(ringTimeoutRaw, 10) || 30;

    let callerName = body.callerName?.trim() || "";
    let callerAvatar = body.callerAvatar?.trim() || "";
    let callerLevel = 1;
    {
      const prof = profileRes.data;
      if (prof) {
        if (!callerName && prof.display_name) callerName = String(prof.display_name);
        if (!callerAvatar && prof.avatar_url) callerAvatar = String(prof.avatar_url ?? "");
        const lvl = Number((prof as { user_level?: unknown }).user_level);
        if (Number.isFinite(lvl) && lvl > 0) callerLevel = Math.floor(lvl);
      }
    }
    if (!callerName) callerName = "Caller";

    const callType = (body.callType || "video").toLowerCase();

    const callRow = callRowRes.data;
    const callErr = callRowRes.error;
    if (callErr || !callRow) {
      return new Response(JSON.stringify({ error: "call_not_found" }), {
      });
    }

    const st = String(callRow.status || "").toLowerCase();
    if (!["ringing", "pending"].includes(st)) {
      return new Response(JSON.stringify({ ok: false, reason: "call_not_ringing", status: callRow.status }), {
      });
    }

    if (callRow.caller_id !== callerId || callRow.host_id !== calleeId) {
      return new Response(JSON.stringify({ error: "call_participants_mismatch" }), {
      });
    }


    let lastResults: unknown[] = [];
    let anyFcmOk = false;

    // ── Pkg84: foreground in-app delivery via `notifications` row.
    // Pkg37 master FCM trigger skips type='incoming_call' (see
    // trigger_push_on_notification) so this insert never duplicates the
    // high-priority data FCM dispatched below. useNotifications bridges
    // the row → window 'incoming-call-notification' → IncomingCallModal.
    const notifPayload = {
      callId,
      callerId,
      callerName,
      callerAvatar,
      callerLevel,
      callType,
      ts: Date.now(),
    };
    let notifInsertOk = false;
    try {
      const { error: notifErr } = await admin.from("notifications").insert({
        user_id: calleeId,
        type: "incoming_call",
        title: `Incoming call from ${callerName}`,
        message: `${callerName} is calling you`,
        data: notifPayload,
      });
      notifInsertOk = !notifErr;
      await admin.from("call_delivery_log").insert({
        call_id: callId,
        callee_id: calleeId,
        attempt_number: 0,
        channel: "notification_insert",
        sent_at: notifInsertOk ? new Date().toISOString() : null,
        error_message: notifInsertOk ? null : (notifErr?.message || "notifications insert failed"),
        device_info: { type: "incoming_call" },
      });
    } catch (e) {
      console.warn("[call-deliver] notifications insert failed:", e);
    }

    if (!serviceAccountJson) {
      // Bug-fix #3 (call silent fail): previously this returned `ok:true` with
      // reason="fcm_not_configured", so the caller's UI showed "ringing" while
      // the callee's phone (if backgrounded/killed) never rang. We still
      // return HTTP 200 (the in-app notifications row above already delivers
      // to foregrounded callees), but now we explicitly mark `ok:false`,
      // `fcmConfigured:false`, AND `requiresAttention:true` so the client UI
      // can warn the caller: "Push not configured — recipient may not be
      // notified if the app is closed."
      await admin.from("call_delivery_log").insert({
      });
      console.warn("[call-deliver] FIREBASE_SERVICE_ACCOUNT_JSON missing — push delivery skipped. Set the secret to enable background-ring delivery.");
      return new Response(JSON.stringify({
        ok: false,
        reason: "fcm_not_configured",
        fcmConfigured: false,
        requiresAttention: true,
        attempts: 0,
        fcmDelivered: false,
        notifInsertOk,
        lastResults,
        warning: "Push not configured — recipient will only be notified if the app is in the foreground.",
      }), {
      });
    }



    const credentials = JSON.parse(serviceAccountJson) as ServiceAccountCredentials;
    // ⚡ Reuse the OAuth token already fetched in parallel up top. Only fall
    // back to a fresh exchange if the pre-fetch failed.
    const accessToken = accessTokenEarly ?? (await getAccessToken(credentials));
    const projectId = credentials.project_id;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // ⚡ device-tokens + fresh-status reads in parallel (independent).
      const [tokensRes, freshRes] = await Promise.all([
        admin
          .from("device_tokens")
          .select("token, platform, user_id")
          .eq("user_id", calleeId)
          .eq("is_active", true),
        admin.from("private_calls").select("status").eq("id", callId).maybeSingle(),
      ]);

      const { data: deviceTokens, error: tokErr } = tokensRes;
      if (tokErr) {
        console.error("[call-deliver] tokens:", tokErr);
      }

      const tokens = deviceTokens ?? [];
      const fresh = freshRes.data;
      const fst = String(fresh?.status || "").toLowerCase();
      if (!["ringing", "pending"].includes(fst)) {

        await admin.from("call_delivery_log").insert({
        });
        break;
      }

      if (tokens.length === 0) {
        await admin.from("call_delivery_log").insert({
        });
        if (attempt < maxRetries) await sleep(gapMs * Math.pow(2, attempt - 1));
        continue;
      }

      const dataPayload: Record<string, string> = {
        caller_id: callerId,
        caller_name: callerName,
        caller_avatar: callerAvatar,
        caller_level: String(callerLevel),
        call_type: callType,
        ring_timeout_seconds: String(ringTimeoutSec),
      };

      const results = await Promise.all(
        tokens.map(async (device: { token: string; platform: string }) => {
          try {
            const fcmMessage = {
                token: device.token,
                android: {
                  priority: "high",
                  ttl: `${ringTimeoutSec}s`,
                },
                apns: {
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
      });

      if (okCount > 0) {
        anyFcmOk = true;
        break;
      }

      if (attempt < maxRetries) {
        await sleep(gapMs * Math.pow(2, attempt - 1));
      }
    }

    // Pkg84: Supabase Realtime broadcast fallback REMOVED.
    // notifications-row insert (above) is the sole foreground delivery path.
    return new Response(
      JSON.stringify({
        notifInsertOk,
        lastResults,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("[call-deliver]", e);
    return new Response(JSON.stringify({ error: msg }), {
    });
  }
});
