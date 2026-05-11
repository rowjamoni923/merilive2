/**
 * call-deliver — Reliable Call Delivery Engine
 *
 * Triggered when a private call is created. Sends FCM high-priority push
 * with retry + exponential backoff and logs every attempt to
 * call_delivery_log. Aborts early if call status changes (accepted/rejected/ended).
 *
 * Body: { callId, calleeId, callerId, callType, callerName, callerAvatar }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FCM_SERVER_KEY = Deno.env.get("FCM_SERVER_KEY") ?? "";

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

async function sendFcmHighPriority(
  token: string,
  body: DeliverBody,
  ringTimeoutSec: number,
): Promise<{ ok: boolean; error?: string }> {
  if (!FCM_SERVER_KEY) return { ok: false, error: "FCM_SERVER_KEY missing" };

  const payload = {
    to: token,
    priority: "high",
    time_to_live: ringTimeoutSec,
    content_available: true,
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
      priority: "high",
      ttl: `${ringTimeoutSec}s`,
    },
  };

  try {
    const res = await fetch("https://fcm.googleapis.com/fcm/send", {
      method: "POST",
      headers: {
        Authorization: `key=${FCM_SERVER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `FCM ${res.status}: ${text}` };
    const json = JSON.parse(text);
    if (json.failure > 0) {
      return { ok: false, error: JSON.stringify(json.results) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch fail" };
  }
}

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

    let delivered = false;
    for (let attempt = 1; attempt <= maxRetries && !delivered; attempt++) {
      // Abort if call already accepted/rejected/ended
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

      // Fan-out to all active devices in parallel
      const results = await Promise.all(
        tokens.map((tok) =>
          sendFcmHighPriority(tok, body, ringTimeoutSec).then((r) => ({
            tok,
            r,
          })),
        ),
      );

      const sentAt = new Date().toISOString();
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
        if (r.ok) delivered = true;
      }

      if (delivered) break;
      if (attempt < maxRetries) {
        // Exponential backoff: gap, gap*2, gap*4
        await new Promise((res) =>
          setTimeout(res, retryGapMs * Math.pow(2, attempt - 1)),
        );
      }
    }

    return new Response(
      JSON.stringify({ ok: true, delivered, attempts: maxRetries }),
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
