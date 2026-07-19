// Pkg365 — Auto-dispatch AI moderator agent on every live/party room start.
//
// Called ONLY from `tg_auto_moderator_on_live_start` / `tg_auto_moderator_on_party_start`
// DB triggers via pg_net when a host inserts an active `live_streams` row or
// a `party_rooms` row. Mirrors the Pkg129 livekit-auto-record pattern.
//
// Auth: shared secret header `x-auto-moderator-secret` matching
//        `app_settings.auto_moderator_secret`.
//
// Body: { scope: 'live'|'party', scopeId: uuid, roomName: string, hostId?: uuid }
//
// Kill-switches (both must be true to dispatch):
//   • app_settings.livekit_signaling_enabled.agent          (master agent flag)
//   • app_settings.livekit_signaling_enabled.auto_moderator (this feature)
//
// Idempotent: skips if `agent_dispatches` already has a non-terminal row for
// the same (scope, scope_id, agent_name).
import { createClient } from "npm:@supabase/supabase-js@2";
import * as LK from "npm:livekit-server-sdk@2.9.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-auto-moderator-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LIVEKIT_URL = Deno.env.get("LIVEKIT_URL") ?? "";
const LIVEKIT_API_KEY = Deno.env.get("LIVEKIT_API_KEY") ?? "";
const LIVEKIT_API_SECRET = Deno.env.get("LIVEKIT_API_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const httpUrl = LIVEKIT_URL.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function createDispatch(roomName: string, agentName: string, metadata?: unknown) {
  const AnyLK = LK as unknown as Record<string, any>;
  const Client = AnyLK.AgentDispatchClient ?? AnyLK.AgentDispatchService;
  if (Client) {
    const c = new Client(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    return await c.createDispatch(roomName, agentName, {
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });
  }
  const at = new (LK as any).AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: "auto-moderator-dispatcher",
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return json(500, { error: "livekit_not_configured" });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // ---- Validate shared secret ----
  const provided = (req.headers.get("x-auto-moderator-secret") ?? "").trim();
  if (!provided) return json(401, { error: "missing_secret" });
  const { data: secretRow } = await admin
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "auto_moderator_secret")
    .maybeSingle();
  const expected = (secretRow?.setting_value ?? "").toString().trim();
  if (!expected || provided !== expected) return json(401, { error: "invalid_secret" });

  // ---- Kill-switches ----
  const { data: flagRow } = await admin
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "livekit_signaling_enabled")
    .maybeSingle();
  let agentOn = false;
  let autoModOn = false;
  try {
    const v = flagRow?.setting_value ? JSON.parse(String(flagRow.setting_value)) : {};
    agentOn = v?.agent === true;
    autoModOn = v?.auto_moderator === true;
  } catch { /* default false */ }
  if (!agentOn) return json(403, { error: "agent_disabled" });
  if (!autoModOn) return json(403, { error: "auto_moderator_disabled" });

  // ---- Resolve agent name ----
  const { data: nameRow } = await admin
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", "auto_moderator_agent_name")
    .maybeSingle();
  const agentName = ((nameRow?.setting_value ?? "moderator") as string).toString().trim() || "moderator";

  // ---- Body ----
  const body = await req.json().catch(() => ({}));
  const scope = String(body?.scope ?? "").trim() as "live" | "party";
  const scopeId = String(body?.scopeId ?? "").trim();
  const roomName = String(body?.roomName ?? "").trim();
  const hostId = body?.hostId ? String(body.hostId) : null;
  if (!["live", "party"].includes(scope)) return json(400, { error: "invalid_scope" });
  if (!scopeId) return json(400, { error: "scopeId_required" });
  if (!roomName) return json(400, { error: "roomName_required" });

  // ---- Idempotency: skip if active dispatch already exists ----
  const { data: existing } = await admin
    .from("agent_dispatches")
    .select("id,status,dispatch_id")
    .eq("scope", scope)
    .eq("scope_id", scopeId)
    .eq("agent_name", agentName)
    .in("status", ["pending", "dispatched"])
    .limit(1)
    .maybeSingle();
  if (existing) {
    return json(200, { ok: true, alreadyDispatched: true, id: existing.id, dispatchId: existing.dispatch_id });
  }

  // ---- Audit row first ----
  const { data: row, error: insErr } = await admin
    .from("agent_dispatches")
    .insert({
      scope,
      scope_id: scopeId,
      room_name: roomName,
      agent_name: agentName,
      initiator_id: hostId,
      initiator_role: "auto",
      status: "pending",
      metadata: { source: "auto_dispatch", trigger: scope === "live" ? "live_stream_start" : "party_room_start" },
    })
    .select()
    .single();
  if (insErr || !row) return json(500, { error: "audit_insert_failed", detail: insErr?.message });

  try {
    const dispatched: any = await createDispatch(roomName, agentName, {
      auto: true,
      scope,
      scopeId,
    });
    const dispatchId = dispatched?.id ?? dispatched?.dispatch_id ?? null;
    await admin
      .from("agent_dispatches")
      .update({ status: "dispatched", dispatch_id: dispatchId })
      .eq("id", row.id);
    return json(200, { ok: true, id: row.id, dispatchId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[Pkg365] dispatch failed:", msg);
    await admin
      .from("agent_dispatches")
      .update({ status: "failed", error: msg, ended_at: new Date().toISOString() })
      .eq("id", row.id);
    return json(502, { error: "dispatch_failed", detail: msg });
  }
});
