// LiveKit wildcard VIEWER token issuer — Phase 1 of instant-entry architecture.
//
// Purpose: Mint ONE long-lived (6h) viewer token per user session that is valid
// for ANY room (`room: "*"`, canPublish: false, canSubscribe: true). Client
// caches in localStorage and reuses across all viewer entries (live tiles,
// party browse, etc.) — eliminates the 200-400ms token fetch from the
// tap-to-first-frame critical path.
//
// Security: viewer-only, no publish rights. Subscribe-only on any room.
// Auth: Supabase JWT required.
import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const TTL_SECONDS = 6 * 60 * 60; // 6 hours

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return json(500, { error: "livekit_not_configured" });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json(401, { error: "unauthorized" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const jwt = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(jwt);
    if (claimsErr || !claimsData?.claims?.sub) {
      return json(401, { error: "unauthorized" });
    }

    const userId = String(claimsData.claims.sub);
    // Stable wildcard identity — prefix avoids collision with per-room identities.
    const identity = `wv-${userId}`;

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl: TTL_SECONDS,
    });
    at.addGrant({
      roomJoin: true,
      room: "*", // wildcard — valid for any room
      canPublish: false,
      canPublishData: false,
      canSubscribe: true,
      hidden: false,
    });

    const token = await at.toJwt();
    const expiresAt = Math.floor(Date.now() / 1000) + TTL_SECONDS;

    return json(200, {
      token,
      url: LIVEKIT_URL,
      identity,
      ttl: TTL_SECONDS,
      expiresAt,
    });
  } catch (e) {
    console.error("[livekit-viewer-wildcard-token] error:", e);
    return json(500, { error: "internal_error" });
  }
});
