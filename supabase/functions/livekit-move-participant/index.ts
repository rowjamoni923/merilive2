// Pkg134 — LiveKit Move Participant
//
// Atomically MOVES a participant from one LiveKit room to another using
// `RoomServiceClient.moveParticipant(srcRoom, identity, dstRoom)`. Unlike
// Pkg128 forwardParticipant (which duplicates), moveParticipant ensures the
// participant is in exactly one room at a time.
//
// Auth modes (either one):
//   • Admin: x-admin-access-token header → full power on any rooms.
//   • Host:  Authorization: Bearer <supabase jwt> → only when caller is the
//            host of the SOURCE room (live_streams.host_id = auth.uid()
//            OR party_rooms.host_id = auth.uid() for src room_name).
//
// Kill-switch: app_settings.livekit_signaling_enabled.move_participant
//              (default OFF — admin must opt in).
import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-access-token",
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

async function validateAdminToken(
  token: string,
): Promise<{ ok: boolean; role?: "owner" | "sub_admin" }> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/validate-admin-token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ token, action: "validate" }),
      },
    );
    if (!res.ok) return { ok: false };
    const data = await res.json().catch(() => ({}));
    return data?.valid ? { ok: true, role: data.role } : { ok: false };
  } catch (e) {
    console.warn("[livekit-move] admin validate failed:", e);
    return { ok: false };
  }
}

async function resolveHostOwnership(
  jwt: string,
  roomName: string,
): Promise<{ userId: string; scope: "live" | "party" } | null> {
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: u } = await userClient.auth.getUser();
    const userId = u.user?.id;
    if (!userId) return null;

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: live } = await admin
      .from("live_streams")
      .select("host_id")
      .eq("room_name", roomName)
      .eq("host_id", userId)
      .maybeSingle();
    if (live?.host_id === userId) return { userId, scope: "live" };

    const { data: party } = await admin
      .from("party_rooms")
      .select("host_id")
      .eq("room_name", roomName)
      .eq("host_id", userId)
      .maybeSingle();
    if (party?.host_id === userId) return { userId, scope: "party" };

    return null;
  } catch (e) {
    console.warn("[livekit-move] host resolve failed", e);
    return null;
  }
}

async function killSwitchOn(admin: ReturnType<typeof createClient>): Promise<boolean> {
  try {
    const { data } = await admin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "livekit_signaling_enabled")
      .maybeSingle();
    const raw = (data?.setting_value ?? "").toString().trim();
    if (!raw) return false; // default OFF
    const v = JSON.parse(raw);
    return v?.move_participant === true;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_not_configured" });
  }

  const auditClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!(await killSwitchOn(auditClient))) {
    return json(403, { error: "move_participant_disabled" });
  }

  // ---- Auth ----
  const adminToken = req.headers.get("x-admin-access-token") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  // ---- Body ----
  const body = await req.json().catch(() => ({}));
  const srcRoom = String(body?.srcRoom ?? "").trim();
  const dstRoom = String(body?.dstRoom ?? "").trim();
  const identity = String(body?.identity ?? "").trim();
  const reason = body?.reason ? String(body.reason).slice(0, 500) : null;

  if (!srcRoom || !dstRoom || !identity) {
    return json(400, { error: "missing_required_fields" });
  }
  if (srcRoom === dstRoom) {
    return json(400, { error: "src_and_dst_must_differ" });
  }

  let actorType: "admin" | "host" = "admin";
  let actorId: string | null = null;
  let role: "owner" | "sub_admin" | "host" = "sub_admin";

  if (adminToken) {
    const v = await validateAdminToken(adminToken);
    if (!v.ok) return json(401, { error: "invalid_admin_token" });
    role = v.role ?? "sub_admin";
  } else if (jwt) {
    // Hosts may move participants only out of rooms they own.
    const owner = await resolveHostOwnership(jwt, srcRoom);
    if (!owner) return json(403, { error: "not_src_room_host" });
    actorType = "host";
    actorId = owner.userId;
    role = "host";
  } else {
    return json(401, { error: "missing_auth" });
  }

  const rsHost = LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
  const rs = new RoomServiceClient(rsHost, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  const audit = async (success: boolean, errorMessage?: string) => {
    try {
      await auditClient.from("livekit_participant_moves").insert({
        actor_type: actorType,
        actor_user_id: actorId,
        admin_token_role: role,
        src_room: srcRoom,
        dst_room: dstRoom,
        participant_identity: identity,
        reason,
        success,
        error_message: errorMessage ?? null,
      });
    } catch (e) {
      console.warn("[livekit-move] audit insert failed", e);
    }
  };

  try {
    // SDK 2.9.x signature: moveParticipant(srcRoom, identity, dstRoom).
    // Throws explicit error if the SDK method shape differs so caller knows
    // to upgrade livekit-server-sdk.
    const anyRs = rs as unknown as {
      moveParticipant?: (
        src: string,
        id: string,
        dst: string,
      ) => Promise<unknown>;
    };
    if (typeof anyRs.moveParticipant !== "function") {
      throw new Error("moveParticipant_not_supported_by_sdk");
    }
    const result = await anyRs.moveParticipant(srcRoom, identity, dstRoom);
    await audit(true);
    return json(200, { success: true, result: result ?? { moved: identity } });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.error("[livekit-move] failed", msg);
    await audit(false, msg);
    return json(500, { error: "move_failed", message: msg });
  }
});
