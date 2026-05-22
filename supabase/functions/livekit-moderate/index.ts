// Pkg99 + Pkg127 — Server-side LiveKit moderation
//
// Pkg99 (admin) actions:
//   mute_track | unmute_track | remove_participant | disconnect_room | update_participant
// Pkg127 (host OR admin) bulk + identity-based actions:
//   mute_all_audio | unmute_all_audio |
//   mute_participant_audio | unmute_participant_audio | kick_participant
//
// Auth modes (either one):
//   • Admin: x-admin-access-token header → full power on any room.
//   • Host:  Authorization: Bearer <supabase jwt> → only on rooms they own
//            (live_streams.host_id = auth.uid() OR party_rooms.host_id = auth.uid()
//             where room_name matches).
//
// Kill-switch: app_settings.livekit_signaling_enabled.moderation === true (default ON)
import { createClient } from "npm:@supabase/supabase-js@2";
import { RoomServiceClient, TrackSource } from "npm:livekit-server-sdk@2.9.4";

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
  | "update_participant"
  // Pkg127 bulk + identity-based:
  | "mute_all_audio"
  | "unmute_all_audio"
  | "mute_participant_audio"
  | "unmute_participant_audio"
  | "kick_participant";

const HOST_ALLOWED: Action[] = [
  "mute_all_audio",
  "unmute_all_audio",
  "mute_participant_audio",
  "unmute_participant_audio",
  "kick_participant",
];

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
    console.warn("[livekit-moderate] host resolve failed", e);
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
    if (!raw) return true;
    const v = JSON.parse(raw);
    return v?.moderation !== false; // default ON
  } catch {
    return true;
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
    return json(403, { error: "moderation_disabled" });
  }

  // ---- Auth: admin token (preferred) or host JWT ----
  const adminToken = req.headers.get("x-admin-access-token") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";

  // ---- Body ----
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "") as Action;
  const roomName = String(body?.roomName ?? "").trim();
  const identity = body?.identity ? String(body.identity).trim() : undefined;
  const trackSid = body?.trackSid ? String(body.trackSid).trim() : undefined;
  const reason = body?.reason ? String(body.reason).slice(0, 500) : undefined;

  const ALLOWED: Action[] = [
    "mute_track",
    "unmute_track",
    "remove_participant",
    "disconnect_room",
    "update_participant",
    "mute_all_audio",
    "unmute_all_audio",
    "mute_participant_audio",
    "unmute_participant_audio",
    "kick_participant",
  ];
  if (!roomName) return json(400, { error: "missing_room_name" });
  if (!ALLOWED.includes(action)) return json(400, { error: "invalid_action" });

  let actorType: "admin" | "host" = "admin";
  let actorId: string | null = null;
  let role: "owner" | "sub_admin" | "host" = "sub_admin";

  if (adminToken) {
    const v = await validateAdminToken(adminToken);
    if (!v.ok) return json(401, { error: "invalid_admin_token" });
    role = v.role ?? "sub_admin";
  } else if (jwt) {
    if (!HOST_ALLOWED.includes(action)) {
      return json(403, { error: "host_action_not_allowed" });
    }
    const owner = await resolveHostOwnership(jwt, roomName);
    if (!owner) return json(403, { error: "not_room_host" });
    actorType = "host";
    actorId = owner.userId;
    role = "host";
  } else {
    return json(401, { error: "missing_auth" });
  }

  if (
    (action === "mute_track" || action === "unmute_track") &&
    (!identity || !trackSid)
  ) {
    return json(400, { error: "mute_requires_identity_and_track_sid" });
  }
  if (
    (action === "remove_participant" ||
      action === "update_participant" ||
      action === "mute_participant_audio" ||
      action === "unmute_participant_audio" ||
      action === "kick_participant") &&
    !identity
  ) {
    return json(400, { error: "action_requires_identity" });
  }

  const rsHost = LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(
    /^ws:\/\//,
    "http://",
  );
  const rs = new RoomServiceClient(rsHost, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  const audit = async (
    success: boolean,
    extra?: Record<string, unknown>,
    errorMessage?: string,
  ) => {
    try {
      await auditClient.from("livekit_moderation_log").insert({
        admin_token_role: role,
        actor_type: actorType,
        actor_user_id: actorId,
        room_name: roomName,
        participant_identity: identity ?? null,
        track_sid: trackSid ?? null,
        action,
        reason: reason ?? null,
        success,
        error_message: errorMessage ?? null,
        request_payload: { ...body, ...(extra ?? {}) },
      });
    } catch (e) {
      console.warn("[livekit-moderate] audit insert failed", e);
    }
  };

  // ---- Bulk + identity-based audio helpers ----
  async function muteAudioForIdentity(targetIdentity: string, mute: boolean): Promise<number> {
    const parts = await rs.listParticipants(roomName);
    const p = parts.find((x: any) => x.identity === targetIdentity);
    if (!p) return 0;
    const tracks = (p.tracks ?? []) as any[];
    let count = 0;
    for (const t of tracks) {
      if (t.source !== TrackSource.MICROPHONE) continue;
      if (mute === !!t.muted) continue; // already in desired state
      try {
        await rs.mutePublishedTrack(roomName, targetIdentity, t.sid, mute);
        count++;
      } catch (e) {
        console.warn("[livekit-moderate] mute track failed", targetIdentity, t.sid, (e as Error).message);
      }
    }
    return count;
  }

  async function muteAllAudio(mute: boolean, excludeIdentity?: string | null): Promise<{ participants: number; tracks: number }> {
    const parts = await rs.listParticipants(roomName);
    let pCount = 0;
    let tCount = 0;
    for (const p of parts as any[]) {
      if (excludeIdentity && p.identity === excludeIdentity) continue;
      const tracks = (p.tracks ?? []) as any[];
      let muted = 0;
      for (const t of tracks) {
        if (t.source !== TrackSource.MICROPHONE) continue;
        if (mute === !!t.muted) continue;
        try {
          await rs.mutePublishedTrack(roomName, p.identity, t.sid, mute);
          muted++;
        } catch (e) {
          console.warn("[livekit-moderate] bulk mute failed", p.identity, t.sid, (e as Error).message);
        }
      }
      if (muted > 0) {
        pCount++;
        tCount += muted;
      }
    }
    return { participants: pCount, tracks: tCount };
  }

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
      case "kick_participant":
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
      case "mute_all_audio": {
        // Hosts auto-exclude themselves; admins may pass `excludeIdentity` explicitly.
        const exclude = actorType === "host"
          ? (actorId ?? null)
          : (body?.excludeIdentity ? String(body.excludeIdentity) : null);
        result = await muteAllAudio(true, exclude);
        break;
      }
      case "unmute_all_audio": {
        const exclude = actorType === "host"
          ? (actorId ?? null)
          : (body?.excludeIdentity ? String(body.excludeIdentity) : null);
        result = await muteAllAudio(false, exclude);
        break;
      }
      case "mute_participant_audio": {
        const n = await muteAudioForIdentity(identity!, true);
        result = { tracks_muted: n };
        break;
      }
      case "unmute_participant_audio": {
        const n = await muteAudioForIdentity(identity!, false);
        result = { tracks_unmuted: n };
        break;
      }
    }
    await audit(true, { result });
    return json(200, { success: true, action, result });
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    console.error("[livekit-moderate] action failed", action, msg);
    await audit(false, undefined, msg);
    return json(500, { error: "moderation_failed", message: msg });
  }
});
