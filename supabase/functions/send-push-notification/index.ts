import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-token, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PushNotificationRequest {
  requestId?: string;
  userId?: string;
  userIds?: string[];
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, unknown>;
  type?: string;
  target?: 'all' | 'android' | 'ios';
}

interface DeviceTokenRow {
  token: string;
  platform: string | null;
  user_id: string | null;
}

interface PushSendResult {
  success: boolean;
  platform: string | null;
  messageId?: string;
  error?: unknown;
}

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

// Pkg425: FCM HTTP v1 API rejects payloads whose `data` map contains reserved
// keys. Per https://firebase.google.com/docs/cloud-messaging/concept-options,
// reserved keys are: `from`, `notification`, `message_type`, and anything
// starting with `google.` or `gcm.`. ROOT CAUSE: chat-message notifications
// carried `message_type: 'gift'` etc. in their data jsonb, causing every push
// to be rejected with 400 INVALID_ARGUMENT and silently dropped. We strip /
// rename these defensively so a single bad key never kills the whole push.
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

// Pkg425 Phase-8 — type → Android notification channel mapping.
// Channels MUST exist in android/.../NotificationHelper.java.
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

const FCM_BATCH_SIZE = 25;

const chunkArray = <T,>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
};

const sanitizeIdempotencyKey = (input?: unknown): string | null => {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > 120) return null;
  return /^[a-zA-Z0-9._:-]+$/.test(trimmed) ? trimmed : null;
};

const compactFcmError = (error: unknown): Record<string, unknown> => {
  const e = (error || {}) as Record<string, unknown>;
  const nested = e.error as Record<string, unknown> | undefined;
  return {
    code: nested?.code ?? e.code ?? null,
    status: nested?.status ?? e.status ?? null,
    message: String(nested?.message ?? e.message ?? error ?? "FCM error").slice(0, 240),
  };
};

const shouldDeactivateToken = (error: unknown): boolean => {
  const e = (error || {}) as Record<string, unknown>;
  const nested = (e.error || e) as Record<string, unknown>;
  const status = String(nested.status || "");
  const message = String(nested.message || "").toLowerCase();
  const details = Array.isArray(nested.details) ? nested.details as Array<Record<string, unknown>> : [];

  // Only deactivate proven-dead registration tokens. Do NOT deactivate every
  // token on generic INVALID_ARGUMENT, because a bad image URL/payload can also
  // return INVALID_ARGUMENT and would wipe all devices in one broadcast.
  return status === "NOT_FOUND"
    || details.some((d) => String(d.errorCode || "") === "UNREGISTERED")
    || message.includes("registration token is not a valid fcm registration token")
    || message.includes("requested entity was not found");
};

