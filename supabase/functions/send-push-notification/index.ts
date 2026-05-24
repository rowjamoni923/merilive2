import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-token, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PushNotificationRequest {
  userId?: string;
  userIds?: string[];
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
  type?: 'call' | 'message' | 'gift' | 'general' | 'broadcast';
  target?: 'all' | 'android' | 'ios';
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

    const { userId, userIds, title, body, imageUrl, data = {}, type = 'general', target }: PushNotificationRequest = await req.json();
    const shouldPersistFallback = String(data.persist_fallback ?? 'true') !== 'false';

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
      const { data: sessionRow } = await supabase
        .from("admin_sessions")
        .select("admin_user_id, expires_at")
        .eq("session_token", adminToken)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (sessionRow?.admin_user_id) {
        const { data: adminUser } = await supabase
          .from("admin_users")
          .select("id, is_active")
          .eq("id", sessionRow.admin_user_id)
          .maybeSingle();
        isAdmin = !!adminUser?.is_active;
      }
    }

    let isVerifiedNotificationTrigger = false;
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
      return new Response(
        JSON.stringify({ success: false, error: "No device tokens found" }),
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

        const results = await Promise.all(
          deviceTokens.map(async (device) => {
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
                  data: {
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
                  },
                  android: {
                    priority: isCallType ? 'high' : 'high',
                    ...(isCallType ? {
                      ttl: '60s',
                    } : {
                      notification: {
                        sound: 'default',
                        // Must match a real channel in NotificationHelper
                        // ('default' did not exist → silent fallback).
                        channel_id: 'merilive_default',
                        notification_priority: 'PRIORITY_HIGH',
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

              const result = await response.json();
              console.log(`[Push] FCM V1 response for ${device.platform}:`, result);

              if (!response.ok) {
                // Handle invalid tokens
                if (result.error?.details?.some((d: { errorCode?: string }) => 
                  d.errorCode === 'UNREGISTERED' || d.errorCode === 'INVALID_ARGUMENT'
                )) {
                  await supabase
                    .from("device_tokens")
                    .update({ is_active: false })
                    .eq("token", device.token);
                  console.log(`[Push] Marked invalid token as inactive`);
                }
                return { success: false, platform: device.platform, error: result.error };
              }

              return { success: true, platform: device.platform, messageId: result.name };
            } catch (err) {
              console.error(`[Push] Error sending to ${device.platform}:`, err);
              return { success: false, platform: device.platform, error: err };
            }
          })
        );

        const successCount = results.filter(r => r.success).length;
        console.log(`[Push] Sent ${successCount}/${deviceTokens.length} notifications successfully`);

        return new Response(
          JSON.stringify({ 
            success: successCount > 0, 
            sent: successCount, 
            total: deviceTokens.length,
            results 
          }),
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
      return new Response(
        JSON.stringify({
          success: false,
          error: "FCM not configured or failed; fallback persistence skipped",
          persisted: false,
          tokens_found: deviceTokens.length
        }),
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Notification stored in database (FCM not configured)",
        tokens_found: deviceTokens.length 
      }),
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
