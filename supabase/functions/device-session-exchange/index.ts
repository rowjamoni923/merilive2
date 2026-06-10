// R2-Phase B / R2-C4: closes the plaintext-password leak in device session recovery.
//
// Flow:
//   1. `recover_session_by_device(device_id)` mints a single-use UUID token
//      (5 min TTL) and returns it WITHOUT any password.
//   2. Client calls THIS function with { token, device_id }.
//   3. We service-role-consume the token, resolve the user's email,
//      mint a magiclink via the auth admin API, verify it server-side,
//      and return only `{ access_token, refresh_token }`.
//   4. Client `setSession()` with those tokens. The deterministic
//      `meri_<device>_secure` password never reaches the browser again.
//
// CORS is restricted to known app origins. The token is single-use
// (consume_device_session_token() flips consumed_at atomically), so a
// stolen token is useless after first use AND expires in 5 minutes.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const ALLOWED_ORIGINS = new Set([
  "https://merilive.com",
  "https://www.merilive.com",
  "https://merilive2.lovable.app",
  "https://id-preview--1c59f8d2-75bb-4fc1-a074-3c08560dd44b.lovable.app",
]);

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://merilive.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() ||
    ""
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEVICE_RE = /^device_[A-Za-z0-9_:-]{6,128}$/;

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const token = String(body?.token ?? "");
    const deviceId = String(body?.device_id ?? "");

    if (!UUID_RE.test(token) || !DEVICE_RE.test(deviceId)) {
      return new Response(JSON.stringify({ error: "invalid_input" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Consume token (atomic; raises if already used / expired / wrong device)
    const { data: consumed, error: consumeErr } = await admin.rpc(
      "consume_device_session_token",
      { p_token: token, p_device_id: deviceId, p_consumer_ip: clientIp(req) },
    );
    if (consumeErr || !consumed || !Array.isArray(consumed) || consumed.length === 0) {
      return new Response(
        JSON.stringify({ error: consumeErr?.message || "token_invalid" }),
        { status: 401, headers: { ...cors, "Content-Type": "application/json" } },
      );
    }
    const userId = (consumed[0] as any).user_id as string;

    // 2) Look up the user's auth email (service_role).
    const { data: userResp, error: userErr } = await admin.auth.admin.getUserById(userId);
    if (userErr || !userResp?.user?.email) {
      console.error("[device-session-exchange] getUserById failed:", userErr?.message);
      return new Response(JSON.stringify({ error: "user_lookup_failed" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const email = userResp.user.email;

    // 3) Mint a one-shot magiclink via admin API.
    //    `generateLink` returns properties.hashed_token usable by verifyOtp.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error("[device-session-exchange] generateLink failed:", linkErr?.message);
      return new Response(JSON.stringify({ error: "link_mint_failed" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // 4) Verify the hashed_token with an anon client to materialize a real session.
    const anon = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: verifyData, error: verifyErr } = await anon.auth.verifyOtp({
      type: "magiclink",
      token_hash: linkData.properties.hashed_token,
    });
    if (verifyErr || !verifyData?.session) {
      console.error("[device-session-exchange] verifyOtp failed:", verifyErr?.message);
      return new Response(JSON.stringify({ error: "session_mint_failed" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
        user_id: userId,
      }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[device-session-exchange] unexpected:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "unknown_error" }),
      { status: 500, headers: { ...corsHeadersFor(req), "Content-Type": "application/json" } },
    );
  }
});
