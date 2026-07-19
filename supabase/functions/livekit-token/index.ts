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

    // ---- Auth: admin token takes precedence for hidden monitoring ----
    // Admins may also be signed-in as a regular user; admin role grants
    // hidden, subscribe-only access to ANY room without polluting viewer_count.
    let identity: string | null = null;
    let isAdmin = false;

    const adminToken = req.headers.get("x-admin-access-token") ?? "";
    if (adminToken) {
      const v = await validateAdminToken(adminToken);
      if (v.ok) {
        isAdmin = true;
        identity = `admin-${v.role ?? "viewer"}-${crypto.randomUUID().slice(0, 8)}`;
      }
    }

    if (!isAdmin) {
      const auth = req.headers.get("Authorization") ?? "";
      if (auth.startsWith("Bearer ")) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          global: { headers: { Authorization: auth } },
        });
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) identity = user.id;
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
          // Host bypass: allow rejoin even if is_active=false / ended_at set
          // (client may have flipped it on remount/crash; host can resurrect).
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
          if (!ls || !ls.is_active || ls.ended_at) return json(200, { error: "stream_inactive", fallback: true });
          if (ls.host_id !== identity) {
            const { data: ban } = await svc.rpc("is_user_live_banned", { p_user_id: identity });
            if (ban === true) return json(403, { error: "live_banned" });
            const privacy = String(ls.live_privacy ?? "public").toLowerCase();
            if (hidden && privacy === "public") {
              // Public live preloader: subscribe-only hidden token before durable viewer row.
              // Real entry still uses enter_live_stream before visible playback/viewer count.
            } else {
              const { data: sv } = await svc
                .from("stream_viewers")
                .select("viewer_id")
                .eq("stream_id", m[1])
                .eq("viewer_id", identity)
                .is("left_at", null)
                .maybeSingle();
              if (!sv) {
                // Bug-fix #1 (viewer-race): For PUBLIC streams the client may
                // request the token in parallel with enter_live_stream — the
                // DB row may not have committed yet, which previously dumped
                // the viewer back to home with a misleading "stream ended"
                // toast. Public streams have no entry barrier, so auto-upsert
                // the viewer row here (race-safe) instead of erroring out.
                // Non-public (password / followers / pk_only) rooms still
                // require explicit enter_live_stream so this fallback only
                // applies to `public`.
                if (privacy === "public") {
                  const { error: insErr } = await svc
                    .from("stream_viewers")
                    .upsert(
                      { stream_id: m[1], viewer_id: identity, joined_at: new Date().toISOString(), left_at: null },
                      { onConflict: "stream_id,viewer_id" },
                    );
                  if (insErr) {
                    console.warn("[livekit-token] viewer auto-enter failed:", insErr);
                    return json(200, { error: "must_enter_stream_first", fallback: true });
                  }
                } else {
                  return json(200, { error: "must_enter_stream_first", fallback: true });
                }
              }
            }
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
          const roomId = m[1];
          // Host of the room is always allowed — bypasses is_active gate so
          // host can (re)join right after create_party_room or after a brief
          // client crash/remount where is_active may have been flipped off.
          const { data: pr } = await svc
            .from("party_rooms")
            .select("host_id,is_active,ended_at")
            .eq("id", roomId)
            .maybeSingle();
          if (!pr) return json(403, { error: "party_room_not_found" });
          if (pr.host_id === identity) {
            // Host: allow even if is_active=false (let host resurrect/cleanup).
            (body as Record<string, unknown>).__partyIsHost = true;
          } else {
            if (!pr.is_active || pr.ended_at) {
              return json(403, { error: "party_room_inactive" });
            }
            // Do NOT use can_access_party_room() as the participant proof here:
            // that RPC depends on caller JWT context, while this edge function
            // validates with a service-role client. The token gate must verify
            // the durable participant row directly, after enter_party_room()
            // has inserted/reactivated it.
            const { data: participant } = await svc
              .from("party_room_participants")
              .select("user_id,seat_number")
              .eq("room_id", roomId)
              .eq("user_id", identity)
              .is("left_at", null)
              .maybeSingle();
            if (!participant) {
              // Race-safe fallback (matches the public live-stream path):
              // the client may request a token in parallel with enter_party_room
              // or right after a beforeunload beacon set left_at on a remount.
              // Returning a 200 + fallback flag lets livekitService throw a
              // quiet error so the SDK can back off and retry instead of
              // exploding into a runtime "encountered an error" overlay.
              return json(200, { error: "must_enter_party_first", fallback: true });
            }

            const { data: allowed } = await svc.rpc("can_access_party_room", {
              p_user_id: identity,
              p_room_id: roomId,
            });
            if (allowed !== true) return json(403, { error: "party_access_denied" });

            // Bug-fix #2 (party-publish hole): stash seated state so the
            // permission block below grants canPublish ONLY when this
            // participant currently holds a seat. Non-seat audience get
            // canPublish=false at the LiveKit level — even a modified
            // client cannot publish until the host approves a seat and
            // livekit-update-permission promotes them in-place.
            (body as Record<string, unknown>).__partyIsHost = false;
            (body as Record<string, unknown>).__partyIsSeated =
              participant.seat_number !== null && participant.seat_number !== undefined;
          }
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
          // Bug-fix #2 (party-publish hole): Chamet-parity *with* server-side
          // seat enforcement. Room host always gets canPublish=true. Other
          // participants get canPublish=true ONLY when they currently hold a
          // seat (`party_room_participants.seat_number IS NOT NULL`). The
          // host approval flow calls livekit-update-permission → promotes
          // the participant in-place (no token reissue, no reconnect, INSTANT)
          // so the seat-up UX remains identical to before.
          // `canPublishData=true` for everyone so audience can still
          // emit chat / reaction DataPackets.
          {
            const isPartyHost = (body as Record<string, unknown>).__partyIsHost === true;
            const isSeated = (body as Record<string, unknown>).__partyIsSeated === true;
            canPublish = isPartyHost || isSeated;
          }
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
      metadata: JSON.stringify({
        appRole: roomType === "host_stream" ? "host" : "viewer",
        roomType,
        hidden: hide,
      }),
    });
    at.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish,
      canSubscribe,
      canPublishData,
    });

    const token = await at.toJwt();
    return json(200, {
      token,
      url: LIVEKIT_URL,
      identity,
      roomType,
      role: canPublish ? "publisher" : "subscriber",
      issuedAt: Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + TTL_SECONDS,
    });
  } catch (e) {
    console.error("[livekit-token] error", e);
    return json(500, { error: "internal_error", message: String((e as Error)?.message ?? e) });
  }
});
