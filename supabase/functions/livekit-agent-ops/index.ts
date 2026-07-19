// Pkg139 — Admin LiveKit Agent Dispatch Ops
//
// Read+cancel inspection of LiveKit Agent dispatches across every room.
// Companion to Pkg117 (livekit-agent) which only handles dispatch/cancel for
// the current host. Admin variant works on ANY room.
//
// Actions (admin-only via x-admin-access-token):
//   list_dispatches   { roomName? }
//   get_dispatch      { dispatchId, roomName }
//   delete_dispatch   { dispatchId, roomName }
//
// Kill-switch: app_settings.livekit_signaling_enabled.agent_ops === true (default OFF)
import { createClient } from "npm:@supabase/supabase-js@2";
import { AgentDispatchClient } from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-access-token, x-admin-token",
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

type Action = "list_dispatches" | "get_dispatch" | "delete_dispatch";
const ALLOWED: Action[] = ["list_dispatches", "get_dispatch", "delete_dispatch"];

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
    console.warn("[livekit-agent-ops] admin validate failed:", e);
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
    if (!raw) return false;
    const v = JSON.parse(raw);
    return v?.agent_ops === true;
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
    dispatchId?: string;
    agentName?: string;
    resultCount?: number;
    error?: string;
  },
) {
  try {
    await admin.from("livekit_agent_ops_log").insert({
      actor_admin_role: row.role,
      action: row.action,
      room_name: row.roomName ?? null,
      dispatch_id: row.dispatchId ?? null,
      agent_name: row.agentName ?? null,
      result_count: row.resultCount ?? null,
      error: row.error ?? null,
    });
  } catch (e) {
    console.warn("[livekit-agent-ops] audit insert failed:", e);
  }
}

function summarizeDispatch(d: any) {
  return {
    id: d?.id ?? null,
    agentName: d?.agentName ?? null,
    room: d?.room ?? null,
    metadata: d?.metadata ?? null,
    state: d?.state ?? null,
    createdAt: d?.createdAt ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_not_configured" });
  }

  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  if (!(await killSwitchOn(adminClient))) {
    return json(403, { error: "agent_ops_disabled" });
  }

  const adminToken = (req.headers.get("x-admin-access-token") ?? req.headers.get("x-admin-token") ?? "");
  if (!adminToken) return json(401, { error: "missing_admin_token" });
  const v = await validateAdminToken(adminToken);
  if (!v.ok) return json(401, { error: "invalid_admin_token" });
  const role = v.role ?? "sub_admin";

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action ?? "") as Action;
  const roomName = body?.roomName ? String(body.roomName).trim() : "";
  const dispatchId = body?.dispatchId ? String(body.dispatchId).trim() : "";

  if (!ALLOWED.includes(action)) {
    await audit(adminClient, { role, action: String(action), error: "invalid_action" });
    return json(400, { error: "invalid_action" });
  }
  if ((action === "get_dispatch" || action === "delete_dispatch") && !dispatchId) {
    await audit(adminClient, { role, action, error: "missing_dispatch_id" });
    return json(400, { error: "missing_dispatch_id" });
  }
  if ((action === "get_dispatch" || action === "delete_dispatch") && !roomName) {
    await audit(adminClient, { role, action, error: "missing_room_name" });
    return json(400, { error: "missing_room_name" });
  }

  const agent = new AgentDispatchClient(LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

  try {
    if (action === "list_dispatches") {
      // listDispatch(roomName?) — SDK shape varies; pass undefined for all rooms when missing.
      const list: any[] =
        (await (agent as any).listDispatch?.(roomName || undefined)) ?? [];
      const out = Array.isArray(list) ? list.map(summarizeDispatch) : [];
      await audit(adminClient, {
        role,
        action,
        roomName: roomName || undefined,
        resultCount: out.length,
      });
      return json(200, { dispatches: out });
    }
    if (action === "get_dispatch") {
      const list: any[] = (await (agent as any).listDispatch?.(roomName)) ?? [];
      const match = (Array.isArray(list) ? list : []).find((d: any) => d?.id === dispatchId);
      if (!match) {
        await audit(adminClient, { role, action, roomName, dispatchId, error: "not_found" });
        return json(404, { error: "dispatch_not_found" });
      }
      await audit(adminClient, {
        role,
        action,
        roomName,
        dispatchId,
        agentName: match?.agentName ?? null,
        resultCount: 1,
      });
      return json(200, { dispatch: summarizeDispatch(match) });
    }
    // delete_dispatch
    const deleted = await (agent as any).deleteDispatch(dispatchId, roomName);
    await audit(adminClient, {
      role,
      action,
      roomName,
      dispatchId,
      agentName: (deleted as any)?.agentName ?? null,
      resultCount: 1,
    });
    return json(200, { ok: true, dispatch: summarizeDispatch(deleted) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await audit(adminClient, {
      role,
      action,
      roomName: roomName || undefined,
      dispatchId: dispatchId || undefined,
      error: msg.slice(0, 500),
    });
    return json(500, { error: "livekit_error", message: msg });
  }
});
