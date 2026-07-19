// Broadcast App Update Push — fired automatically by app_version_settings trigger
// when admin bumps current_version_code. Sends one big-picture FCM push (with
// the 3D update banner) to every active Android device token. Mirrors the
// internal logic of send-push-notification but skips per-user fanout to avoid
// hammering FCM with thousands of single-token requests.
//
// Security model: this function is reachable without JWT (verify_jwt=false by
// default in Lovable), so we authenticate the caller by requiring the request
// to reference a real app_version_settings row whose updated_at is within the
// last 2 minutes. An attacker can't forge this without first updating the
// version row (which requires admin DB access).
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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

async function getAccessToken(
  credentials: ServiceAccountCredentials,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    sub: credentials.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
  };
  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const signatureInput = `${headerB64}.${payloadB64}`;
  const pemContents = credentials.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey, encoder.encode(signatureInput),
  );
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const jwt = `${signatureInput}.${signatureB64}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(
      `Token exchange failed: ${tokenData.error_description || tokenData.error}`,
    );
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

    // ── Auth gate: require either an admin session OR a valid CRON secret ──
    const cronSecret = Deno.env.get("CRON_SECRET") || "";
    const providedCron = req.headers.get("x-cron-secret") || "";
    const isCronCaller = !!cronSecret && providedCron === cronSecret;

    if (!isCronCaller) {
      const { requireAdminSession } = await import("../_shared/adminAuth.ts");
      const guard = await requireAdminSession(req, supabase, { ownerOnly: true });
      if (!guard.ok) {
        return new Response(
          JSON.stringify({ success: false, error: guard.error }),
          { status: guard.status, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }
    }

    const { versionSettingsId, platform: platformFilter } = await req.json()
      .catch(() => ({}));

    if (!versionSettingsId) {
      return new Response(
        JSON.stringify({ success: false, error: "versionSettingsId required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // ── Auth gate: verify this call references a recent admin version update ──
    const { data: versionRow, error: versionErr } = await supabase
      .from("app_version_settings")
      .select("id, platform, current_version, current_version_name, current_version_code, play_store_url, update_url, update_message, changelog, force_update, updated_at")
      .eq("id", versionSettingsId)
      .maybeSingle();

    if (versionErr || !versionRow) {
      return new Response(
        JSON.stringify({ success: false, error: "version row not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const updatedAt = new Date(versionRow.updated_at).getTime();
    const now = Date.now();
    if (now - updatedAt > 120_000) {
      console.warn("[broadcast-app-update] Stale version row, ignoring", {
        updatedAt, ageMs: now - updatedAt,
      });
      return new Response(
        JSON.stringify({ success: false, error: "stale version row" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }
    // ──────────────────────────────────────────────────────────────────────────

    // De-dupe: skip if we already broadcast for this exact version code.
    const versionCodeKey = String(versionRow.current_version_code || 0);
    const { data: existingDispatch } = await supabase
      .from("app_update_broadcast_log")
      .select("id")
      .eq("version_code", versionCodeKey)
      .eq("platform", versionRow.platform || "android")
      .maybeSingle();

    if (existingDispatch) {
      console.log("[broadcast-app-update] Already broadcast for code", versionCodeKey);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "already_broadcast" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Load template (banner image + copy).
    const { data: template } = await supabase
      .from("notification_templates")
      .select("title_template, title, message_template, body, image_url, icon_emoji")
      .eq("template_key", "app_update_available")
      .eq("is_active", true)
      .maybeSingle();

    if (!template) {
      return new Response(
        JSON.stringify({ success: false, error: "template app_update_available not found" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const version = versionRow.current_version_name || versionRow.current_version || "latest";
    const rawTitle = template.title_template || template.title || "🚀 Update Available";
    const title = rawTitle.replace(/{{\s*version\s*}}/g, version);
    const body = template.message_template || template.body ||
      "A new version of MeriLive is live on Play Store. Tap to update!";
    const imageUrl = template.image_url || undefined;
    const playStoreUrl = versionRow.play_store_url || versionRow.update_url ||
      "https://play.google.com/store/apps/details?id=app.lovable.1c59f8d275bb4fc1a0743c08560dd44b";

    // Pick target platforms.
    const targetPlatform = (platformFilter || versionRow.platform || "android")
      .toLowerCase();

    // Fetch all active device tokens for that platform.
    let tokensQuery = supabase
      .from("device_tokens")
      .select("token, platform")
      .eq("is_active", true);
    if (targetPlatform === "android" || targetPlatform === "ios") {
      tokensQuery = tokensQuery.eq("platform", targetPlatform);
    }
    const { data: deviceTokens, error: tokensError } = await tokensQuery;

    if (tokensError) throw tokensError;

    if (!deviceTokens || deviceTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "no devices" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    console.log(`[broadcast-app-update] Broadcasting v${version} to ${deviceTokens.length} ${targetPlatform} devices`);

    if (!serviceAccountJson) {
      return new Response(
        JSON.stringify({ success: false, error: "FIREBASE_SERVICE_ACCOUNT_JSON not configured" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const credentials: ServiceAccountCredentials = JSON.parse(serviceAccountJson);
    const accessToken = await getAccessToken(credentials);
    const projectId = credentials.project_id;

    // Chunk to avoid overwhelming FCM with one huge Promise.all.
    const CHUNK = 200;
    let okCount = 0;
    let failCount = 0;
    const invalidTokens: string[] = [];

    for (let i = 0; i < deviceTokens.length; i += CHUNK) {
      const slice = deviceTokens.slice(i, i + CHUNK);
      const results = await Promise.all(
        slice.map(async (device) => {
          try {
            const dataPayload: Record<string, string> = {
              type: "app_update",
              title,
              body,
              version,
              link_url: playStoreUrl,
              persist_fallback: "false",
            };
            if (imageUrl) dataPayload.image_url = imageUrl;

            const fcmMessage = {
              message: {
                token: device.token,
                notification: {
                  title,
                  body,
                  ...(imageUrl ? { image: imageUrl } : {}),
                },
                data: dataPayload,
                android: {
                  priority: "high",
                    sound: "default",
                    channel_id: "merilive_system",
                    notification_priority: "PRIORITY_HIGH",
                    default_sound: true,
                    default_vibrate_timings: true,
                    visibility: "PUBLIC",
                    click_action: "OPEN_LINK",
                    ...(imageUrl ? { image: imageUrl } : {}),
                  },
                },
                apns: {
                  payload: { aps: { sound: "default", badge: 1 } },
                  ...(imageUrl
                    ? { fcm_options: { image: imageUrl } }
                    : {}),
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
              },
            );

            if (!response.ok) {
              const errBody = await response.json().catch(() => ({}));
              const detail = (errBody?.error?.details ?? []) as { errorCode?: string }[];
              if (
                detail.some((d) =>
                  d.errorCode === "UNREGISTERED" || d.errorCode === "INVALID_ARGUMENT"
                )
              ) {
                invalidTokens.push(device.token);
              }
              return false;
            }
            return true;
          } catch (e) {
            console.error("[broadcast-app-update] token push failed:", e);
            return false;
          }
        }),
      );
      okCount += results.filter(Boolean).length;
      failCount += results.filter((r) => !r).length;
    }

    // Mark invalid tokens inactive.
    if (invalidTokens.length > 0) {
      await supabase
        .from("device_tokens")
        .update({ is_active: false })
        .in("token", invalidTokens);
    }

    // Record de-dupe key.
    await supabase.from("app_update_broadcast_log").insert({
      version_code: versionCodeKey,
      version_name: version,
      platform: versionRow.platform || "android",
      devices_targeted: deviceTokens.length,
      devices_delivered: okCount,
    });

    console.log(`[broadcast-app-update] Done. ok=${okCount} fail=${failCount} invalidated=${invalidTokens.length}`);

    return new Response(
      JSON.stringify({
        success: true,
        version,
        targetPlatform,
        totalDevices: deviceTokens.length,
        sent: okCount,
        failed: failCount,
        invalidated: invalidTokens.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error: any) {
    console.error("[broadcast-app-update] Error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
