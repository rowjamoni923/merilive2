import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { AccessToken } from "npm:livekit-server-sdk@^2.13.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-admin-access-token, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const adminAccessToken = req.headers.get("x-admin-access-token")?.trim();

    let identity: string | null = null;
    let isAdminBypass = false;

    // ✅ CRITICAL: Check admin secret-link token FIRST (before JWT)
    if (adminAccessToken) {
      const OWNER_TOKEN = Deno.env.get("ADMIN_OWNER_TOKEN");
      const SUBADMIN_TOKEN = Deno.env.get("ADMIN_SUBADMIN_TOKEN");

      const isValidAdminToken =
        (OWNER_TOKEN && adminAccessToken === OWNER_TOKEN) ||
        (SUBADMIN_TOKEN && adminAccessToken === SUBADMIN_TOKEN);

      if (!isValidAdminToken) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      isAdminBypass = true;
      identity = `admin-${crypto.randomUUID()}`;
    } else if (authHeader?.startsWith("Bearer ")) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } }
      );

      const token = authHeader.replace("Bearer ", "");
      const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      identity = claimsData.claims.sub as string;
    } else {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { roomName, participantName, roomType, hidden, partyCanPublish } = await req.json();

    if (!roomName) {
      return new Response(JSON.stringify({ error: "roomName is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!roomType) {
      return new Response(JSON.stringify({ error: "roomType is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin secret-link access can only issue read-only viewer tokens for stream monitoring
    if (isAdminBypass && roomType !== "viewer_stream") {
      return new Response(JSON.stringify({ error: "Forbidden room type" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LIVEKIT_API_KEY");
    const apiSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const livekitUrl = Deno.env.get("LIVEKIT_URL");

    if (!apiKey || !apiSecret || !livekitUrl) {
      console.error("LiveKit credentials not configured");
      return new Response(JSON.stringify({ error: "Server configuration error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedIdentity = identity ?? `viewer-${crypto.randomUUID()}`;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: resolvedIdentity,
      name: participantName || resolvedIdentity,
    });

    const isHost = !isAdminBypass && (roomType === "host_stream" || roomType === "host_call");

    // Party: default publish ON (web / legacy). Flutter audience sends `partyCanPublish: false` (subscribe-only).
    const allowPartyMediaPublish =
      roomType === "party" ? partyCanPublish !== false : false;

    const canPublish =
      isAdminBypass ? false : isHost || roomType === "call" || allowPartyMediaPublish;

    // hidden=true for preload connections (don't count as viewers)
    const shouldBeHidden = isAdminBypass ? true : (hidden === true);

    at.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish,
      canSubscribe: true,
      canPublishData: isAdminBypass ? false : true,
      hidden: shouldBeHidden,
    });

    // Long-running live/party/call sessions must survive host-controlled
    // duration plus reconnects. LiveKit validates this when reconnecting, so
    // keep the grant long enough for professional unlimited live sessions.
    at.ttl = "24h";

    const jwt = await at.toJwt();

    return new Response(
      JSON.stringify({
        token: jwt,
        url: livekitUrl,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("LiveKit token error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
