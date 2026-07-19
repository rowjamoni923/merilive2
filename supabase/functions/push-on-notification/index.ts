import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ServiceAccountCredentials {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
}

// Pkg425: FCM HTTP v1 rejects reserved data keys (`from`, `notification`,
// `message_type`, `google.*`, `gcm.*`) with 400 INVALID_ARGUMENT — drops
// the entire push silently. Defense-in-depth: rename to `app_*` so a future
// admin-injected key in notifications.data jsonb cannot break delivery.
const FCM_RESERVED_KEYS = new Set(["from", "notification", "message_type"]);
const isFcmReservedKey = (k: string) =>
  FCM_RESERVED_KEYS.has(k) || k.startsWith("google.") || k.startsWith("gcm.");
const sanitizeFcmData = (input: Record<string, unknown> = {}): Record<string, string> => {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) continue;
    const safeKey = isFcmReservedKey(key) ? `app_${key.replace(/\./g, "_")}` : key;
    output[safeKey] = typeof value === "string" ? value : JSON.stringify(value);
  }
  return output;
};

// Pkg425 Phase-8 — type → Android notification channel mapping. Channels
// MUST exist in android/.../NotificationHelper.java.
const pickAndroidChannel = (type?: string): string => {
  const t = (type || "").toLowerCase();
  if (t === "incoming_call" || t === "call" || t === "missed_call") return "merilive_calls";
  if (t === "message" || t === "chat" || t === "dm" || t === "new_message") return "merilive_messages";
  if (t === "gift" || t === "gift_received" || t === "reward") return "merilive_gifts";
  if (t === "live_start" || t === "live" || t === "stream_started" || t === "follow") return "merilive_live";
  if (t === "system" || t === "security" || t === "maintenance") return "merilive_system";
  if (
    t === "promo" || t === "promotion" || t === "campaign" || t === "event" ||
    t === "marketing" || t === "reengagement" || t === "re_engagement" || t === "broadcast"
  ) return "merilive_promo";
  return "merilive_default";
};
const channelPriority = (type?: string): string => {
  const ch = pickAndroidChannel(type);
  if (ch === "merilive_calls") return "PRIORITY_MAX";
  if (ch === "merilive_messages" || ch === "merilive_gifts") return "PRIORITY_HIGH";
  if (ch === "merilive_system" || ch === "merilive_promo") return "PRIORITY_LOW";
  return "PRIORITY_DEFAULT";
};


