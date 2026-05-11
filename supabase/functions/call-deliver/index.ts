/**
 * call-deliver — Reliable Call Delivery Engine (FCM HTTP v1)
 *
 * Triggered after a private call is created. Sends FCM high-priority
 * data-only push with retry + exponential backoff and logs every attempt.
 * Aborts early if the call is no longer pending.
 *
 * Body: { callId, calleeId, callerId, callType, callerName, callerAvatar }
 *
 * Requires secret: FIREBASE_SERVICE_ACCOUNT_JSON (full service account JSON)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FIREBASE_SA_JSON = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") ?? "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

interface DeliverBody {
  callId: string;
  calleeId: string;
  callerId: string;
  callType: "video" | "audio";
  callerName: string;
  callerAvatar?: string;
}

// ---- FCM HTTP v1: OAuth token cache ----
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

async function pemToCryptoKey(pem: string): Promise<CryptoKey> {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function getFcmAccessToken(): Promise<{ token: string; projectId: string }> {
  if (!FIREBASE_SA_JSON) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON missing");
  const sa = JSON.parse(FIREBASE_SA_JSON);

  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return { token: cachedAccessToken.token, projectId: sa.project_id };
  }

  const key = await pemToCryptoKey(sa.private_key);
  const jwt = await create(
    { alg: "RS256", typ: "JWT" },
    {
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: getNumericDate(0),
      exp: getNumericDate(3600),
    },
    key,
  );

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`FCM oauth failed: ${await res.text()}`);
  const json = await res.json();
  cachedAccessToken = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return { token: json.access_token, projectId: sa.project_id };
}

// ---- DB helpers ----
async function getSetting(key: string, fallback: number): Promise<number> {
  const { data } = await admin
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", key)
    .maybeSingle();
  const raw = data?.setting_value;
  if (raw == null) return fallback;
  const n = Number(typeof raw === "string" ? raw : JSON.stringify(raw));
  return Number.isFinite(n) ? n : fallback;
}

async function callIsStillPending(callId: string): Promise<boolean> {
  const { data } = await admin
    .from("private_calls")
    .select("status")
    .eq("id", callId)
    .maybeSingle();
  return data?.status === "pending" || data?.status === "ringing";
}

async function getFcmTokens(userId: string): Promise<string[]> {
  const { data } = await admin
    .from("user_fcm_tokens")
    .select("fcm_token")
    .eq("user_id", userId)
    .eq("is_active", true);
  return (data ?? []).map((r: any) => r.fcm_token).filter(Boolean);
}

async function logAttempt(row: {
  call_id: string;
  callee_id: string;
  attempt_number: number;
  channel: string;
  fcm_token?: string;
  status: string;
  error_message?: string;
  sent_at?: string;
}) {
  await admin.from("call_delivery_log").insert(row);
}

async function deactivateBadToken(token: string) {
  await admin
    .from("user_fcm_tokens")
    .update({ is_active: false })
    .eq("fcm_token", token);
}

// ---- FCM HTTP v1 send ----
async function sendFcmV1(
  accessToken: string,
  projectId: string,
  token: string,
  body: DeliverBody,
  ringTimeoutSec: number,
): Promise<{ ok: boolean; error?: string; unregistered?: boolean }> {
  const message = {
    message: {
      token,
      data: {
        type: "incoming_call",
        call_id: body.callId,
        caller_id: body.callerId,
        caller_name: body.callerName,
        caller_avatar: body.callerAvatar ?? "",
        call_type: body.callType,
        ring_timeout_seconds: String(ringTimeoutSec),
        ts: String(Date.now()),
      },
      android: {
        priority: "HIGH",
        ttl: `${ringTimeoutSec}s`,
        direct_boot_ok: true,
      },
      apns: {
        headers: {
          "apns-priority": "10",
          "apns-push-type": "voip",
          "apns-expiration": String(Math.floor(Date.now() / 1000) + ringTimeoutSec),
        },
      },
    },
  };

  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      },
    );
    const text = await res.text();
    if (res.ok) return { ok: true };

    // 404 UNREGISTERED / 400 INVALID_ARGUMENT (bad token) → deactivate
    const unregistered =
      text.includes("UNREGISTERED") || text.includes("registration-token-not-registered");
    return { ok: false, error: `FCM ${res.status}: ${text}`, unregistered };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch fail" };
  }
}

// ---- main ----
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = (await req.json()) as DeliverBody;
    if (!body?.callId || !body?.calleeId || !body?.callerId) {
      return new Response(JSON.stringify({ error: "missing fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const maxRetries = await getSetting("call_delivery_max_retries", 3);
    const retryGapMs = await getSetting("call_delivery_retry_gap_ms", 2000);
    const ringTimeoutSec = await getSetting("call_ring_timeout_seconds", 30);

    const tokens = await getFcmTokens(body.calleeId);
    if (tokens.length === 0) {
      await logAttempt({
        call_id: body.callId,
        callee_id: body.calleeId,
        attempt_number: 1,
        channel: "fcm",
        status: "failed",
        error_message: "no_fcm_token",
      });
      return new Response(
        JSON.stringify({ ok: false, reason: "no_fcm_token" }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { token: accessToken, projectId } = await getFcmAccessToken();

    let delivered = false;
    let activeTokens = [...tokens];

    for (let attempt = 1; attempt <= maxRetries && !delivered; attempt++) {
      if (!(await callIsStillPending(body.callId))) {
        await logAttempt({
          call_id: body.callId,
          callee_id: body.calleeId,
          attempt_number: attempt,
          channel: "fcm",
          status: "expired",
          error_message: "call_no_longer_pending",
        });
        break;
      }

      const results = await Promise.all(
        activeTokens.map((tok) =>
          sendFcmV1(accessToken, projectId, tok, body, ringTimeoutSec).then(
            (r) => ({ tok, r }),
          ),
        ),
      );

      const sentAt = new Date().toISOString();
      const survivingTokens: string[] = [];

      for (const { tok, r } of results) {
        await logAttempt({
          call_id: body.callId,
          callee_id: body.calleeId,
          attempt_number: attempt,
          channel: "fcm",
          fcm_token: tok,
          status: r.ok ? "sent" : "failed",
          error_message: r.error,
          sent_at: sentAt,
        });
        if (r.ok) {
          delivered = true;
          survivingTokens.push(tok);
        } else if (r.unregistered) {
          await deactivateBadToken(tok);
        } else {
          survivingTokens.push(tok); // transient — retry
        }
      }
      activeTokens = survivingTokens;
      if (activeTokens.length === 0) break;
      if (delivered) break;

      if (attempt < maxRetries) {
        await new Promise((res) =>
          setTimeout(res, retryGapMs * Math.pow(2, attempt - 1)),
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, delivered, attempts_used: maxRetries }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
