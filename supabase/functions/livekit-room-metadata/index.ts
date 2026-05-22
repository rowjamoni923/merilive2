// Pkg122: LiveKit Room Metadata
//
// Server-side update of LiveKit Room metadata via RoomServiceClient.
// Host owns scope (live/party/call); admin can call any room via
// x-admin-access-token.
//
// Body:
//   { action: 'set', scope, scopeId, roomName, metadata }  // metadata: object | null
//
// Kill-switch: app_settings.livekit_signaling_enabled.room_metadata === true
import { createClient } from "npm:@supabase/supabase-js@2";
import * as LK from "npm:livekit-server-sdk@2.9.4";

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

const httpUrl = LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const MAX_METADATA_BYTES = 64 * 1024; // 64KB safety cap

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function validateAdminToken(token: string) {
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
    if (!res.ok) return { ok: false as const };
    const data = await res.json().catch(() => ({}));
    return data?.valid ? { ok: true as const } : { ok: false as const };
  } catch (e) {
    console.warn("[Pkg122] admin validate failed:", e);
    return { ok: false as const };
  }
}

async function killSwitchEnabled(admin: ReturnType<typeof createClient>) {
  try {
    const { data } = await admin
      .from("app_settings")
      .select("setting_value")
      .eq("setting_key", "livekit_signaling_enabled")
      .maybeSingle();
    if (!data?.setting_value) return false;
    const parsed = JSON.parse(String(data.setting_value));
    return parsed?.room_metadata === true;
  } catch {
    return false;
  }
}

async function ownsRoom(
  admin: ReturnType<typeof createClient>,
  userId: string,
  scope: "call" | "live" | "party",
  scopeId: string,
): Promise<boolean> {
  if (!scopeId) return false;
  try {
    if (scope === "live") {
      const { data } = await admin
        .from("live_streams")
        .select("host_id")
        .eq("id", scopeId)
        .maybeSingle();
      return data?.host_id === userId;
    }
    if (scope === "party") {
      const { data } = await admin
        .from("party_rooms")
        .select("host_id")
        .eq("id", scopeId)
        .maybeSingle();
      return data?.host_id === userId;
    }
    if (scope === "call") {
      const { data } = await admin
        .from("private_calls")
        .select("caller_id,host_id")
        .eq("id", scopeId)
        .maybeSingle();
      return data?.caller_id === userId || data?.host_id === userId;
    }
  } catch (e) {
    console.warn("[Pkg122] ownsRoom failed:", e);
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_env_missing" });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!(await killSwitchEnabled(admin))) {
    return json(403, { error: "room_metadata_disabled" });
  }

  const adminToken = req.headers.get("x-admin-access-token") ?? "";
  let asAdmin = false;
  let userId: string | null = null;

  if (adminToken) {
    const v = await validateAdminToken(adminToken);
    if (!v.ok) return json(401, { error: "invalid_admin_token" });
    asAdmin = true;
  } else {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json(401, { error: "missing_auth" });
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user?.id) return json(401, { error: "invalid_jwt" });
    userId = u.user.id;
  }

  const body = await req.json().catch(() => ({} as any));
  const action = body?.action;
  if (action !== "set") return json(400, { error: "unknown_action" });

  const { scope, scopeId, roomName, metadata } = body as {
    scope: "call" | "live" | "party";
    scopeId: string;
    roomName: string;
    metadata: Record<string, unknown> | null;
  };

  if (!scope || !["call", "live", "party"].includes(scope)) {
    return json(400, { error: "invalid_scope" });
  }
  if (!roomName || typeof roomName !== "string") return json(400, { error: "invalid_room" });
  if (metadata !== null && (typeof metadata !== "object" || Array.isArray(metadata))) {
    return json(400, { error: "metadata_must_be_object_or_null" });
  }

  if (!asAdmin) {
    if (!scopeId) return json(400, { error: "scope_id_required_for_host" });
    if (!(await ownsRoom(admin, userId!, scope, scopeId))) {
      return json(403, { error: "not_room_owner" });
    }
  }

  const serialized = metadata === null ? "" : JSON.stringify(metadata);
  if (serialized.length > MAX_METADATA_BYTES) {
    return json(413, { error: "metadata_too_large", limit: MAX_METADATA_BYTES });
  }

  try {
    const rsc = new (LK as any).RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    await rsc.updateRoomMetadata(roomName, serialized);
    return json(200, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Pkg122] updateRoomMetadata failed:", msg);
    return json(502, { error: "update_failed", detail: msg });
  }
});
