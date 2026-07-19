// Pkg117: LiveKit Agents (Voice AI dispatch)
//
// Dispatches a registered LiveKit Agent worker (Python/Node, registered with
// LiveKit Cloud) into a target room. Uses AgentDispatchClient when available
// in the server SDK and falls back to the raw HTTP TwirpRPC otherwise.
//
// Auth: JWT (Authorization: Bearer <user-jwt>). Hosts dispatch into their own
// rooms; admins dispatch anywhere via x-admin-access-token.
//
// Body:
//   { action: 'dispatch', scope, scopeId?, roomName, agentName, metadata? }
//   { action: 'cancel',   dispatchId, roomName }
//   { action: 'list',     roomName }
//
// Kill-switch: app_settings.livekit_signaling_enabled.agent === true
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
    return data?.valid ? { ok: true as const, role: data.role as string } : { ok: false as const };
  } catch (e) {
    console.warn("[Pkg117] admin validate failed:", e);
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
    return parsed?.agent === true;
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
    console.warn("[Pkg117] ownsRoom failed:", e);
  }
  return false;
}

// AgentDispatch via SDK if exported, else raw TwirpRPC fallback.
async function createDispatch(roomName: string, agentName: string, metadata?: unknown) {
  const AnyLK = LK as unknown as Record<string, any>;
  const Client = AnyLK.AgentDispatchClient ?? AnyLK.AgentDispatchService;
  if (Client) {
    const c = new Client(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    return await c.createDispatch(roomName, agentName, {
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });
  }
  // Fallback: raw TwirpRPC. Requires a server-signed JWT with roomAdmin grant.
  const at = new (LK as any).AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: "server-dispatcher",
  });
  at.addGrant({ roomAdmin: true, room: roomName });
  const jwt = await at.toJwt();
  const res = await fetch(`${httpUrl}/twirp/livekit.AgentDispatchService/CreateDispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({
      room: roomName,
      agent_name: agentName,
    }),
  });
  if (!res.ok) throw new Error(`agent_dispatch_http_${res.status}`);
  return await res.json();
}

async function deleteDispatch(roomName: string, dispatchId: string) {
  const AnyLK = LK as unknown as Record<string, any>;
  const Client = AnyLK.AgentDispatchClient ?? AnyLK.AgentDispatchService;
  if (Client) {
    const c = new Client(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    return await c.deleteDispatch(dispatchId, roomName);
  }
  const at = new (LK as any).AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: "server-dispatcher",
  });
  at.addGrant({ roomAdmin: true, room: roomName });
  const jwt = await at.toJwt();
  const res = await fetch(`${httpUrl}/twirp/livekit.AgentDispatchService/DeleteDispatch`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ dispatch_id: dispatchId, room: roomName }),
  });
  if (!res.ok) throw new Error(`agent_delete_http_${res.status}`);
  return await res.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_env_missing" });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!(await killSwitchEnabled(admin))) {
    return json(403, { error: "agent_disabled" });
  }

  // Auth: admin token OR user JWT
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

  try {
    if (action === "dispatch") {
      const { scope, scopeId, roomName, agentName, metadata } = body as {
        scope: "call" | "live" | "party";
        scopeId?: string;
        roomName: string;
        agentName: string;
        metadata?: unknown;
      };
      if (!scope || !["call", "live", "party"].includes(scope)) {
        return json(400, { error: "invalid_scope" });
      }
      if (!roomName || typeof roomName !== "string") return json(400, { error: "invalid_room" });
      if (!agentName || typeof agentName !== "string") return json(400, { error: "invalid_agent" });

      if (!asAdmin) {
        if (!scopeId) return json(400, { error: "scope_id_required_for_host" });
        if (!(await ownsRoom(admin, userId!, scope, scopeId))) {
          return json(403, { error: "not_room_owner" });
        }
      }

      // Audit row FIRST (pending) so failures are captured.
      const { data: row, error: insErr } = await admin
        .from("agent_dispatches")
        .insert({
          scope,
          scope_id: scopeId ?? null,
          room_name: roomName,
          agent_name: agentName,
          initiator_id: userId,
          initiator_role: asAdmin ? "admin" : "host",
          status: "pending",
        })
        .select()
        .single();
      if (insErr || !row) return json(500, { error: "audit_insert_failed", detail: insErr?.message });

      try {
        const dispatched: any = await createDispatch(roomName, agentName, metadata);
        const dispatchId = dispatched?.id ?? dispatched?.dispatch_id ?? null;
        await admin
          .from("agent_dispatches")
          .update({ status: "dispatched", dispatch_id: dispatchId })
          .eq("id", row.id);
        return json(200, { ok: true, id: row.id, dispatchId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin
          .from("agent_dispatches")
          .update({ status: "failed", error: msg, ended_at: new Date().toISOString() })
          .eq("id", row.id);
        return json(502, { error: "dispatch_failed", detail: msg });
      }
    }

    if (action === "cancel") {
      const { dispatchId, roomName } = body as { dispatchId: string; roomName: string };
      if (!dispatchId || !roomName) return json(400, { error: "missing_params" });

      // Ownership check via stored row
      const { data: existing } = await admin
        .from("agent_dispatches")
        .select("id,initiator_id,room_name")
        .eq("dispatch_id", dispatchId)
        .maybeSingle();
      if (!asAdmin && existing?.initiator_id !== userId) {
        return json(403, { error: "not_initiator" });
      }

      try {
        await deleteDispatch(roomName, dispatchId);
        if (existing?.id) {
          await admin
            .from("agent_dispatches")
            .update({ status: "cancelled", ended_at: new Date().toISOString() })
            .eq("id", existing.id);
        }
        return json(200, { ok: true });
      } catch (e) {
        return json(502, { error: "cancel_failed", detail: e instanceof Error ? e.message : String(e) });
      }
    }

    if (action === "list") {
      const { roomName } = body as { roomName: string };
      if (!roomName) return json(400, { error: "missing_room" });
      const q = admin
        .from("agent_dispatches")
        .select("*")
        .eq("room_name", roomName)
        .order("created_at", { ascending: false })
        .limit(50);
      const { data, error } = asAdmin ? await q : await q.eq("initiator_id", userId!);
      if (error) return json(500, { error: error.message });
      return json(200, { ok: true, dispatches: data ?? [] });
    }

    return json(400, { error: "unknown_action" });
  } catch (e) {
    console.error("[Pkg117] unhandled:", e);
    return json(500, { error: "internal", detail: e instanceof Error ? e.message : String(e) });
  }
});
