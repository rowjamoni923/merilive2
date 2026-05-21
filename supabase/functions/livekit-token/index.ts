// LiveKit access token issuer
// Auth: requires Supabase JWT (Authorization: Bearer <access_token>)
// Body: { roomName: string, role?: 'publisher' | 'subscriber', identity?: string, name?: string }
// Returns: { token, url, identity, room }
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { AccessToken } from "npm:livekit-server-sdk@2.9.4";

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return json(500, { error: "livekit_not_configured" });
    }

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) return json(401, { error: "invalid_token" });

    const body = await req.json().catch(() => ({}));
    const roomName = String(body?.roomName ?? "").trim();
    const role = body?.role === "subscriber" ? "subscriber" : "publisher";
    const identity = String(body?.identity ?? user.id).trim() || user.id;
    const name = body?.name ? String(body.name).slice(0, 80) : undefined;

    if (!roomName || roomName.length > 128 || !/^[A-Za-z0-9_\-:.]+$/.test(roomName)) {
      return json(400, { error: "invalid_room_name" });
    }

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name,
      ttl: 60 * 60, // 1 hour
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: role === "publisher",
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();
    return json(200, { token, url: LIVEKIT_URL, identity, room: roomName, role });
  } catch (e) {
    console.error("[livekit-token] error", e);
    return json(500, { error: "internal_error", message: String((e as Error)?.message ?? e) });
  }
});
