// LiveKit access token issuer — v2 (matches livekitService.ts contract)
// Auth: Supabase JWT (Authorization: Bearer …) OR x-admin-access-token (admin viewer)
// Body: {
//   roomName: string,
//   roomType: 'call' | 'host_stream' | 'viewer_stream' | 'party',
//   participantName?: string,
//   hidden?: boolean,            // admin invisible viewer
//   partyCanPublish?: boolean,   // party rooms only
// }
// Returns: { token, url, identity, room, role }
import { createClient } from "npm:@supabase/supabase-js@2";
import { AccessToken } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-access-token, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type RoomType = "call" | "host_stream" | "viewer_stream" | "party";

const ALLOWED_ROOM_TYPES: ReadonlySet<RoomType> = new Set([
  "call",
  "host_stream",
  "viewer_stream",
  "party",
]);

const ROOM_NAME_RE = /^[A-Za-z0-9_\-:.]{1,128}$/;

async function validateAdminToken(token: string): Promise<{ ok: boolean; role?: "owner" | "sub_admin" }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-admin-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ token, action: "validate" }),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return data?.valid ? { ok: true, role: data.role } : { ok: false };
  } catch (e) {
    console.warn("[livekit-token] admin validate failed:", e);
    return { ok: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  try {
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return json(500, { error: "livekit_not_configured" });
    }

    const body = await req.json().catch(() => ({}));
    const roomName = String(body?.roomName ?? "").trim();
    const roomType = String(body?.roomType ?? "") as RoomType;
    const participantName = body?.participantName
      ? String(body.participantName).slice(0, 80)
      : undefined;
    const hidden = body?.hidden === true;
    const partyCanPublish = body?.partyCanPublish !== false; // default true

    if (!ROOM_NAME_RE.test(roomName)) {
      return json(400, { error: "invalid_room_name" });
    }
    if (!ALLOWED_ROOM_TYPES.has(roomType)) {
      return json(400, { error: "invalid_room_type" });
    }

    // ---- Auth: Supabase JWT preferred; admin token fallback for viewer/hidden ----
    let identity: string | null = null;
    let isAdmin = false;

    const auth = req.headers.get("Authorization") ?? "";
    if (auth.startsWith("Bearer ")) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: auth } },
      });
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) identity = user.id;
    }

    if (!identity) {
      const adminToken = req.headers.get("x-admin-access-token") ?? "";
      if (adminToken) {
        const v = await validateAdminToken(adminToken);
        if (v.ok) {
          isAdmin = true;
          identity = `admin-${v.role ?? "viewer"}-${crypto.randomUUID().slice(0, 8)}`;
        }
      }
    }

    if (!identity) return json(401, { error: "unauthorized" });

    // ---- Server-side roomName ↔ caller binding (Section #11 Pass-1) ----
    // Admins bypass binding (subscribe-only/hidden anyway).
    if (!isAdmin) {
      const svc = SUPABASE_SERVICE_ROLE_KEY
        ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
        : null;
      if (!svc) return json(500, { error: "service_role_not_configured" });

      try {
        if (roomType === "host_stream") {
          const m = /^live_([0-9a-f-]{36})$/i.exec(roomName);
          if (!m) return json(400, { error: "invalid_host_room_name" });
          const { data } = await svc
            .from("live_streams")
            .select("host_id,is_active,ended_at")
            .eq("id", m[1])
            .maybeSingle();
          if (!data || data.host_id !== identity) return json(403, { error: "not_stream_host" });
          if (data.ended_at) return json(403, { error: "stream_ended" });
        } else if (roomType === "viewer_stream") {
          const m = /^live_([0-9a-f-]{36})$/i.exec(roomName);
          if (!m) return json(400, { error: "invalid_viewer_room_name" });
          // Must be an active, non-left viewer row (created via enter_live_stream
          // for non-public rooms; trivially insertable for public rooms).
          const { data: ls } = await svc
            .from("live_streams")
            .select("host_id,is_active,ended_at,live_privacy")
            .eq("id", m[1])
            .maybeSingle();
          if (!ls || !ls.is_active || ls.ended_at) return json(403, { error: "stream_inactive" });
          if (ls.host_id !== identity) {
            const { data: ban } = await svc.rpc("is_user_live_banned", { p_user_id: identity });
            if (ban === true) return json(403, { error: "live_banned" });
            const { data: sv } = await svc
              .from("stream_viewers")
              .select("viewer_id")
              .eq("stream_id", m[1])
              .eq("viewer_id", identity)
              .is("left_at", null)
              .maybeSingle();
            if (!sv) return json(403, { error: "must_enter_stream_first" });
          }
        } else if (roomType === "call") {
          const m = /^call_([0-9a-f-]{36})$/i.exec(roomName);
          if (!m) return json(400, { error: "invalid_call_room_name" });
          const { data } = await svc
            .from("private_calls")
            .select("caller_id,host_id,ended_at")
            .eq("id", m[1])
            .maybeSingle();
          if (!data) return json(403, { error: "call_not_found" });
          if (data.ended_at) return json(403, { error: "call_ended" });
          if (data.caller_id !== identity && data.host_id !== identity) {
            return json(403, { error: "not_call_participant" });
          }
        } else if (roomType === "party") {
          const m = /^party_([0-9a-f-]{36})$/i.exec(roomName);
          if (!m) return json(400, { error: "invalid_party_room_name" });
          const { data } = await svc.rpc("can_access_party_room", {
            p_user_id: identity,
            p_room_id: m[1],
          });
          if (data !== true) return json(403, { error: "not_party_participant" });
        }
      } catch (e) {
        console.error("[livekit-token] binding check failed:", e);
        return json(500, { error: "binding_check_failed" });
      }
    }


    // ---- Permissions by roomType ----
    // host_stream → publisher; viewer_stream → subscriber-only;
    // call → publisher (1:1); party → publisher unless partyCanPublish=false.
    // Admin → always subscriber-only + hidden (invisible monitoring).
    let canPublish = false;
    let canSubscribe = true;
    let canPublishData = true;
    let hide = hidden;

    if (isAdmin) {
      canPublish = false;
      hide = true;
    } else {
      switch (roomType) {
        case "host_stream":
          canPublish = true;
          break;
        case "viewer_stream":
          canPublish = false;
          break;
        case "call":
          canPublish = true;
          break;
        case "party":
          canPublish = partyCanPublish;
          break;
      }
    }

    // Pkg189: TTL bumped 1h → 6h to cover long live/party sessions.
    // Client-side livekitTokenRefresh.ts proactively refreshes at ttl-600s.
    const TTL_SECONDS = 60 * 60 * 6; // 6 hours

    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: participantName,
      ttl: TTL_SECONDS,
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe,
      canPublishData,
      hidden: hide,
    });

    const token = await at.toJwt();
    return json(200, {
      token,
      url: LIVEKIT_URL,
      identity,
      room: roomName,
      roomType,
      role: canPublish ? "publisher" : "subscriber",
      hidden: hide,
      ttl: TTL_SECONDS,
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    });
  } catch (e) {
    console.error("[livekit-token] error", e);
    return json(500, { error: "internal_error", message: String((e as Error)?.message ?? e) });
  }
});
