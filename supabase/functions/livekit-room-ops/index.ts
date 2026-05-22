// Pkg135 — Admin LiveKit Room Ops
//
// Actions (admin-only via x-admin-access-token):
//   list_rooms                    → RoomServiceClient.listRooms()
//   list_participants {roomName}  → RoomServiceClient.listParticipants(roomName)
//   get_room {roomName}           → single room + its participants
//
// Read-only inspection. Mutations (mute/kick/disconnect) live in livekit-moderate.
// Kill-switch: app_settings.livekit_signaling_enabled.room_ops === true (default OFF)
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

type Action = "list_rooms" | "list_participants" | "get_room";
const ALLOWED: Action[] = ["list_rooms", "list_participants", "get_room"];

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
    console.warn("[livekit-room-ops] admin validate failed:", e);
    return { ok: false };
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
    if (!raw) return false; // explicit opt-in (default OFF)
    const v = JSON.parse(raw);
    return v?.room_ops === true;
  } catch {
    return false;
  }
}

async function audit(
  admin: ReturnType<typeof createClient>,
  row: {
    role: string;
    action: string;
    roomName?: string;
    identity?: string;
    resultCount?: number;
    error?: string;
  },
) {
  try {
    await admin.from("livekit_room_ops_log").insert({
      actor_admin_role: row.role,
      action: row.action,
      room_name: row.roomName ?? null,
      identity: row.identity ?? null,
      result_count: row.resultCount ?? null,
      error: row.error ?? null,
    });
  } catch (e) {
    console.warn("[livekit-room-ops] audit insert failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_not_configured" });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!(await killSwitchOn(adminClient))) {
    return json(403, { error: "room_ops_disabled" });
  }

  const adminToken = req.headers.get("x-admin-access-token") ?? "";
  if (!adminToken) return json(401, { error: "missing_admin_token" });
  const v = await validateAdminToken(adminToken);
  if (!v.ok) return json(401, { error: "invalid_admin_token" });
  const role = v.role ?? "sub_admin";

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "") as Action;
  const roomName = body?.roomName ? String(body.roomName).trim() : "";

  if (!ALLOWED.includes(action)) {
    await audit(adminClient, { role, action: String(action), error: "invalid_action" });
    return json(400, { error: "invalid_action" });
  }
  if ((action === "list_participants" || action === "get_room") && !roomName) {
    await audit(adminClient, { role, action, error: "missing_room_name" });
    return json(400, { error: "missing_room_name" });
  }

  const svc = new RoomServiceClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    if (action === "list_rooms") {
      const rooms = await svc.listRooms();
      const out = (rooms ?? []).map((r: any) => ({
        sid: r.sid,
        name: r.name,
        numParticipants: r.numParticipants ?? 0,
        numPublishers: r.numPublishers ?? 0,
        creationTime: r.creationTime ? Number(r.creationTime) : null,
        emptyTimeout: r.emptyTimeout ?? null,
        maxParticipants: r.maxParticipants ?? null,
        metadata: r.metadata ?? "",
        activeRecording: !!r.activeRecording,
      }));
      await audit(adminClient, { role, action, resultCount: out.length });
      return json(200, { rooms: out });
    }

    if (action === "list_participants") {
      const ps = await svc.listParticipants(roomName);
      const out = (ps ?? []).map((p: any) => ({
        sid: p.sid,
        identity: p.identity,
        name: p.name ?? "",
        state: p.state,
        joinedAt: p.joinedAt ? Number(p.joinedAt) : null,
        metadata: p.metadata ?? "",
        permission: p.permission ?? null,
        isPublisher: !!p.isPublisher,
        numTracks: Array.isArray(p.tracks) ? p.tracks.length : 0,
        tracks: Array.isArray(p.tracks)
          ? p.tracks.map((t: any) => ({
              sid: t.sid,
              type: t.type, // 0=audio, 1=video
              source: t.source, // 0=unknown,1=camera,2=microphone,3=screen_share,4=screen_share_audio
              name: t.name ?? "",
              muted: !!t.muted,
              mimeType: t.mimeType ?? "",
            }))
          : [],
      }));
      await audit(adminClient, { role, action, roomName, resultCount: out.length });
      return json(200, { roomName, participants: out });
    }


    // get_room → 1 room + its participants
    const rooms = await svc.listRooms([roomName]).catch(() => [] as any[]);
    const room = (rooms ?? [])[0] ?? null;
    const ps = await svc.listParticipants(roomName).catch(() => [] as any[]);
    await audit(adminClient, {
      role,
      action,
      roomName,
      resultCount: ps?.length ?? 0,
    });
    return json(200, {
      room: room
        ? {
            sid: room.sid,
            name: room.name,
            numParticipants: room.numParticipants ?? 0,
            numPublishers: room.numPublishers ?? 0,
            creationTime: room.creationTime ? Number(room.creationTime) : null,
            metadata: room.metadata ?? "",
            activeRecording: !!room.activeRecording,
          }
        : null,
      participants: (ps ?? []).map((p: any) => ({
        sid: p.sid,
        identity: p.identity,
        state: p.state,
        joinedAt: p.joinedAt ? Number(p.joinedAt) : null,
        isPublisher: !!p.isPublisher,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(adminClient, { role, action, roomName: roomName || undefined, error: msg.slice(0, 500) });
    return json(500, { error: "livekit_error", message: msg });
  }
});
