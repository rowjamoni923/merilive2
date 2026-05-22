// Pkg99 — Server-side LiveKit moderation (admin-only)
// Actions: mute_track | unmute_track | remove_participant | disconnect_room | update_participant
// Auth: x-admin-access-token (validated via validate-admin-token edge fn)
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

type Action =
  | "mute_track"
  | "unmute_track"
  | "remove_participant"
  | "disconnect_room"
  | "update_participant";

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
    console.warn("[livekit-moderate] admin validate failed:", e);
    return { ok: false };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_not_configured" });
  }

  // ---- Admin auth ----
  const adminToken = req.headers.get("x-admin-access-token") ?? "";
  if (!adminToken) return json(401, { error: "missing_admin_token" });
  const v = await validateAdminToken(adminToken);
  if (!v.ok) return json(401, { error: "invalid_admin_token" });
  const role = v.role ?? "sub_admin";

  // ---- Body validation ----
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "") as Action;
  const roomName = String(body?.roomName ?? "").trim();
  const identity = body?.identity ? String(body.identity).trim() : undefined;
  const trackSid = body?.trackSid ? String(body.trackSid).trim() : undefined;
  const reason = body?.reason ? String(body.reason).slice(0, 500) : undefined;

  if (!roomName) return json(400, { error: "missing_room_name" });
  const ALLOWED: Action[] = [
    "mute_track",
    "unmute_track",
    "remove_participant",
    "disconnect_room",
    "update_participant",
  ];
  if (!ALLOWED.includes(action)) return json(400, { error: "invalid_action" });

  if (
    (action === "mute_track" || action === "unmute_track") &&
    (!identity || !trackSid)
  ) {
    return json(400, { error: "mute_requires_identity_and_track_sid" });
  }
  if (
    (action === "remove_participant" || action === "update_participant") &&
    !identity
  ) {
    return json(400, { error: "action_requires_identity" });
  }

  // LiveKit URL → HTTP host for RoomServiceClient
  const rsHost = LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(
    /^ws:\/\//,
    "http://",
  );
  const rs = new RoomServiceClient(rsHost, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  const auditClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const audit = async (success: boolean, errorMessage?: string) => {
    try {
      await auditClient.from("livekit_moderation_log").insert({
        admin_token_role: role,
        room_name: roomName,
        participant_identity: identity ?? null,
        track_sid: trackSid ?? null,
        action,
        reason: reason ?? null,
        success,
        error_message: errorMessage ?? null,
        request_payload: body ?? null,
      });
    } catch (e) {
      console.warn("[livekit-moderate] audit insert failed", e);
    }
  };

  try {
    let result: unknown = null;
    switch (action) {
      case "mute_track":
        result = await rs.mutePublishedTrack(roomName, identity!, trackSid!, true);
        break;
      case "unmute_track":
        result = await rs.mutePublishedTrack(roomName, identity!, trackSid!, false);
        break;
      case "remove_participant":
        await rs.removeParticipant(roomName, identity!);
        result = { removed: identity };
        break;
      case "disconnect_room":
        await rs.deleteRoom(roomName);
        result = { deleted: roomName };
        break;
      case "update_participant": {
        const metadata = body?.metadata ? String(body.metadata) : undefined;
        const permission = body?.permission ?? undefined;
        result = await rs.updateParticipant(
          roomName,
          identity!,
          metadata,
          permission,
        );
        break;
      }
    }
    await audit(true);
    return json(200, { success: true, action, result });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.error("[livekit-moderate] action failed", action, msg);
    await audit(false, msg);
    return json(500, { error: "moderation_failed", message: msg });
  }
});
