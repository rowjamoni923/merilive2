// Pkg130 — LiveKit Participant Permission Update
//
// Promote/demote a participant in-place (audience ⇄ speaker, hide, lock chat)
// via `RoomServiceClient.updateParticipant(room, identity, { permission })`.
// The participant stays connected; LiveKit re-sends new ParticipantPermission
// to their SDK which transparently starts/stops publishing.
//
// Auth (either):
//   • Admin: x-admin-access-token → any room.
//   • Host:  Authorization: Bearer <supabase jwt> → live_streams.host_id or
//            party_rooms.host_id must match auth.uid() for `roomName`.
//
// Kill-switch: app_settings.livekit_signaling_enabled.update_permission
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

async function validateAdminToken(token: string) {
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
    if (!res.ok) return { ok: false } as const;
    const data = await res.json().catch(() => ({}));
    return data?.valid
      ? { ok: true, role: (data.role ?? "sub_admin") as "owner" | "sub_admin" }
      : { ok: false } as const;
  } catch (e) {
    console.warn("[livekit-perm] admin validate failed:", e);
    return { ok: false } as const;
  }
}

async function resolveHostOwnership(jwt: string, roomName: string) {
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
    if (live?.host_id === userId) return { userId, scope: "live" as const };

    const { data: party } = await admin
      .from("party_rooms")
      .select("host_id")
      .eq("room_name", roomName)
      .eq("host_id", userId)
      .maybeSingle();
    if (party?.host_id === userId) return { userId, scope: "party" as const };

    return null;
  } catch (e) {
    console.warn("[livekit-perm] host resolve failed", e);
    return null;
  }
}

async function killSwitchOn(admin: ReturnType<typeof createClient>) {
  try {
    const { data } = await admin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "livekit_signaling_enabled")
      .maybeSingle();
    const raw = (data?.setting_value ?? "").toString().trim();
    if (!raw) return false;
    const v = JSON.parse(raw);
    return v?.update_permission === true;
  } catch {
    return false;
  }
}

// Allowed permission keys per LiveKit ParticipantPermission proto.
const ALLOWED_KEYS = new Set([
  "canSubscribe",
  "canPublish",
  "canPublishData",
  "canPublishSources",
  "hidden",
  "canUpdateMetadata",
  "recorder",
  "agent",
]);

function sanitizePermission(input: unknown): Record<string, unknown> | null {
  if (!input || typeof input !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (k === "canPublishSources") {
      if (!Array.isArray(v)) continue;
      out[k] = v.map(String);
    } else {
      out[k] = typeof v === "boolean" ? v : Boolean(v);
    }
  }
  return Object.keys(out).length ? out : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_not_configured" });
  }

  const auditClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!(await killSwitchOn(auditClient))) {
    return json(403, { error: "update_permission_disabled" });
  }

  const body = await req.json().catch(() => ({}));
  const roomName = String(body?.roomName ?? "").trim();
  const identity = String(body?.identity ?? "").trim();
  const reason = body?.reason ? String(body.reason).slice(0, 500) : null;
  const permission = sanitizePermission(body?.permission);

  if (!roomName || !identity) return json(400, { error: "missing_required_fields" });
  if (!permission) return json(400, { error: "invalid_or_empty_permission" });

  const adminToken = req.headers.get("x-admin-access-token") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  let actorType: "admin" | "host" = "admin";
  let actorId: string | null = null;
  let role: "owner" | "sub_admin" | "host" = "sub_admin";

  if (adminToken) {
    const v = await validateAdminToken(adminToken);
    if (!v.ok) return json(401, { error: "invalid_admin_token" });
    role = v.role;
  } else if (jwt) {
    const owner = await resolveHostOwnership(jwt, roomName);
    if (!owner) return json(403, { error: "not_room_host" });
    actorType = "host";
    actorId = owner.userId;
    role = "host";
  } else {
    return json(401, { error: "missing_auth" });
  }

  const rsHost = LIVEKIT_URL
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://");
  const rs = new RoomServiceClient(rsHost, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  const audit = async (success: boolean, errorMessage?: string) => {
    try {
      await auditClient.from("livekit_permission_updates").insert({
        actor_type: actorType,
        actor_user_id: actorId,
        admin_token_role: role,
        room_name: roomName,
        participant_identity: identity,
        permission,
        reason,
        success,
        error_message: errorMessage ?? null,
      });
    } catch (e) {
      console.warn("[livekit-perm] audit insert failed", e);
    }
  };

  try {
    // SDK 2.9.x: updateParticipant(room, identity, options)
    // where options = { metadata?, permission?, name?, attributes? }
    const result = await rs.updateParticipant(
      roomName,
      identity,
      // deno-lint-ignore no-explicit-any
      { permission: permission as any },
    );
    await audit(true);
    return json(200, { success: true, result: result ?? { identity, permission } });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.error("[livekit-perm] failed", msg);
    await audit(false, msg);
    return json(500, { error: "update_permission_failed", message: msg });
  }
});
