// Device-bound auto-login: consumes a one-time exchange token minted by
// recover_session_by_device(p_device_id) and returns a fresh Supabase
// session for the bound account. Enables "reinstall → Start → instantly
// logged back in" without storing recovery passwords on device.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function mintSessionForEmail(admin: any, email: string) {
  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkError) throw linkError;
  const tokenHash = linkData?.properties?.hashed_token;
  if (!tokenHash) throw new Error("Failed to mint session token");
  const { data: verified, error: verifyError } = await admin.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });
  if (verifyError || !verified?.session) {
    throw verifyError || new Error("Failed to create session");
  }
  return verified.session;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = typeof body?.device_id === "string" ? body.device_id.trim().slice(0, 160) : "";
    const token = typeof body?.exchange_token === "string" ? body.exchange_token.trim() : "";

    if (!/^device_[A-Za-z0-9_:-]{6,128}$/.test(deviceId)) {
      return json({ success: false, error: "Invalid device id" }, 400);
    }
    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      return json({ success: false, error: "Invalid exchange token" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Atomically consume the token (must be unused, unexpired, device-matched)
    const { data: consumed, error: consumeError } = await admin
      .from("device_session_exchange_tokens")
      .update({ consumed_at: new Date().toISOString() })
      .eq("token", token)
      .eq("device_id", deviceId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .select("user_id")
      .maybeSingle();

    if (consumeError) {
      console.error("[device-session-recover] consume error", consumeError);
      return json({ success: false, error: "Exchange failed" }, 500);
    }
    if (!consumed?.user_id) {
      return json({ success: false, error: "Exchange token expired or already used" }, 400);
    }

    // 2) Re-verify the profile is still safe to sign in (not banned/deleted, device still bound)
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, display_name, is_deleted, is_banned, is_blocked, device_id")
      .eq("id", consumed.user_id)
      .maybeSingle();
    if (profileError || !profile) {
      return json({ success: false, error: "Account not found" }, 404);
    }
    if (profile.is_deleted || profile.is_banned || profile.is_blocked) {
      return json({ success: false, error: "Account is not available" }, 403);
    }
    if (profile.device_id !== deviceId) {
      return json({ success: false, error: "Device no longer linked to this account" }, 403);
    }

    // 3) Fetch the email from auth.users (admin API)
    const { data: userRow, error: userErr } = await admin.auth.admin.getUserById(profile.id);
    if (userErr || !userRow?.user?.email) {
      console.error("[device-session-recover] getUser error", userErr);
      return json({ success: false, error: "Account email missing" }, 500);
    }

    // 4) Mint a fresh session via magic-link verifyOtp pattern (no email actually sent)
    const session = await mintSessionForEmail(admin, userRow.user.email);

    return json({
      success: true,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: {
        id: profile.id,
        display_name: profile.display_name,
      },
    });
  } catch (error: any) {
    console.error("[device-session-recover] Error", error);
    return json({ success: false, error: error?.message || "Recovery failed" }, 500);
  }
});