// Generate JWT for FCM V1 authentication
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

  const encode = (obj: unknown) => {
    const str = JSON.stringify(obj);
    return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };

  const unsignedToken = `${encode(header)}.${encode(payload)}`;

  const pemContents = credentials.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsignedToken)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const jwt = `${unsignedToken}.${signatureB64}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
  }
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Pkg308 deep-audit: lock to service role only ───────────────────────
    // This endpoint is a Supabase DB webhook target (fires when a row is
    // inserted into `notifications`). Previously it accepted any caller →
    // an authenticated user could POST a fabricated `record` with arbitrary
    // `user_id`/`type`/`title` and fan out an FCM push to any user's devices
    // without ever inserting a real notification row.
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (!bearer || bearer !== supabaseServiceKey) {
      console.warn("[PushOnNotif] Rejected non-service-role caller");
      return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    // ───────────────────────────────────────────────────────────────────────

    const { record } = await req.json();
    
    if (!record || !record.user_id || !record.title) {
      return new Response(JSON.stringify({ success: false, error: "Invalid payload" }), {
      });
    }

    // J1 dedup: prevent duplicate FCM dispatch when DB webhook retries.
    // Uses the same notification_push_dispatches table as send-push-notification.
    if (record.id) {
      const supabaseEarly = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { error: dispatchErr } = await supabaseEarly
        .from("notification_push_dispatches")
        .insert({ notification_id: record.id });
      if (dispatchErr) {
        if (dispatchErr.code === "23505") {
          console.log(`[PushOnNotif] Skipping duplicate dispatch for notification ${record.id}`);
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: "already_dispatched" }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        console.warn("[PushOnNotif] Dispatch insert error (continuing):", dispatchErr);
      }
    }

    const userId = record.user_id;
    const title = record.title;
    const body = record.message || "";
    const notifType = record.type || "general";
    const data = record.data || {};
    const imageUrl = data?.image_url || data?.imageUrl || record.image_url || record.imageUrl || "";

    // Skip admin-only types
    const ADMIN_ONLY_TYPES = [
      'verification', 'host_application', 'support', 'helper_application',
      'helper_upgrade', 'helper_topup', 'new_agency', 'agency_withdrawal', 'admin_alert'
    ];
    if (ADMIN_ONLY_TYPES.includes(notifType)) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: "admin_only_type" }), {
      });
    }

    const supabase = createClient(
      supabaseUrl,
      supabaseServiceKey,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Get user's device tokens
    const { data: deviceTokens, error: tokenError } = await supabase
      .from("device_tokens")
      .select("token, platform")
      .eq("user_id", userId)
      .eq("is_active", true);

    if (tokenError || !deviceTokens || deviceTokens.length === 0) {
      console.log(`[PushOnNotif] No active tokens for user ${userId}`);
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
      });
    }

    // Get FCM credentials
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || Deno.env.get("FCM_SERVICE_ACCOUNT_KEY");
    if (!serviceAccountJson) {
      console.log("[PushOnNotif] FCM not configured");
      return new Response(JSON.stringify({ success: false, error: "FCM not configured" }), {
      });
    }

    const credentials: ServiceAccountCredentials = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(credentials);
    const projectId = credentials.project_id;

    // Determine action URL
    const actionUrl = data?.action_url || "";
    const linkUrl = actionUrl ? `merilive://open${actionUrl}` : "";

    let sent = 0;
    const results = await Promise.all(
      deviceTokens.map(async (device) => {
        try {
          const fcmMessage: Record<string, unknown> = {
            message: {
              token: device.token,
              notification: {
                title: title,
                body: body.substring(0, 200),
                ...(imageUrl ? { image: imageUrl } : {}),
              },
              data: sanitizeFcmData({
                type: notifType,
                click_action: "FLUTTER_NOTIFICATION_CLICK",
                ...(linkUrl ? { link_url: linkUrl } : {}),
                ...(actionUrl ? { action_url: actionUrl } : {}),
                ...(data?.icon_emoji ? { icon_emoji: String(data.icon_emoji) } : {}),
                ...(imageUrl ? { image_url: String(imageUrl) } : {}),
              }),
              android: {
                priority: "HIGH",
                  // Pkg425 Phase-8 — route to type-specific channel so
                  // killed-app notifications inherit correct importance/
                  // sound/vibration. Falls back to merilive_default.
                  channel_id: pickAndroidChannel(notifType),
                  sound: "default",
                  default_vibrate_timings: true,
                  default_sound: true,
                  notification_priority: channelPriority(notifType),
                  visibility: "PUBLIC",
                  ...(imageUrl ? { image: String(imageUrl) } : {}),
                },
              },
              apns: {
                payload: {
                  aps: {
                    alert: { title, body: body.substring(0, 200) },
                    badge: 1,
                  },
                },
                ...(imageUrl ? { fcm_options: { image: String(imageUrl) } } : {}),
              },
            },
          };

          const response = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            }
          );

          const result = await response.json();
          if (!response.ok) {
            if (result.error && (
              result.error.code === 404 || result.error.code === 400 ||
              result.error.details?.some((d: any) =>
                d.errorCode === 'UNREGISTERED' || d.errorCode === 'INVALID_ARGUMENT'
              )
            )) {
              await supabase.from("device_tokens").update({ is_active: false }).eq("token", device.token);
            }
            return { success: false, error: result.error?.message };
          }

          sent++;
          return { success: true };
        } catch (err) {
          console.error("[PushOnNotif] FCM error:", err);
          return { success: false, error: String(err) };
        }
      })
    );

    console.log(`[PushOnNotif] Sent ${sent}/${deviceTokens.length} push notifications for user ${userId}`);

    return new Response(
      JSON.stringify({ success: true, sent, total: deviceTokens.length }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    console.error("[PushOnNotif] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
