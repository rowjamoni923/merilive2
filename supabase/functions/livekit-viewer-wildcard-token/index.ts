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

const TTL_SECONDS = 6 * 60 * 60; // 6 hours (authed users)
const GUEST_TTL_SECONDS = 90; // 90 seconds preview for unauthenticated visitors (Chamet/Bigo standard)

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function randomId(len = 12) {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return json(500, { error: "livekit_not_configured" });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    let identity: string;
    let ttl: number;
    let isGuest = false;

    if (authHeader.startsWith("Bearer ")) {
      // Authenticated path — long-lived wildcard token
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const jwt = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims(jwt);
      if (claimsErr || !claimsData?.claims?.sub) {
        // Fall through to guest mode instead of hard 401 — preview is public.
        isGuest = true;
        identity = `guest-${randomId(8)}`;
        ttl = GUEST_TTL_SECONDS;
      } else {
        const userId = String(claimsData.claims.sub);
        identity = `wv-${userId}`;
        ttl = TTL_SECONDS;
      }
    } else {
      // Unauthenticated visitor — short-lived guest preview token
      isGuest = true;
      identity = `guest-${randomId(8)}`;
      ttl = GUEST_TTL_SECONDS;
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      ttl,
    });
    at.addGrant({
      roomJoin: true,
      room: "*", // wildcard — valid for any room
      canPublish: false,
      canPublishData: false,
      canSubscribe: true,
      hidden: isGuest, // guests are invisible in viewer list (don't inflate counts / no chat presence)
    });

    const token = await at.toJwt();
    const expiresAt = Math.floor(Date.now() / 1000) + ttl;

    return json(200, {
      token,
      url: LIVEKIT_URL,
      identity,
      ttl,
      expiresAt,
      guest: isGuest,
    });
  } catch (e) {
    console.error("[livekit-viewer-wildcard-token] error:", e);
    return json(500, { error: "internal_error" });
  }
});