const waitForExistingDispatch = async (
  supabase: ReturnType<typeof createClient>,
  idempotencyKey: string,
): Promise<Record<string, unknown>> => {
  const started = Date.now();
  while (Date.now() - started < 8_000) {
    const { data } = await supabase
      .from("push_broadcast_dispatches")
      .select("status,result")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (data?.result && typeof data.result === "object") {
      return { ...(data.result as Record<string, unknown>), idempotent_replay: true };
    }
    if (data?.status === "failed") {
      return { success: false, error: "Previous broadcast attempt failed", idempotent_replay: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  return {
    success: true,
    accepted: true,
    sent: 0,
    total: 0,
    idempotent_replay: true,
    message: "This broadcast is already processing. Please wait; do not send it again.",
  };
};

const saveDispatchResult = async (
  supabase: ReturnType<typeof createClient>,
  idempotencyKey: string | null,
  status: "completed" | "failed",
  result: Record<string, unknown>,
) => {
  if (!idempotencyKey) return;
  const { error } = await supabase
    .from("push_broadcast_dispatches")
    .update({ status, result, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("idempotency_key", idempotencyKey);
  if (error) console.warn("[Push] Could not save idempotency result:", error.message);
};

// Generate JWT for FCM V1 authentication
async function getAccessToken(credentials: ServiceAccountCredentials): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600; // 1 hour expiry

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: exp,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };

  // Encode header and payload
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const signatureInput = `${headerB64}.${payloadB64}`;

  // Import private key and sign
  const privateKeyPem = credentials.private_key;
  const pemContents = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    encoder.encode(signatureInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const jwt = `${signatureInput}.${signatureB64}`;

  // Exchange JWT for access token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenResponse.json();
  
  if (!tokenResponse.ok) {
    console.error("[FCM] Token exchange failed:", tokenData);
    throw new Error(`Token exchange failed: ${tokenData.error_description || tokenData.error}`);
  }

  return tokenData.access_token;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { requestId, userId, userIds, title, body, imageUrl, data: rawData = {}, type = 'general', target }: PushNotificationRequest = await req.json();
    const data = sanitizeFcmData(rawData);
    const shouldPersistFallback = String(data.persist_fallback ?? 'true') !== 'false';
    let dispatchKey = sanitizeIdempotencyKey(requestId) || sanitizeIdempotencyKey(rawData.broadcast_id) || sanitizeIdempotencyKey(data.broadcast_id);

    const isBroadcast = target && ['all', 'android', 'ios'].includes(target);
    const isMultiUser = Array.isArray(userIds) && userIds.length > 0;

    // ── Pkg308 deep-audit: authorize the caller ─────────────────────────────
    // Previously: any holder of the anon key (every authenticated user) could
    // broadcast push to ALL devices or to any arbitrary userId. Major spam +
    // impersonation vector. Now:
    //   • target=all/android/ios → admin session required
    //   • userIds[]              → admin session required
    //   • single userId          → admin OR caller === userId (self-push only)
    //   • service-role JWT       → allowed (internal triggers / cron)
    const authHeader = req.headers.get("authorization") || "";
    const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    const isServiceRoleCall = !!bearer && bearer === supabaseServiceKey;

    let callerUserId: string | null = null;
    if (!isServiceRoleCall && bearer) {
      try {
        const userClient = createClient(supabaseUrl, supabaseServiceKey, {
          global: { headers: { Authorization: `Bearer ${bearer}` } },
        });
        const { data: u } = await userClient.auth.getUser();
        callerUserId = u?.user?.id ?? null;
      } catch (e) {
        console.warn("[Push] auth.getUser failed:", e);
      }
    }

    let isAdmin = false;
    const adminToken = req.headers.get("x-admin-token");
    if (!isServiceRoleCall && adminToken) {
      // Pkg410 deep-audit: Admin sessions can have the token as a header OR as a bearer.
      // We check the admin_sessions table for the session_token.
      const { data: sessionRow, error: sessionErr } = await supabase
        .from("admin_sessions")
        .select("admin_user_id, expires_at")
        .eq("session_token", adminToken)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      
      if (sessionErr) {
        console.error("[Push] Session check error:", sessionErr);
      }

      if (sessionRow?.admin_user_id) {
        const { data: adminUser } = await supabase
          .from("admin_users")
          .select("id, is_active")
          .eq("id", sessionRow.admin_user_id)
          .maybeSingle();
        isAdmin = !!adminUser?.is_active;
        console.log(`[Push] Admin authorized: ${isAdmin} (User: ${sessionRow.admin_user_id})`);
      } else {
        console.warn("[Push] No valid admin session found for token");
      }
    }

    let isVerifiedNotificationTrigger = false;
    let notificationTriggerId: string | null = null;
    if (!isServiceRoleCall && !isAdmin && !callerUserId && data.origin === "notifications_trigger" && data.notification_id && userId) {
      const { data: notificationRow } = await supabase
        .from("notifications")
        .select("id,user_id,title,message,type")
        .eq("id", data.notification_id)
        .eq("user_id", userId)
        .maybeSingle();

      isVerifiedNotificationTrigger = !!notificationRow
        && notificationRow.title === title
        && notificationRow.message === body
        && notificationRow.type === type;
      notificationTriggerId = isVerifiedNotificationTrigger ? String(data.notification_id) : null;
    }

    const needsElevated = isBroadcast || isMultiUser || (!!userId && userId !== callerUserId);
    if (!isServiceRoleCall && !isAdmin && !isVerifiedNotificationTrigger && needsElevated) {
      console.warn("[Push] Unauthorized cross-user/broadcast push attempted", {
        callerUserId, userId, isMultiUser, target,
      });
      return new Response(
        JSON.stringify({ success: false, error: "Admin session required for broadcast or cross-user push" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }
    if (!isServiceRoleCall && !isAdmin && !isVerifiedNotificationTrigger && !callerUserId) {
      return new Response(
        JSON.stringify({ success: false, error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Admin broadcast idempotency: if the browser loses the response after the
    // Edge Function already completed, retrying with the same requestId must NOT
    // send a second push. The first request owns the row and all later requests
    // replay the saved result or wait briefly for it.
    const shouldUseDispatchLock = !!dispatchKey && (isBroadcast || isMultiUser);
    if (shouldUseDispatchLock) {
      const { error: lockError } = await supabase
        .from("push_broadcast_dispatches")
        .insert({
          idempotency_key: dispatchKey,
          status: "processing",
          request: {
            title,
            body,
            target,
            userIds: Array.isArray(userIds) ? userIds.slice(0, 250) : undefined,
            hasImage: !!imageUrl,
            type,
          },
        });

      if (lockError?.code === "23505") {
        const replay = await waitForExistingDispatch(supabase, dispatchKey!);
        return new Response(JSON.stringify(replay), {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      if (lockError) {
        console.warn("[Push] Idempotency lock unavailable; continuing once:", lockError.message);
        dispatchKey = null;
      }
    }

    if (isVerifiedNotificationTrigger && notificationTriggerId) {
      const { error: dispatchError } = await supabase
        .from("notification_push_dispatches")
        .insert({ notification_id: notificationTriggerId });
      if (dispatchError) {
        if (dispatchError.code === "23505") {
          return new Response(
            JSON.stringify({ success: true, skipped: true, reason: "already_dispatched" }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
        throw dispatchError;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    console.log(`[Push] ${isBroadcast ? 'Broadcasting' : isMultiUser ? `Multi-user (${userIds!.length})` : 'Sending'} notification: ${title}`);

    // Build query for device tokens
    let query = supabase
      .from("device_tokens")
      .select("token, platform, user_id")
      .eq("is_active", true);

    // Filter by user(s) or platform
    if (isMultiUser) {
      query = query.in("user_id", userIds!);
    } else if (!isBroadcast && userId) {
      query = query.eq("user_id", userId);
    } else if (target === 'android') {
      query = query.eq("platform", "android");
    } else if (target === 'ios') {
      query = query.eq("platform", "ios");
    }

    const { data: deviceTokens, error: tokensError } = await query;

    if (tokensError) {
      console.error("[Push] Error fetching device tokens:", tokensError);
      throw tokensError;
    }

    if (!deviceTokens || deviceTokens.length === 0) {
      console.log("[Push] No active device tokens found");
      const noTokenResult = { success: false, error: "No device tokens found", sent: 0, total: 0 };
      await saveDispatchResult(supabase, dispatchKey, "completed", noTokenResult);
      return new Response(
        JSON.stringify(noTokenResult),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log(`[Push] Found ${deviceTokens.length} device tokens`);

    // Use FCM V1 API with service account
    if (serviceAccountJson) {
      try {
        const credentials: ServiceAccountCredentials = JSON.parse(serviceAccountJson);
        const accessToken = await getAccessToken(credentials);
        const projectId = credentials.project_id;

        console.log(`[Push] Using FCM V1 API for project: ${projectId}`);

        const results: PushSendResult[] = [];
        for (const batch of chunkArray(deviceTokens as DeviceTokenRow[], FCM_BATCH_SIZE)) {
          const batchResults = await Promise.all(
          batch.map(async (device): Promise<PushSendResult> => {
            try {
              // Build FCM V1 message
              // For call notifications: data-only message (no notification block)
              // This ensures MyFirebaseMessagingService.onMessageReceived() is called
              // even when app is in background, allowing native IncomingCallActivity to show
              const isCallType = type === 'call' || type === 'incoming_call';
              
              const fcmMessage: Record<string, unknown> = {
                message: {
                  token: device.token,
                  // Only include notification block for non-call types
                  ...(isCallType ? {} : {
                    notification: {
                      title,
                      body,
                      // Include image in notification if provided
                      ...(imageUrl ? { image: imageUrl } : {}),
                    },
                  }),
                  data: sanitizeFcmData({
                    ...data,
                    type: isCallType ? 'incoming_call' : type,
                    title,
                    body,
                    // Pass link_url and image_url in data for native handling
                    ...(data.link_url ? { link_url: data.link_url } : {}),
                    ...(imageUrl ? { image_url: imageUrl } : {}),
                    ...(isCallType && {
                      call_id: data.call_id || '',
                      caller_id: data.caller_id || '',
                      caller_name: data.caller_name || title || '',
                      caller_avatar: data.caller_avatar || '',
                      call_type: data.call_type || 'video',
                    }),
                  }),
                  android: {
                    priority: isCallType ? 'high' : 'high',
                    ...(isCallType ? {
                      ttl: '60s',
                    } : {
                      notification: {
                        sound: 'default',
                        // Pkg425 Phase-8 — route to type-specific channel so
                        // killed-app FCM notifications inherit the correct
                        // importance/sound/vibration. Channels are created in
                        // NotificationHelper.createNotificationChannels.
                        channel_id: pickAndroidChannel(type),
                        notification_priority: channelPriority(type),
                        default_sound: true,
                        default_vibrate_timings: true,
                        visibility: 'PUBLIC',
                        ...(imageUrl ? { image: imageUrl } : {}),
                        ...(data.link_url ? { click_action: 'OPEN_LINK' } : {}),
                      },
                    }),
                  },
                  apns: {
                    headers: {
                      ...(isCallType && { 'apns-priority': '10' }),
                    },
                    payload: {
                      aps: {
                        sound: isCallType ? 'ringtone.caf' : 'default',
                        badge: 1,
                        ...(isCallType && { 'content-available': 1 }),
                      },
                    },
                    // iOS rich notification with image
                    ...(imageUrl ? {
                      fcm_options: {
                        image: imageUrl,
                      },
                    } : {}),
                  },
                },
              };

              const response = await fetch(
                `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${accessToken}`,
                  },
                  body: JSON.stringify(fcmMessage),
                }
              );

              const resultText = await response.text();
              let result: Record<string, unknown> = {};
              try { result = resultText ? JSON.parse(resultText) : {}; } catch { result = { raw: resultText.slice(0, 500) }; }

              if (!response.ok) {
                // Handle invalid tokens
                if (shouldDeactivateToken(result)) {
                  await supabase
                    .from("device_tokens")
                    .update({ is_active: false })
                    .eq("token", device.token);
                  console.log(`[Push] Marked invalid token as inactive`);
                }
                console.warn(`[Push] FCM failed for ${device.platform}:`, compactFcmError(result));
                return { success: false, platform: device.platform, error: compactFcmError(result) };
              }

              return { success: true, platform: device.platform, messageId: String(result.name || '') };
            } catch (err) {
              console.error(`[Push] Error sending to ${device.platform}:`, err);
              return { success: false, platform: device.platform, error: err instanceof Error ? err.message : String(err) };
            }
          })
          );
          results.push(...batchResults);
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.length - successCount;
        const failures = results
          .filter((r) => !r.success)
          .slice(0, 10)
          .map((r) => ({ platform: r.platform, error: r.error }));
        console.log(`[Push] Sent ${successCount}/${deviceTokens.length} notifications successfully`);

        const responsePayload = {
          success: successCount > 0,
          sent: successCount,
          total: deviceTokens.length,
          failed: failureCount,
          failures,
        };

        await saveDispatchResult(supabase, dispatchKey, successCount > 0 ? "completed" : "failed", responsePayload);

        return new Response(
          JSON.stringify(responsePayload),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (fcmError) {
        console.error("[Push] FCM V1 error:", fcmError);
        // Fall through to store in database
      }
    } else {
      console.log("[Push] FIREBASE_SERVICE_ACCOUNT_JSON not configured");
    }

    // Fallback: Store notification in database for in-app display.
    // Notifications inserted by the DB trigger already exist in the notifications table;
    // re-inserting them here creates an infinite notification -> push -> notification loop.
    if (!shouldPersistFallback) {
      const fallbackSkipped = {
        success: false,
        error: "FCM not configured or failed; fallback persistence skipped",
        persisted: false,
        tokens_found: deviceTokens.length
      };
      await saveDispatchResult(supabase, dispatchKey, "failed", fallbackSkipped);
      return new Response(
        JSON.stringify(fallbackSkipped),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fallback: Store notification in database for direct API callers only
    await supabase.from("notifications").insert({
      user_id: userId,
      type,
      title,
      message: body,
      data,
    });

    const persistedPayload = { 
        success: true, 
        message: "Notification stored in database (FCM not configured)",
        tokens_found: deviceTokens.length 
      };
    await saveDispatchResult(supabase, dispatchKey, "completed", persistedPayload);
    return new Response(
      JSON.stringify(persistedPayload),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[Push] Error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
